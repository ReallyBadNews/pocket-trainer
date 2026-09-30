import Animated from 'react-native-reanimated';
import { useChromeScroll } from '@/components/scroll-chrome';
import { ZoomablePhoto } from '@/components/zoomable-photo';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, ButtonRow, C, CardArt, Chip, ErrorNotice, Icon, pressFx, S, SearchBox, Segmented, Txt, ui } from '@/components/pokedex-ui';
import { fetchCard, needsScanRefinement, scanCandidates, searchCards, setForCard, ENERGY_SEARCHES, type ScanCandidate } from '@/lib/catalog';
import { canRecognize, recognizeCard, compareCardArtwork, refineCard } from '@/lib/scanner';
import { LANGUAGES, LANGUAGE_LABELS, PARTIAL_CATALOGS } from '@/lib/languages';
import { searchAnyLanguage, type ScanLanguage } from '@/lib/language-detect';
import { ManualCardForm } from '@/components/manual-card-form';
import { defaultFinish, type Card, type CardBrief, type Language } from '@/lib/model';
import { useCollection } from '@/lib/collection-context';
import { useAddCards, type AddedCards } from '@/lib/use-add-cards';
import { CardCrop } from '@/components/card-crop';
import { fullCrop, type Crop, type ScanResult } from '@/lib/scan-types';

import { CARD_FILTERS, cardKindLabel, scanTypeHint, type CardFilter } from '@/lib/card-kind';
import { identifyProgressively, type ScanStage } from '@/lib/scan-pipeline';
import { CardPriceTag } from '@/components/card-values';
import { PageScan } from './page-scan';
import { LiveCamera, type LiveMatch, type LivePhoto } from '@/components/live-camera';

const MATCH_NOTE = 'Do the picture and bottom number match? Tap your card.';
const OOPS = "Oops! That didn't work. Try again.";
const MODES = [{ id: 'card', label: 'One card', icon: 'scan' }, { id: 'page', label: 'Binder page', icon: 'binder' }] as const;

type ScanScreenProps = { onCard: (card: CardBrief, draft?: Card) => void; onAdded: (added: AddedCards, source: 'card' | 'page') => void; captureRequest: number; initialQuery?: string; sessionId: number };
type LanguageChoice = { autoLanguage: boolean; setAutoLanguage: (auto: boolean) => void; language: Language; setLanguage: (language: Language) => void };

export function ScanScreen({ sessionId, ...props }: ScanScreenProps) {
  // Auto-detect reads the language from each photo; `language` is the one in use.
  const [autoLanguage, setAutoLanguage] = useState(true);
  const [language, setLanguage] = useState<Language>('en');
  // Keep the language between cards; a saved card starts a fresh scan session.
  return <ScanSession key={sessionId} {...props} autoLanguage={autoLanguage} setAutoLanguage={setAutoLanguage} language={language} setLanguage={setLanguage} />;
}

function ScanSession({ onCard, onAdded, captureRequest, initialQuery = '', autoLanguage, setAutoLanguage, language, setLanguage }: Omit<ScanScreenProps, 'sessionId'> & LanguageChoice) {
  const scroll = useChromeScroll();
  const { trainer } = useCollection();
  const addCards = useAddCards();
  const [mode, setMode] = useState<'card' | 'page'>('card');
  const [toolsOpen, setToolsOpen] = useState(false);
  const [quickDismissed, setQuickDismissed] = useState(false);
  const [quickBusy, setQuickBusy] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);
  // A page photo taken after switching modes inside the card camera, for the page reader.
  const [pagePhoto, setPagePhoto] = useState<LivePhoto | null>(null);
  const [manual, setManual] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [detected, setDetected] = useState<Language | null>(null);
  const [typeFilter, setTypeFilter] = useState<CardFilter>('all');
  const [improving, setImproving] = useState<ScanStage>('done');
  const generation = useRef(0);
  const lastScan = useRef<ScanResult | null>(null);
  const [energyHint, setEnergyHint] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoSize, setPhotoSize] = useState<{ uri: string; aspectRatio: number } | null>(null);
  const [original, setOriginal] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [crop, setCrop] = useState<Crop>(fullCrop);
  const [manualCrop, setManualCrop] = useState<Crop | undefined>();
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [suggested, setSuggested] = useState<ScanCandidate[]>([]);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current++; }; }, []);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const browsing = !query.trim() && typeFilter !== 'all' && !suggested.length;
  const scanLanguage: ScanLanguage = autoLanguage ? 'auto' : language;
  // After a scan, auto mode names what it read so a wrong guess is easy to spot.
  const languageSummary = !autoLanguage ? LANGUAGE_LABELS[language] : detected ? `${LANGUAGE_LABELS[detected]} (detected)` : 'Auto-detect';
  // A clear, finished match gets one big yes/no question instead of a list to compare.
  const sure = mode === 'card' && !quickDismissed && !query.trim() && !browsing && !busy && improving === 'done' && suggested.length > 0 && !needsScanRefinement(suggested) ? suggested[0].card : null;
  const results = useMemo(() => !(query.trim() || browsing) ? suggested.map(s => s.card) : autoLanguage && query.trim() ? searchAnyLanguage(query, detected, 80, typeFilter) : searchCards(query, language, 80, typeFilter), [query, language, autoLanguage, detected, suggested, typeFilter, browsing]);
  async function readPhoto(uri: string, selectedLanguage: ScanLanguage, selection: Crop | undefined, id: number) {
    setError(null); setNote(null); setQuery(''); setSuggested([]); lastScan.current = null; setEnergyHint(false); setImproving('done'); setQuickDismissed(false);
    if (!canRecognize) { setNote('Photo ready. Automatic reading works in the installed iPhone/iPad app. Search below in this browser preview.'); return; }
    await identifyProgressively({ recognize: recognizeCard, refine: refineCard, compare: compareCardArtwork },
      { uri, language: selectedLanguage, crop: selection, filter: typeFilter }, (scan, matches, phase, cardLanguage) => {
        lastScan.current = scan;
        setLanguage(cardLanguage); setDetected(selectedLanguage === 'auto' ? cardLanguage : null);
        setPhoto(scan.photoUri); setCrop(scan.crop); setSuggested(matches); setImproving(phase);
        setEnergyHint(scanTypeHint(scan.topText) === 'energy');
        busyRef.current = false; setBusy(false);
        setNote(matches.length ? MATCH_NOTE : phase === 'done' ? 'Hmm, not sure. Try closer, or type the name below.' : 'Looking closer… You can type the name below while we read.');
      }, () => alive.current && generation.current === id);
  }
  async function runScan(uri: string, selectedLanguage: ScanLanguage, selection?: Crop) {
    if (busyRef.current) return;
    const id = ++generation.current;
    busyRef.current = true; setBusy(true);
    try { await readPhoto(uri, selectedLanguage, selection, id); }
    catch (e) { console.warn('Card scan failed', e); if (alive.current && generation.current === id) setError(OOPS); }
    finally { if (alive.current && generation.current === id) { busyRef.current = false; setBusy(false); setImproving('done'); } }
  }
  function changeType(next: CardFilter) {
    if (busyRef.current) return;
    ++generation.current; setImproving('done'); setTypeFilter(next);
    // The same text can be re-ranked immediately; changing type never rereads the photo.
    if (lastScan.current) {
      const matches = scanCandidates(lastScan.current, language, 12, next); setSuggested(matches);
      setNote(matches.length ? MATCH_NOTE : 'No matches of this kind. Type the name below.');
    }
  }
  function changeLanguage(next: ScanLanguage) {
    if (busyRef.current || next === scanLanguage) return;
    ++generation.current; lastScan.current = null; setEnergyHint(false); setManual(false);
    setAutoLanguage(next === 'auto'); setDetected(null); setLanguage(next === 'auto' ? 'en' : next); setSuggested([]); setNote(null);
    if (original) void runScan(original.uri, next, manualCrop);
  }
  async function takePhoto(library = false, system = false) {
    if (busyRef.current) return;
    if (!library && !system && Platform.OS !== 'web') { setLiveOpen(true); return; }
    setLiveOpen(false);
    const id = ++generation.current;
    busyRef.current = true; setBusy(true); setError(null); setImproving('done');
    try {
      if (!library) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { setNote('Camera access is off. Pick a photo, or type the name below.'); return; }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false };
      const result = library ? await ImagePicker.launchImageLibraryAsync(options) : await ImagePicker.launchCameraAsync(options);
      if (result.canceled || !alive.current) return;
      const asset = result.assets[0];
      setOriginal({ uri: asset.uri, width: asset.width, height: asset.height });
      setPhoto(asset.uri); setManualCrop(undefined); setCrop(fullCrop);
      await readPhoto(asset.uri, scanLanguage, undefined, id);
    } catch (e) { console.warn('Card photo failed', e); if (alive.current && generation.current === id) setError(OOPS); }
    finally { if (alive.current && generation.current === id) { busyRef.current = false; setBusy(false); setImproving('done'); } }
  }
  // A photo picker can only open once the camera sheet has finished sliding away.
  const afterLive = useRef<(() => void) | null>(null);
  function leaveLive(next: () => void) {
    if (Platform.OS !== 'ios') { next(); return; }
    afterLive.current = next; setLiveOpen(false);
  }
  // The live camera may already have read the card; otherwise the photo goes through the normal reader.
  function acceptLive(next: LivePhoto, match?: LiveMatch) {
    setLiveOpen(false); setError(null);
    if (next.page) { ++generation.current; setImproving('done'); setPagePhoto(next); setMode('page'); return; }
    setOriginal(next); setPhoto(next.uri); setManualCrop(undefined); setCrop(fullCrop);
    if (!match) { void runScan(next.uri, scanLanguage); return; }
    ++generation.current; lastScan.current = match.scan;
    setLanguage(match.language); setDetected(scanLanguage === 'auto' ? match.language : null);
    setPhoto(match.scan.photoUri); setCrop(match.scan.crop); setSuggested(match.matches); setQuery('');
    setQuickDismissed(false); setEnergyHint(false); setImproving('done'); setNote(MATCH_NOTE);
  }
  // "Scan another card" from the celebration opens the camera straight away.
  const handledCapture = useRef(captureRequest);
  useEffect(() => {
    if (captureRequest === handledCapture.current || mode !== 'card') return;
    handledCapture.current = captureRequest;
    void takePhoto();
  }, [captureRequest, mode]);
  const withPhoto = (card: CardBrief) => ({ ...card, ...(!card.image && photo?.startsWith('file://') ? { localImage: photo } : {}) });
  async function quickAdd(brief: CardBrief) {
    if (quickBusy) return;
    setQuickBusy(true); setError(null);
    try {
      const existing = trainer.entries.find(e => e.card.id === brief.id && e.card.language === brief.language);
      const card = existing?.card ?? await fetchCard(withPhoto(brief));
      const added = await addCards([{ card, finish: existing?.finish ?? defaultFinish(card), quantity: 1 }]);
      if (!alive.current) return;
      ++generation.current; lastScan.current = null;
      setSuggested([]); setPhoto(null); setOriginal(null); setManualCrop(undefined); setNote(null); setToolsOpen(false);
      onAdded(added, 'card');
    } catch (e) { console.warn('Adding card failed', e); if (alive.current) setError(OOPS); }
    finally { if (alive.current) setQuickBusy(false); }
  }
  const toolsLabel = !autoLanguage ? LANGUAGE_LABELS[language] : detected && detected !== 'en' ? LANGUAGE_LABELS[detected] : null;
  const intro = <>
    {/* In page mode the big title only pushed the page grid down; the switch below says where you are. */}
    {mode === 'card' && !sure && <View><Txt accessibilityRole="header" style={ui.title}>A new discovery awaits</Txt><Txt muted>Pokémon, Trainers, Energy—every card belongs.</Txt></View>}
    <Segmented label="What are you scanning?" options={MODES} value={mode} onChange={id => { if (busy) return; ++generation.current; setImproving('done'); setPagePhoto(null); setMode(id); }} />
    <View style={{ gap: S.sm }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Scan settings${toolsLabel ? `, reading ${toolsLabel}` : ''}`} accessibilityHint="Language, crop and read again" aria-expanded={toolsOpen} onPress={() => { setToolsOpen(open => !open); setLanguageOpen(false); }} style={state => [s.languageButton, toolsOpen && { borderColor: C.ink }, pressFx(state)]}>
        <Icon name="tools" size={18} /><Txt style={{ fontSize: 14, fontWeight: '700' }}>Scan settings{toolsLabel ? ` · ${toolsLabel}` : ''}</Txt><View style={{ transform: [{ rotate: toolsOpen ? '90deg' : '-90deg' }] }}><Icon name="back" size={16} /></View>
      </Pressable>
      {toolsOpen && <View style={s.tools}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Card language: ${languageSummary}`} accessibilityHint="Opens language choices. Automatic detection is recommended." aria-expanded={languageOpen} onPress={() => setLanguageOpen(open => !open)} style={state => [s.languageButton, languageOpen && { borderColor: C.ink }, pressFx(state)]}>
        <Txt style={{ fontSize: 14, fontWeight: '700' }}>Language: {languageSummary}</Txt><View style={{ transform: [{ rotate: languageOpen ? '90deg' : '-90deg' }] }}><Icon name="back" size={16} /></View>
      </Pressable>
      {languageOpen && <View accessibilityRole="radiogroup" accessibilityLabel="Card language" style={s.languageMenu}>{(['auto', ...LANGUAGES] as const).map(option => <Pressable key={option} accessibilityRole="radio" accessibilityLabel={option === 'auto' ? 'Auto-detect' : LANGUAGE_LABELS[option]} aria-checked={scanLanguage === option} onPress={() => { setLanguageOpen(false); changeLanguage(option); }} style={state => [s.languageOption, pressFx(state)]}><View style={{ flex: 1 }}><Txt style={{ fontSize: 14, fontWeight: scanLanguage === option ? '700' : '400' }}>{option === 'auto' ? 'Auto-detect' : LANGUAGE_LABELS[option]}</Txt>{option === 'auto' && <Txt muted style={{ fontSize: 13 }}>Recommended. Reads the language from your photo.</Txt>}</View>{scanLanguage === option && <Icon name="check" size={18} />}</Pressable>)}</View>}
      {mode === 'card' && original && canRecognize && <ButtonRow><Button size="medium" title="Adjust crop" icon="scan" secondary disabled={busy} onPress={() => { ++generation.current; setImproving('done'); setToolsOpen(false); setEditing(true); }} /><Button size="medium" title="Read again" secondary disabled={busy} onPress={() => runScan(original.uri, scanLanguage, manualCrop)} /></ButtonRow>}
      </View>}
    </View>
  </>;
  if (mode === 'page') return <PageScan header={intro} language={scanLanguage} captureRequest={captureRequest} livePhoto={pagePhoto} onCardPhoto={(next, match) => { setPagePhoto(null); setMode('card'); acceptLive(next, match); }} onAdded={added => onAdded(added, 'page')} />;
  if (editing && original) return <Animated.ScrollView {...scroll} scrollEnabled={!dragging} contentContainerStyle={[s.list, scroll.contentContainerStyle]}>
    <CardCrop photo={original} initial={crop} onDrag={setDragging} onCancel={() => { setEditing(false); setDragging(false); }} onConfirm={selection => {
      setEditing(false); setDragging(false); setManualCrop(selection); void runScan(original.uri, scanLanguage, selection);
    }} />
  </Animated.ScrollView>;
  const liveCamera = <Modal visible={liveOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setLiveOpen(false)} onDismiss={() => { const next = afterLive.current; afterLive.current = null; next?.(); }}>
    {liveOpen && <LiveCamera mode="card" language={scanLanguage} onCapture={acceptLive} onFallback={() => leaveLive(() => takePhoto(false, true))} onLibrary={() => leaveLive(() => takePhoto(true))} onClose={() => setLiveOpen(false)} />}
  </Modal>;
  return <><Animated.FlatList {...scroll} data={sure ? [] : results} keyExtractor={c => `${c.language}:${c.id}`} contentContainerStyle={[s.list, scroll.contentContainerStyle]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
    ListHeaderComponent={<View style={{ gap: 16, marginBottom: 16 }}>
      {intro}
      {PARTIAL_CATALOGS.includes(language) && <View style={s.note}><Txt muted style={{ fontSize: 13 }}>{language === 'ko' ? 'Korean' : 'Chinese'} catalog coverage is still growing. If your exact set and number are missing, you can enter the card yourself.</Txt><Button title={manual ? 'Close manual entry' : 'Enter an unlisted card'} secondary onPress={() => setManual(value => !value)} />{manual && <ManualCardForm key={language} language={language} photoUri={photo ?? undefined} onReview={card => { ++generation.current; onCard(card, card); }} />}</View>}
      {sure && <View accessibilityLiveRegion="polite" style={s.quick}>
        <Txt style={[ui.subtitle, { textAlign: 'center' }]}>Is this your card?</Txt>
        <View><CardArt card={sure} high style={s.quickArt} />{photo && <View style={s.yours}><Image source={photo} style={{ width: 58, height: 80 }} contentFit="cover" accessibilityLabel="Your photo" /><Txt style={s.yoursLabel}>Yours</Txt></View>}</View>
        <View style={{ alignItems: 'center' }}><Txt style={{ fontWeight: '900', fontSize: 18 }}>{sure.name}</Txt><Txt muted style={{ fontSize: 13, textAlign: 'center' }}>{setForCard(sure)?.name ?? sure.id} · #{sure.localId} · {LANGUAGE_LABELS[sure.language]}</Txt></View>
        <Button title="Yes! Add it" icon="check" busy={quickBusy} onPress={() => quickAdd(sure)} />
        <ButtonRow><Button size="medium" title="No, it's not" secondary disabled={quickBusy} onPress={() => setQuickDismissed(true)} /><Button size="medium" title="See card" secondary disabled={quickBusy} onPress={() => { ++generation.current; onCard(withPhoto(sure)); }} /></ButtonRow>
      </View>}
      {!sure && <>
      <View style={s.capture}>
        <View style={[s.corner, { top: 16, left: 16, borderTopWidth: 3, borderLeftWidth: 3 }]} /><View style={[s.corner, { top: 16, right: 16, borderTopWidth: 3, borderRightWidth: 3 }]} /><View style={[s.corner, { bottom: 16, left: 16, borderBottomWidth: 3, borderLeftWidth: 3 }]} /><View style={[s.corner, { bottom: 16, right: 16, borderBottomWidth: 3, borderRightWidth: 3 }]} />
        {photo ? <ZoomablePhoto dark key={photo} aspectRatio={photoSize?.uri === photo ? photoSize.aspectRatio : 0} label="Your card photo" renderPhoto={(width, height) => <Image source={photo} style={{ width, height }} contentFit="contain" />}><Image source={photo} style={{ height: 195, width: 150 }} contentFit="contain" accessibilityLabel="Your card photo" onLoad={({ source }) => setPhotoSize({ uri: photo, aspectRatio: source.width / source.height })} /></ZoomablePhoto> : <><Image source={require('../../assets/crafted/pokeball.png')} style={{ height: 130, width: 140 }} contentFit="contain" /><Txt style={{ color: '#D6E3CB', fontWeight: '700', fontSize: 15 }}>Center one whole card</Txt><Txt style={{ color: '#A0B296', fontSize: 13, textAlign: 'center' }}>Keep the little number at the bottom sharp.</Txt></>}
        {busy && <View style={s.reading}><ActivityIndicator color="white" /><Txt style={{ color: 'white' }}>Reading the name and number…</Txt></View>}
      </View>
      <ButtonRow><Button title={photo ? 'Retake photo' : 'Take a photo'} icon="camera" onPress={() => takePhoto()} busy={busy} /><Button title="Pick from Photos" icon="photo" secondary onPress={() => takePhoto(true)} disabled={busy} /></ButtonRow>
      </>}
      {improving !== 'done' && <View accessibilityLiveRegion="polite" style={s.tip}><ActivityIndicator size="small" color={C.muted} /><Txt muted style={{ flex: 1, fontSize: 14 }}>{improving === 'refining' ? 'Reading the small print… You can choose a match now.' : 'Checking pictures… You can choose a match now.'}</Txt></View>}
      <ErrorNotice text={error} />
      {note && !sure && <View style={s.note}><Txt style={{ fontSize: 14 }}>{note}</Txt></View>}
      <View style={{ gap: S.sm }}><Txt accessibilityRole="header" style={ui.subtitle}>{sure ? 'Or search for it' : 'Or find your card'}</Txt><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: S.sm }}>{CARD_FILTERS.map(f => <Chip key={f.id} label={f.label} selected={typeFilter === f.id} onPress={() => changeType(f.id)} />)}</ScrollView><SearchBox value={query} onChange={setQuery} placeholder="Pokémon name or card number" /></View>
      {(typeFilter === 'energy' || energyHint) && <View style={s.note}><Txt style={{ fontWeight: '700', fontSize: 14 }}>An Energy card with just a symbol?</Txt><Txt muted style={{ fontSize: 13 }}>Pick its energy type, then check the bottom number.</Txt><View style={[ui.row, { flexWrap: 'wrap', marginTop: 6 }]}>{ENERGY_SEARCHES.map(e => <Chip key={e.label} label={e.label} onPress={() => { changeType('energy'); setQuery(e[language]); }} />)}</View></View>}
      {!query && typeFilter === 'all' && !suggested.length && <View style={[ui.row, { flexWrap: 'wrap' }]}>{['Pikachu', 'Eevee', 'Charizard'].map(name => <Chip key={name} label={name} onPress={() => setQuery(name)} />)}</View>}
      {results.length > 0 && !sure && <Txt style={{ fontSize: 15, fontWeight: '800' }}>{query || browsing ? `${results.length === 80 ? 'First 80' : results.length} found. ` : ''}Which one is yours? Tap it.</Txt>}
    </View>}
    ListEmptyComponent={query.trim() ? <View style={s.note}><Txt style={{ fontWeight: '700' }}>No matching cards</Txt><Txt muted style={{ fontSize: 14 }}>Try just the Pokémon's name or the card number, or check the language in Scan settings.</Txt></View> : null}
    renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Review ${item.name} ${item.id}`} onPress={() => { ++generation.current; setImproving('done'); onCard(withPhoto(item)); }} style={({ pressed }) => [s.result, pressed && { opacity: .65 }]}><CardArt card={item} high style={s.resultArt} /><View style={s.resultDetails}><View style={{ flex: 1, gap: 2 }}><Txt style={{ fontWeight: '800' }}>{item.name}</Txt><Txt muted style={{ fontSize: 12, lineHeight: 18 }}>{setForCard(item)?.name ?? item.id}</Txt><Txt muted style={{ fontSize: 11 }}>{cardKindLabel(item)}</Txt><Txt muted style={{ fontSize: 12 }}>#{item.localId} · {LANGUAGE_LABELS[item.language]}</Txt>{!query && <Txt muted style={{ fontSize: 11, lineHeight: 16 }}>{suggested.find(s => s.card.id === item.id)?.evidence}</Txt>}<CardPriceTag card={item} enabled={!busy && improving === 'done'} /></View><Icon name="arrow" size={19} color={C.muted} /></View></Pressable>} />{liveCamera}</>;
}
const s = StyleSheet.create({
  list: { padding: 20, paddingBottom: 40 },
  tools: { gap: S.sm, padding: S.md, borderRadius: 14, backgroundColor: '#E4ECD9' },
  quick: { gap: 10, padding: 14, borderRadius: 18, backgroundColor: '#FAFCF6', borderWidth: 2, borderColor: '#9FC08F' },
  quickArt: { width: 180, maxWidth: '70%', alignSelf: 'center' },
  yours: { position: 'absolute', left: 8, bottom: -6, padding: 3, borderRadius: 9, backgroundColor: 'white', transform: [{ rotate: '-6deg' }], alignItems: 'center', shadowColor: '#000', shadowOpacity: .2, shadowRadius: 5 },
  yoursLabel: { fontSize: 10, lineHeight: 14, fontWeight: '800' },
  capture: { minHeight: 245, backgroundColor: '#2C4037', borderRadius: 19, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 2, overflow: 'hidden' },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: '#86B99A' },
  reading: { position: 'absolute', inset: 0, backgroundColor: '#20392BE8', justifyContent: 'center', alignItems: 'center', gap: 10 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  note: { padding: 14, backgroundColor: '#DEE8D1', borderRadius: 12, gap: 3 },
  languageButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: S.sm, borderWidth: 1, borderColor: '#C0CDB3', borderRadius: 12, paddingHorizontal: 14, minHeight: 48, backgroundColor: '#F5F8EE' },
  languageMenu: { borderRadius: 12, padding: 5, backgroundColor: '#FAFCF6', borderWidth: 1, borderColor: '#C0CDB3' },
  languageOption: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 10 },
  resultArt: { width: 200, maxWidth: '100%', alignSelf: 'center' },
  resultDetails: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  result: { gap: 15, backgroundColor: '#FAFCF6', borderWidth: 1, borderColor: C.line, padding: 12, borderRadius: 13, marginBottom: 10 },
});
