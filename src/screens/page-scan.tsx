import Animated, { FlipInYLeft, ZoomIn, useAnimatedRef } from 'react-native-reanimated';
import { useChromeScroll } from '@/components/scroll-chrome';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Button, ButtonRow, C, CardArt, CardCaption, ErrorNotice, Icon, IconButton, pressFx, R, S, SearchBox, Segmented, Txt, tick, ui } from '@/components/pokedex-ui';
import { fetchCard, setForCard, type ScanCandidate } from '@/lib/catalog';
import { canRecognize, compareCardArtwork, recognizeCard, refineCard } from '@/lib/scanner';
import { searchAnyLanguage, type ScanLanguage } from '@/lib/language-detect';
import { identifyProgressively } from '@/lib/scan-pipeline';
import { pokemonIds } from '@/lib/card-kind';
import { useCollection } from '@/lib/collection-context';
import { defaultFinish, discoveredIds, type Card, type CardBrief } from '@/lib/model';
import { useAddCards, type AddedCards } from '@/lib/use-add-cards';
import { LiveCamera, type LiveMatch, type LivePhoto } from '@/components/live-camera';
import type { Crop } from '@/lib/scan-types';
import { PAGE_LAYOUTS, pageSummary, pocketCrops, pocketIncluded, pocketStatus, waitingPocket, type PageLayout, type Pocket } from '@/lib/page-scan';

type Photo = { uri: string; width: number; height: number; region?: Crop };
const detailKey = (card: CardBrief) => `${card.language}:${card.id}`;
// Picture comparison downloads reference art. On a full page it must not hold up the next pocket.
const COMPARE_LIMIT_MS = 3000;
function quickCompare(uri: string, candidates: ScanCandidate[]) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    compareCardArtwork(uri, candidates),
    new Promise<ScanCandidate[]>(resolve => { timer = setTimeout(() => resolve(candidates), COMPARE_LIMIT_MS); }),
  ]).finally(() => clearTimeout(timer));
}

/** Read every pocket of one binder page, then add the confirmed cards together. */
export function PageScan({ header, language, captureRequest, livePhoto, onCardPhoto, onAdded }: {
  header: ReactNode; language: ScanLanguage; captureRequest: number;
  /** A page photo already taken in the camera, read as soon as this opens. */
  livePhoto?: LivePhoto | null;
  /** The camera was switched to one card before its photo was taken. */
  onCardPhoto: (photo: LivePhoto, match?: LiveMatch) => void;
  onAdded: (added: AddedCards) => void;
}) {
  const scroll = useChromeScroll();
  const list = useAnimatedRef<Animated.ScrollView>();
  // Where the content starts inside the scroller, and whether a newly opened pocket still needs scrolling to.
  const contentTop = useRef(0);
  const revealPanel = useRef(false);
  const { trainer } = useCollection();
  const addCards = useAddCards();
  const [layout, setLayout] = useState<PageLayout>(PAGE_LAYOUTS[0]);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [pockets, setPockets] = useState<Pocket[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<string, Card>>({});
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [gridWidth, setGridWidth] = useState(0);
  const [liveOpen, setLiveOpen] = useState(false);
  const generation = useRef(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current++; }; }, []);
  // "Scan the next page" from the celebration opens the camera straight away.
  const handledCapture = useRef(captureRequest);
  useEffect(() => {
    if (captureRequest === handledCapture.current) return;
    handledCapture.current = captureRequest;
    void takePhoto();
  }, [captureRequest]);
  useEffect(() => { if (livePhoto) acceptLive(livePhoto); }, []);
  const discovered = useMemo(() => discoveredIds(trainer), [trainer]);
  const summary = pageSummary(pockets);

  function updatePocket(index: number, change: Partial<Pocket>) {
    setPockets(current => current.map((pocket, i) => i === index ? { ...pocket, ...change } : pocket));
  }
  // Card details reveal new Pokémon before adding, and make the final add quick.
  function loadDetails(card: CardBrief) {
    const key = detailKey(card);
    const saved = trainer.entries.find(e => detailKey(e.card) === key)?.card;
    if (saved) { setDetails(current => ({ ...current, [key]: saved })); return; }
    fetchCard(card).then(full => alive.current && setDetails(current => ({ ...current, [key]: full }))).catch(() => {});
  }
  async function readPage(next: Photo, pageLayout: PageLayout) {
    const id = ++generation.current;
    const crops = pocketCrops(pageLayout, next.region);
    setPockets(crops.map(waitingPocket)); setSelected(null); setError(null); setNote(null);
    if (!canRecognize) { setNote('Page photo ready. Automatic reading works in the installed iPhone/iPad app.'); return; }
    setBusy(true);
    const isCurrent = () => alive.current && generation.current === id;
    for (const [index, crop] of crops.entries()) {
      if (!isCurrent()) return;
      updatePocket(index, { status: 'reading' });
      let text = '';
      let matches: Pocket['matches'] = [];
      let photoUri: string | undefined;
      try {
        await identifyProgressively({ recognize: recognizeCard, refine: refineCard, compare: quickCompare },
          { uri: next.uri, language, crop, filter: 'all' }, (scan, found) => { text = scan.text; matches = found; photoUri = scan.photoUri; }, isCurrent);
      } catch { /* An unreadable pocket should not stop the rest of the page. */ }
      if (!isCurrent()) return;
      const status = pocketStatus(text, matches);
      const top = matches[0]?.card;
      const choice = top ? { ...top, ...(!top.image && photoUri ? { localImage: photoUri } : {}) } : null;
      updatePocket(index, { status, matches, choice, photoUri });
      if (choice) loadDetails(choice);
      if (status === 'match') tick();
    }
    if (isCurrent()) setBusy(false);
  }
  async function takePhoto(library = false, system = false) {
    if (busy || adding) return;
    setError(null);
    if (!library && !system && Platform.OS !== 'web') { setLiveOpen(true); return; }
    setLiveOpen(false);
    try {
      if (!library) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { setNote('Camera access is off. Pick a photo of the page instead.'); return; }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false };
      const result = library ? await ImagePicker.launchImageLibraryAsync(options) : await ImagePicker.launchCameraAsync(options);
      if (result.canceled || !alive.current) return;
      const asset = result.assets[0];
      const next = { uri: asset.uri, width: asset.width, height: asset.height };
      setPhoto(next);
      await readPage(next, layout);
    } catch (e) {
      console.warn('Page photo failed', e);
      if (alive.current) { setBusy(false); setError("Oops! That didn't work. Try again."); }
    }
  }
  // A photo picker can only open once the camera sheet has finished sliding away.
  const afterLive = useRef<(() => void) | null>(null);
  function leaveLive(next: () => void) {
    if (Platform.OS !== 'ios') { next(); return; }
    afterLive.current = next; setLiveOpen(false);
  }
  function openPocket(index: number) {
    tick();
    revealPanel.current = selected !== index;
    setSelected(current => current === index ? null : index);
  }
  function acceptLive(next: LivePhoto, match?: LiveMatch) {
    setLiveOpen(false);
    if (!next.page) { onCardPhoto(next, match); return; }
    setLayout(next.page); setPhoto(next);
    void readPage(next, next.page);
  }
  function changeLayout(next: PageLayout) {
    if (busy || adding || next.id === layout.id) return;
    setLayout(next);
    if (photo) void readPage(photo, next);
  }
  function choose(index: number, card: CardBrief) {
    const pocket = pockets[index];
    const choice = { ...card, ...(!card.image && pocket.photoUri ? { localImage: pocket.photoUri } : {}) };
    updatePocket(index, { choice, confirmed: true, skipped: false });
    loadDetails(choice);
  }
  async function addPage() {
    const chosen = pockets.filter(pocketIncluded).map(p => p.choice!);
    if (!chosen.length || adding) return;
    setAdding(true); setError(null);
    try {
      const cards = await Promise.all(chosen.map(async card => {
        const full = details[detailKey(card)] ?? await fetchCard(card);
        return { card: { ...full, ...(card.localImage ? { localImage: card.localImage } : {}) }, finish: defaultFinish(full), quantity: 1 };
      }));
      const added = await addCards(cards);
      if (!alive.current) return;
      generation.current++;
      setPhoto(null); setPockets([]); setSelected(null);
      setNote(`${cards.length} ${cards.length === 1 ? 'card' : 'cards'} added. Turn the page and scan the next one!`);
      onAdded(added);
    } catch (e) {
      console.warn('Adding page cards failed', e);
      if (alive.current) setError("Oops! That didn't work. Try again.");
    } finally { if (alive.current) setAdding(false); }
  }

  const gap = S.sm;
  const tileWidth = gridWidth ? Math.floor((gridWidth - 2 * S.sm - gap * (layout.columns - 1)) / layout.columns) : 0;
  const [rx, ry, rw, rh] = photo?.region ?? [0, 0, 1, 1];
  const pocketAspect = photo ? (photo.width * rw / layout.columns) / (photo.height * rh / layout.rows) : .716;
  // Tiles have a 3pt border, so the page slice fills the space inside it.
  const innerWidth = Math.max(0, tileWidth - 6), innerHeight = innerWidth / pocketAspect;
  // Show each pocket's slice of the page right away; the matched card flips in over it.
  const slice = (index: number, width: number, height: number) => {
    if (!photo) return null;
    const fullWidth = width * layout.columns / rw, fullHeight = height * layout.rows / rh;
    return <Image source={photo.uri} contentFit="fill" style={{
      position: 'absolute', width: fullWidth, height: fullHeight,
      left: -rx * fullWidth - (index % layout.columns) * width, top: -ry * fullHeight - Math.floor(index / layout.columns) * height,
    }} />;
  };
  const active = selected !== null ? pockets[selected] : null;
  const guidePocket = layout.rows > 3 ? 36 : layout.columns === 2 ? 52 : 44;
  const helper = summary.toCheck ? `Tap the ? ${summary.toCheck === 1 ? 'card to check it' : 'cards to check them'}.` : summary.ready ? 'All set! Tap a card to change it.' : 'No cards found yet. Tap a card to change it.';

  return <><Modal visible={liveOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setLiveOpen(false)} onDismiss={() => { const next = afterLive.current; afterLive.current = null; next?.(); }}>
    {liveOpen && <LiveCamera mode="page" layout={layout} language={language} onCapture={acceptLive} onFallback={() => leaveLive(() => takePhoto(false, true))} onLibrary={() => leaveLive(() => takePhoto(true))} onClose={() => setLiveOpen(false)} />}
  </Modal><Animated.ScrollView ref={list} {...scroll} contentContainerStyle={[s.list, scroll.contentContainerStyle]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <View onLayout={e => { contentTop.current = e.nativeEvent.layout.y; }} style={{ gap: S.lg }}>
      {header}
      <View style={{ gap: S.sm }}>
        <Txt accessibilityRole="header" variant="label">How many cards on a page?</Txt>
        <Segmented label="How many cards on a page?" options={PAGE_LAYOUTS} value={layout.id} onChange={id => changeLayout(PAGE_LAYOUTS.find(option => option.id === id)!)} />
      </View>
      {!photo ? <>
        <View style={s.capture}>
          <View style={[s.pageGuide, { width: guidePocket * layout.columns + 5 * (layout.columns + 1) + 4 }]}>{pocketCrops(layout).map((_, index) => <View key={index} style={[s.guidePocket, { width: guidePocket, height: guidePocket / .716 }]}><Image source={require('../../assets/crafted/pokeball.png')} style={{ width: guidePocket * .45, height: guidePocket * .45, opacity: .55 }} contentFit="contain" /></View>)}</View>
          <Txt variant="label" style={{ color: '#D6E3CB', marginTop: S.md, textAlign: 'center' }}>Fill the photo with one binder page</Txt>
          <Txt variant="caption" style={{ color: '#A0B296', textAlign: 'center' }}>Hold the phone flat above the page. Tilt a little if the sleeves shine.</Txt>
        </View>
        <ButtonRow><Button title="Take a photo" icon="camera" onPress={() => takePhoto()} disabled={busy || adding} /><Button title="Pick from Photos" icon="photo" secondary onPress={() => takePhoto(true)} disabled={busy || adding} /></ButtonRow>
      </> : <View onLayout={e => setGridWidth(e.nativeEvent.layout.width)} style={[s.grid, { gap }]}>
        {tileWidth > 0 && pockets.map((pocket, index) => {
          const card = pocket.choice ? details[detailKey(pocket.choice)] : undefined;
          const included = pocketIncluded(pocket);
          const isNew = !!card && included && pokemonIds(card).some(id => !discovered.has(id));
          const faded = pocket.skipped || pocket.status === 'empty';
          const toCheck = !pocket.skipped && !included && (pocket.status === 'check' || pocket.status === 'unreadable');
          const label = pocket.status === 'reading' || pocket.status === 'waiting' ? `Pocket ${index + 1}, reading` : pocket.skipped ? `Pocket ${index + 1}, skipped` : pocket.choice ? `Pocket ${index + 1}, ${pocket.choice.name}${included ? '' : ', needs checking'}` : `Pocket ${index + 1}, ${pocket.status === 'empty' ? 'empty' : 'not recognized'}`;
          return <Pressable key={index} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: selected === index }} disabled={pocket.status === 'waiting' || pocket.status === 'reading'} onPress={() => openPocket(index)} style={({ pressed }) => [s.tile, { width: tileWidth, height: innerHeight + 6 }, toCheck && s.tileCheck, selected === index && s.tileSelected, pressed && { transform: [{ scale: .96 }] }]}>
            {slice(index, innerWidth, innerHeight)}
            {pocket.choice && !pocket.skipped && <Animated.View entering={FlipInYLeft.duration(420)} style={s.reveal}><CardArt card={pocket.choice} style={{ height: '100%', maxWidth: '100%' }} /></Animated.View>}
            {faded && <View style={s.fade} />}
            {pocket.status === 'reading' && <View style={s.scanning}><ActivityIndicator color="white" /></View>}
            {pocket.status === 'waiting' && <View style={s.waiting} />}
            {!pocket.skipped && pocket.status !== 'waiting' && pocket.status !== 'reading' && pocket.status !== 'empty' && <Animated.View entering={ZoomIn.delay(250)} style={[s.status, { backgroundColor: included ? '#3E8E4E' : C.gold }]}>{included ? <Icon name="check" size={16} color="white" /> : <Txt maxFontSizeMultiplier={1} style={{ fontWeight: '900', fontSize: 15, lineHeight: 19, color: C.ink }}>?</Txt>}</Animated.View>}
            {isNew && <Animated.View entering={ZoomIn.delay(420).springify()} style={s.newSlot}><View style={s.newTag}><Txt maxFontSizeMultiplier={1} style={s.newText}>NEW!</Txt></View></Animated.View>}
          </Pressable>;
        })}
      </View>}
      {busy && <View accessibilityLiveRegion="polite" style={s.tip}><ActivityIndicator size="small" color={C.muted} /><Txt muted style={{ flex: 1, fontSize: 14 }}>Reading pocket {Math.min(pockets.length, pockets.length - summary.reading + 1)} of {pockets.length}…</Txt></View>}
      {active && selected !== null && <View key={selected} onLayout={e => {
        // Opening a pocket scrolls its panel into view, otherwise it lands below the fold and the tap seems to do nothing.
        if (!revealPanel.current) return;
        revealPanel.current = false;
        list.current?.scrollTo({ y: Math.max(0, contentTop.current + e.nativeEvent.layout.y - S.md), animated: true });
      }}><PocketPanel index={selected} pocket={active} slice={slice(selected, 120, 120 / pocketAspect)} aspect={pocketAspect}
        onChoose={card => choose(selected, card)} onSkip={() => { updatePocket(selected, { skipped: !active.skipped }); }} onClose={() => setSelected(null)} /></View>}
      <ErrorNotice text={error} />
      {note && <View style={s.note}><Txt variant="caption">{note}</Txt></View>}
      {photo && !busy && pockets.length > 0 && <>
        <Txt accessibilityLiveRegion="polite" variant="label" style={s.helper}>{helper}</Txt>
        <Button title={summary.ready ? `Add ${summary.ready} ${summary.ready === 1 ? 'card' : 'cards'}` : 'No cards ready yet'} icon="plus" disabled={!summary.ready} busy={adding} onPress={addPage} />
      </>}
      {photo && <Button title="Scan another page" icon="camera" secondary onPress={() => takePhoto()} disabled={busy || adding} />}
    </View>
  </Animated.ScrollView></>;
}

function PocketPanel({ index, pocket, slice, aspect, onChoose, onSkip, onClose }: { index: number; pocket: Pocket; slice: ReactNode; aspect: number; onChoose: (card: CardBrief) => void; onSkip: () => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const { fontScale } = useWindowDimensions();
  const results = useMemo(() => query.trim() ? searchAnyLanguage(query, pocket.choice?.language ?? null, 12) : pocket.matches.slice(0, 6).map(m => m.card), [query, pocket]);
  const included = pocketIncluded(pocket);
  const options = !!query || results.length > 1;
  return <View style={s.panel}>
    <View style={ui.between}><Txt accessibilityRole="header" variant="subtitle" style={{ flex: 1, minWidth: 0 }}>Pocket {index + 1}</Txt><IconButton round icon="close" label="Close" onPress={onClose} /></View>
    <View style={s.pocketSummary}>
      <View style={{ alignItems: 'center', gap: S.xs }}><View style={[s.panelSlice, { width: 120, height: 120 / aspect }]}>{slice}</View><Txt muted variant="caption">Your card</Txt></View>
      <View style={[s.pocketCopy, { flexBasis: 152 * Math.min(fontScale, 1.4) }]}>
        {pocket.choice && !pocket.skipped ? <><CardCaption name={pocket.choice.name} setName={setForCard(pocket.choice)?.name ?? pocket.choice.id} detail={`#${pocket.choice.localId}`} />
          {included ? <View style={[ui.row, { gap: S.xs }]}><Icon name="check" size={18} color="#3E7A48" /><Txt variant="label" style={{ flex: 1, minWidth: 0, color: '#3E7A48' }}>Ready to add</Txt></View> : <Txt variant="label">Is this your card?</Txt>}</>
          : <Txt variant="caption">{pocket.skipped ? 'This one will be skipped.' : pocket.status === 'empty' ? 'This pocket looks empty.' : "Hmm, we can't read this one. Type its name below."}</Txt>}
      </View>
    </View>
    <ButtonRow>
      {pocket.choice && !pocket.skipped && !included && <Button size="medium" title="Yes, that's it!" icon="check" onPress={() => onChoose(pocket.choice!)} />}
      <Button size="medium" title={pocket.skipped ? 'Put it back' : 'Skip it'} secondary onPress={onSkip} />
    </ButtonRow>
    {options && <Txt variant="label">{query ? (results.length ? 'Search results' : 'No matching cards') : 'Is it one of these?'}</Txt>}
    {options && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>{results.map(card => {
      const current = pocket.choice?.id === card.id && pocket.choice.language === card.language && !pocket.skipped;
      return <Pressable key={`${card.language}:${card.id}`} accessibilityRole="button" accessibilityLabel={`Choose ${card.name} ${card.localId}`} accessibilityState={{ selected: current }} onPress={() => { tick(); onChoose(card); }} style={state => [s.option, current && { borderColor: C.ink }, pressFx(state)]}><CardArt card={card} /><CardCaption name={card.name} setName={setForCard(card)?.name ?? card.id} detail={`#${card.localId}`} /></Pressable>;
    })}</ScrollView>}
    <SearchBox value={query} onChange={setQuery} placeholder="Type the Pokémon's name" />
  </View>;
}

const s = StyleSheet.create({
  list: { padding: S.xl, paddingBottom: 40 },
  capture: { minHeight: 245, backgroundColor: '#2C4037', borderRadius: 19, alignItems: 'center', justifyContent: 'center', padding: 20, gap: S.xs },
  pageGuide: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, padding: 5, borderRadius: 8, borderWidth: 2, borderColor: '#86B99A' },
  guidePocket: { aspectRatio: .716, borderRadius: 5, borderWidth: 1, borderColor: '#5E8B6E', backgroundColor: '#35503F', alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', padding: S.sm, backgroundColor: '#2C4037', borderRadius: R.lg },
  tile: { overflow: 'hidden', borderRadius: R.sm + 2, backgroundColor: '#1F2F27', borderWidth: 3, borderColor: 'transparent' },
  tileCheck: { borderColor: C.gold },
  tileSelected: { borderColor: 'white' },
  reveal: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1F2F27' },
  fade: { position: 'absolute', inset: 0, backgroundColor: '#1F2F27B0' },
  scanning: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#57C7E855', borderWidth: 2, borderColor: C.blue, borderRadius: 6 },
  waiting: { position: 'absolute', inset: 0, backgroundColor: '#1F2F2766' },
  status: { position: 'absolute', top: 4, right: 4, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'white' },
  newSlot: { position: 'absolute', left: 4, bottom: 4 },
  newTag: { backgroundColor: C.red, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6, borderWidth: 1.5, borderColor: 'white', transform: [{ rotate: '-4deg' }] },
  newText: { fontWeight: '900', fontSize: 10, lineHeight: 13, color: 'white', letterSpacing: .4 },
  helper: { textAlign: 'center' },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  note: { padding: S.md, backgroundColor: '#DEE8D1', borderRadius: R.md, gap: S.xs },
  panel: { padding: S.lg, gap: S.md, backgroundColor: '#FAFCF6', borderRadius: R.lg, borderWidth: 1, borderColor: C.line },
  pocketSummary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: S.md },
  pocketCopy: { flexGrow: 1, maxWidth: '100%', minWidth: 0, gap: S.sm },
  panelSlice: { overflow: 'hidden', borderRadius: R.sm, backgroundColor: '#1F2F27' },
  option: { width: 128, padding: S.xs, borderRadius: R.md, borderWidth: 2, borderColor: 'transparent' },
});
