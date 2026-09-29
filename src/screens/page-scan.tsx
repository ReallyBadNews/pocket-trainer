import Animated, { FlipInYLeft, ZoomIn } from 'react-native-reanimated';
import { useChromeScroll } from '@/components/scroll-chrome';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, C, CardArt, Chip, ErrorNotice, Icon, SearchBox, Txt, ui } from '@/components/pokedex-ui';
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
      if (status === 'match') Haptics.selectionAsync().catch(() => {});
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
        if (!permission.granted) { setNote('Camera access is off. You can choose a photo of the page instead.'); return; }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false };
      const result = library ? await ImagePicker.launchImageLibraryAsync(options) : await ImagePicker.launchCameraAsync(options);
      if (result.canceled || !alive.current) return;
      const asset = result.assets[0];
      const next = { uri: asset.uri, width: asset.width, height: asset.height };
      setPhoto(next);
      await readPage(next, layout);
    } catch (e) {
      if (alive.current) { setBusy(false); setError(e instanceof Error ? e.message : 'The page could not be read. Try another photo.'); }
    }
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
    Haptics.selectionAsync().catch(() => {});
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
      if (alive.current) setError(e instanceof Error ? e.message : 'These cards could not be added. Check your connection and try again.');
    } finally { if (alive.current) setAdding(false); }
  }

  const gap = 8;
  const tileWidth = gridWidth ? Math.floor((gridWidth - 16 - gap * (layout.columns - 1)) / layout.columns) : 0;
  const [rx, ry, rw, rh] = photo?.region ?? [0, 0, 1, 1];
  const pocketAspect = photo ? (photo.width * rw / layout.columns) / (photo.height * rh / layout.rows) : .716;
  const tileHeight = tileWidth / pocketAspect;
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

  return <><Modal visible={liveOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setLiveOpen(false)}>
    {liveOpen && <LiveCamera mode="page" layout={layout} language={language} onCapture={acceptLive} onFallback={() => takePhoto(false, true)} onClose={() => setLiveOpen(false)} />}
  </Modal><Animated.ScrollView {...scroll} contentContainerStyle={[s.list, scroll.contentContainerStyle]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
    <View style={{ gap: 16 }}>
      {header}
      <View style={{ gap: 8 }}>
        <Txt style={{ fontWeight: '700', fontSize: 13 }}>Pockets on each page</Txt>
        <View style={[ui.row, { flexWrap: 'wrap' }]}>{PAGE_LAYOUTS.map(option => <Chip key={option.id} label={option.label} selected={layout.id === option.id} onPress={() => changeLayout(option)} />)}</View>
      </View>
      {!photo ? <View style={s.capture}>
        <View style={[s.pageGuide, { width: guidePocket * layout.columns + 5 * (layout.columns + 1) + 4 }]}>{pocketCrops(layout).map((_, index) => <View key={index} style={[s.guidePocket, { width: guidePocket, height: guidePocket / .716 }]}><Image source={require('../../assets/crafted/pokeball.png')} style={{ width: guidePocket * .45, height: guidePocket * .45, opacity: .55 }} contentFit="contain" /></View>)}</View>
        <Txt style={{ color: '#D6E3CB', fontWeight: '700', fontSize: 14, marginTop: 12 }}>Fill the photo with one binder page</Txt>
        <Txt style={{ color: '#A0B296', fontSize: 12, textAlign: 'center' }}>Hold the phone flat above the page. Tilt a little if the sleeves shine.</Txt>
      </View> : <View onLayout={e => setGridWidth(e.nativeEvent.layout.width)} style={[s.grid, { gap }]}>
        {tileWidth > 0 && pockets.map((pocket, index) => {
          const card = pocket.choice ? details[detailKey(pocket.choice)] : undefined;
          const isNew = !!card && pocketIncluded(pocket) && pokemonIds(card).some(id => !discovered.has(id));
          const faded = pocket.skipped || pocket.status === 'empty';
          const label = pocket.status === 'reading' || pocket.status === 'waiting' ? `Pocket ${index + 1}, reading` : pocket.skipped ? `Pocket ${index + 1}, skipped` : pocket.choice ? `Pocket ${index + 1}, ${pocket.choice.name}${pocketIncluded(pocket) ? '' : ', needs checking'}` : `Pocket ${index + 1}, ${pocket.status === 'empty' ? 'empty' : 'not recognized'}`;
          return <Pressable key={index} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: selected === index }} disabled={pocket.status === 'waiting' || pocket.status === 'reading'} onPress={() => setSelected(current => current === index ? null : index)} style={[s.tile, { width: tileWidth, height: tileHeight }, selected === index && s.tileSelected]}>
            {slice(index, tileWidth, tileHeight)}
            {pocket.choice && !pocket.skipped && <Animated.View entering={FlipInYLeft.duration(420)} style={[s.reveal, !pocketIncluded(pocket) && { opacity: .55 }]}><CardArt card={pocket.choice} style={{ height: '100%', maxWidth: '100%' }} /></Animated.View>}
            {faded && <View style={s.fade} />}
            {pocket.status === 'reading' && <View style={s.scanning}><ActivityIndicator color="white" /></View>}
            {pocket.status === 'waiting' && <View style={s.waiting} />}
            {!pocket.skipped && pocket.status !== 'waiting' && pocket.status !== 'reading' && pocket.status !== 'empty' && <Animated.View entering={ZoomIn.delay(250)} style={[s.status, pocketIncluded(pocket) ? { backgroundColor: '#3E8E4E' } : { backgroundColor: C.gold }]}>{pocketIncluded(pocket) ? <Icon name="check" size={15} color="white" /> : <Txt style={{ fontWeight: '900', fontSize: 14, lineHeight: 18, color: C.ink }}>?</Txt>}</Animated.View>}
            {isNew && <Animated.View entering={ZoomIn.delay(420).springify()} style={s.newSlot}><View style={s.newTag}><Txt style={s.newText}>NEW!</Txt></View></Animated.View>}
          </Pressable>;
        })}
      </View>}
      {busy && <View accessibilityLiveRegion="polite" style={s.tip}><ActivityIndicator size="small" color={C.muted} /><Txt muted style={{ flex: 1, fontSize: 12 }}>Reading pocket {Math.min(pockets.length, pockets.length - summary.reading + 1)} of {pockets.length}…</Txt></View>}
      {active && selected !== null && <PocketPanel index={selected} pocket={active} slice={slice(selected, 120, 120 / pocketAspect)} aspect={pocketAspect}
        onChoose={card => choose(selected, card)} onSkip={() => { updatePocket(selected, { skipped: !active.skipped }); }} onClose={() => setSelected(null)} />}
      <View style={ui.row}><Button title={photo ? 'New page photo' : 'Take a photo'} icon="camera" onPress={() => takePhoto()} disabled={busy || adding} style={{ flex: 1 }} /><Button title="Choose photo" icon="photo" secondary onPress={() => takePhoto(true)} disabled={busy || adding} style={{ flex: 1 }} /></View>
      <ErrorNotice text={error} />
      {note && <View style={s.note}><Txt style={{ fontSize: 13, lineHeight: 20 }}>{note}</Txt></View>}
      {photo && !busy && pockets.length > 0 && <View style={{ gap: 10 }}>
        <Txt muted style={{ fontSize: 12, textAlign: 'center' }}>{summary.toCheck ? `Tap the yellow ${summary.toCheck === 1 ? 'pocket' : 'pockets'} to check ${summary.toCheck === 1 ? 'it' : 'them'}. ` : ''}Tap any card to change it or skip it.</Txt>
        <Button title={summary.ready ? `Add ${summary.ready} ${summary.ready === 1 ? 'card' : 'cards'} to binder` : 'No cards ready yet'} icon="plus" disabled={!summary.ready} busy={adding} onPress={addPage} />
      </View>}
    </View>
  </Animated.ScrollView></>;
}

function PocketPanel({ index, pocket, slice, aspect, onChoose, onSkip, onClose }: { index: number; pocket: Pocket; slice: ReactNode; aspect: number; onChoose: (card: CardBrief) => void; onSkip: () => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => query.trim() ? searchAnyLanguage(query, pocket.choice?.language ?? null, 12) : pocket.matches.slice(0, 6).map(m => m.card), [query, pocket]);
  const included = pocketIncluded(pocket);
  return <View style={s.panel}>
    <View style={ui.between}><Txt style={ui.subtitle}>Pocket {index + 1}</Txt><Pressable accessibilityRole="button" accessibilityLabel="Close pocket" onPress={onClose} style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="close" size={20} /></Pressable></View>
    <View style={[ui.row, { alignItems: 'flex-start' }]}>
      <View style={{ alignItems: 'center', gap: 4 }}><View style={[s.panelSlice, { width: 120, height: 120 / aspect }]}>{slice}</View><Txt muted style={{ fontSize: 11 }}>Your card</Txt></View>
      <View style={{ flex: 1, gap: 6 }}>
        {pocket.choice && !pocket.skipped ? <><Txt style={{ fontWeight: '800' }}>{pocket.choice.name}</Txt><Txt muted style={{ fontSize: 12, lineHeight: 18 }}>{setForCard(pocket.choice)?.name ?? pocket.choice.id} · #{pocket.choice.localId}</Txt>
          {included ? <Txt style={{ fontSize: 12, color: '#3E7A48', fontWeight: '700' }}>Ready to add</Txt> : <Button title="Yes, that's it" icon="check" onPress={() => onChoose(pocket.choice!)} />}</>
          : <Txt muted style={{ fontSize: 13, lineHeight: 19 }}>{pocket.skipped ? 'This pocket will be skipped.' : pocket.status === 'empty' ? 'This pocket looks empty.' : "We couldn't read this card. Search for it below."}</Txt>}
        <Button title={pocket.skipped ? 'Add this pocket' : 'Skip this pocket'} secondary onPress={onSkip} />
      </View>
    </View>
    {(query || results.length > 1) && <Txt style={{ fontWeight: '700', fontSize: 13 }}>{query ? (results.length ? 'Search results' : 'No matching cards') : 'Or maybe one of these?'}</Txt>}
    {(query || results.length > 1) && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>{results.map(card => {
      const current = pocket.choice?.id === card.id && pocket.choice.language === card.language && !pocket.skipped;
      return <Pressable key={`${card.language}:${card.id}`} accessibilityRole="button" accessibilityLabel={`Choose ${card.name} ${card.localId}`} onPress={() => onChoose(card)} style={[s.option, current && { borderColor: C.ink }]}><CardArt card={card} style={{ width: 92 }} /><Txt numberOfLines={1} style={{ fontSize: 11, fontWeight: '700', width: 92 }}>{card.name}</Txt><Txt muted numberOfLines={1} style={{ fontSize: 10, width: 92 }}>#{card.localId} · {setForCard(card)?.name ?? card.id}</Txt></Pressable>;
    })}</ScrollView>}
    <SearchBox value={query} onChange={setQuery} placeholder={pocket.choice ? "Wrong card? Search name or number" : "Card name, set, or number"} />
  </View>;
}

const s = StyleSheet.create({
  list: { padding: 20, paddingBottom: 40 },
  capture: { minHeight: 245, backgroundColor: '#2C4037', borderRadius: 19, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 2 },
  pageGuide: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, padding: 5, borderRadius: 8, borderWidth: 2, borderColor: '#86B99A' },
  guidePocket: { aspectRatio: .716, borderRadius: 5, borderWidth: 1, borderColor: '#5E8B6E', backgroundColor: '#35503F', alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 8, marginHorizontal: -8, backgroundColor: '#2C4037', borderRadius: 16 },
  tile: { overflow: 'hidden', borderRadius: 8, backgroundColor: '#1F2F27', borderWidth: 2, borderColor: 'transparent' },
  tileSelected: { borderColor: C.gold },
  reveal: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1F2F27' },
  fade: { position: 'absolute', inset: 0, backgroundColor: '#1F2F27B0' },
  scanning: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#57C7E855', borderWidth: 2, borderColor: C.blue, borderRadius: 6 },
  waiting: { position: 'absolute', inset: 0, backgroundColor: '#1F2F2766' },
  status: { position: 'absolute', top: 5, right: 5, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'white' },
  newSlot: { position: 'absolute', bottom: 6, left: 0, right: 0, alignItems: 'center' },
  newTag: { backgroundColor: C.gold, paddingHorizontal: 8, paddingVertical: 1, borderRadius: 8, borderWidth: 2, borderColor: 'white', transform: [{ rotate: '-6deg' }] },
  newText: { fontWeight: '900', fontSize: 12, lineHeight: 16, color: C.redDark, letterSpacing: .5 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  note: { padding: 14, backgroundColor: '#DEE8D1', borderRadius: 12, gap: 3 },
  panel: { padding: 14, gap: 10, backgroundColor: '#FAFCF6', borderRadius: 16, borderWidth: 1, borderColor: C.line },
  panelSlice: { overflow: 'hidden', borderRadius: 8, backgroundColor: '#1F2F27' },
  option: { gap: 3, padding: 4, borderRadius: 10, borderWidth: 2, borderColor: 'transparent' },
});
