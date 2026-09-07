import { ZoomablePhoto } from '@/components/zoomable-photo';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, C, CardArt, Chip, ErrorNotice, Icon, SearchBox, Txt, ui } from '@/components/pokedex-ui';
import { scanCandidates, searchCards, setForCard, ENERGY_SEARCHES, type ScanCandidate } from '@/lib/catalog';
import { canRecognize, recognizeCard, compareCardArtwork, refineCard } from '@/lib/scanner';
import type { CardBrief, Language } from '@/lib/model';
import { CardCrop } from '@/components/card-crop';
import { fullCrop, type Crop, type ScanResult } from '@/lib/scan-types';

import { CARD_FILTERS, cardKindLabel, scanTypeHint, type CardFilter } from '@/lib/card-kind';
import { identifyProgressively, type ScanStage } from '@/lib/scan-pipeline';
import { CardPriceTag } from '@/components/card-values';

export function ScanScreen({ onCard, initialQuery = '' }: { onCard: (card: CardBrief) => void; initialQuery?: string }) {
  const [language, setLanguage] = useState<Language>('en');
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
  const results = useMemo(() => query.trim() || browsing ? searchCards(query, language, 80, typeFilter) : suggested.map(s => s.card), [query, language, suggested, typeFilter, browsing]);
  async function readPhoto(uri: string, selectedLanguage: Language, selection: Crop | undefined, id: number) {
    setError(null); setNote(null); setQuery(''); setSuggested([]); lastScan.current = null; setEnergyHint(false); setImproving('done');
    if (!canRecognize) { setNote('Photo ready. Automatic reading works in the installed iPhone/iPad app. Search below in this browser preview.'); return; }
    await identifyProgressively({ recognize: recognizeCard, refine: refineCard, compare: compareCardArtwork },
      { uri, language: selectedLanguage, crop: selection, filter: typeFilter }, (scan, matches, phase) => {
        lastScan.current = scan;
        setPhoto(scan.photoUri); setCrop(scan.crop); setSuggested(matches); setImproving(phase);
        setEnergyHint(scanTypeHint(scan.topText) === 'energy');
        busyRef.current = false; setBusy(false);
        setNote(matches.length ? 'Check the picture, set, and bottom number before adding.' : phase === 'done' ? 'No clear match yet. Adjust the crop around one card, or choose a card type and search below.' : 'Looking more closely. You can adjust the crop or search while we read.');
      }, () => alive.current && generation.current === id);
  }
  async function runScan(uri: string, selectedLanguage: Language, selection?: Crop) {
    if (busyRef.current) return;
    const id = ++generation.current;
    busyRef.current = true; setBusy(true);
    try { await readPhoto(uri, selectedLanguage, selection, id); }
    catch (e) { if (alive.current && generation.current === id) setError(e instanceof Error ? e.message : 'The photo could not be read. Try again or search below.'); }
    finally { if (alive.current && generation.current === id) { busyRef.current = false; setBusy(false); setImproving('done'); } }
  }
  function changeType(next: CardFilter) {
    if (busyRef.current) return;
    ++generation.current; setImproving('done'); setTypeFilter(next);
    // The same text can be re-ranked immediately; changing type never rereads the photo.
    if (lastScan.current) {
      const matches = scanCandidates(lastScan.current, language, 12, next); setSuggested(matches);
      setNote(matches.length ? 'Check the picture, set, and bottom number before adding.' : 'No scan matches in this type. Browse the cards below or search by name and number.');
    }
  }
  function changeLanguage(next: Language) {
    if (busyRef.current || language === next) return;
    setLanguage(next); setSuggested([]); setNote(null);
    if (original) void runScan(original.uri, next, manualCrop);
  }
  async function takePhoto(library = false) {
    if (busyRef.current) return;
    const id = ++generation.current;
    busyRef.current = true; setBusy(true); setError(null); setImproving('done');
    try {
      if (!library) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) { setNote('Camera access is off. You can choose a photo or search by name and number.'); return; }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false };
      const result = library ? await ImagePicker.launchImageLibraryAsync(options) : await ImagePicker.launchCameraAsync(options);
      if (result.canceled || !alive.current) return;
      const asset = result.assets[0];
      setOriginal({ uri: asset.uri, width: asset.width, height: asset.height });
      setPhoto(asset.uri); setManualCrop(undefined); setCrop(fullCrop);
      await readPhoto(asset.uri, language, undefined, id);
    } catch (e) { if (alive.current && generation.current === id) setError(e instanceof Error ? e.message : 'The photo could not be read. Try again or search below.'); }
    finally { if (alive.current && generation.current === id) { busyRef.current = false; setBusy(false); setImproving('done'); } }
  }
  if (editing && original) return <ScrollView scrollEnabled={!dragging} contentContainerStyle={s.list}>
    <CardCrop photo={original} initial={crop} onDrag={setDragging} onCancel={() => { setEditing(false); setDragging(false); }} onConfirm={selection => {
      setEditing(false); setDragging(false); setManualCrop(selection); void runScan(original.uri, language, selection);
    }} />
  </ScrollView>;
  return <FlatList data={results} keyExtractor={c => `${c.language}:${c.id}`} contentContainerStyle={s.list} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
    ListHeaderComponent={<View style={{ gap: 16, marginBottom: 16 }}>
      <View><Txt style={ui.title}>A new discovery awaits</Txt><Txt muted>Pokémon, Trainers, Energy—every card belongs.</Txt></View>
      <View style={ui.row}><Chip label="English" selected={language === 'en'} onPress={() => changeLanguage('en')} /><Chip label="日本語 · Japanese" selected={language === 'ja'} onPress={() => changeLanguage('ja')} /></View>
      <View style={s.capture}>
        <View style={[s.corner, { top: 16, left: 16, borderTopWidth: 3, borderLeftWidth: 3 }]} /><View style={[s.corner, { top: 16, right: 16, borderTopWidth: 3, borderRightWidth: 3 }]} /><View style={[s.corner, { bottom: 16, left: 16, borderBottomWidth: 3, borderLeftWidth: 3 }]} /><View style={[s.corner, { bottom: 16, right: 16, borderBottomWidth: 3, borderRightWidth: 3 }]} />
        {photo ? <ZoomablePhoto key={photo} aspectRatio={photoSize?.uri === photo ? photoSize.aspectRatio : 0} label="Your card photo" renderPhoto={(width, height) => <Image source={photo} style={{ width, height }} contentFit="contain" />}><Image source={photo} style={{ height: 195, width: 150 }} contentFit="contain" accessibilityLabel="Your card photo" onLoad={({ source }) => setPhotoSize({ uri: photo, aspectRatio: source.width / source.height })} /></ZoomablePhoto> : <><Image source={require('../../assets/crafted/pokeball.png')} style={{ height: 130, width: 140 }} contentFit="contain" /><Txt style={{ color: '#D6E3CB', fontWeight: '700', fontSize: 14 }}>Center one whole card</Txt><Txt style={{ color: '#A0B296', fontSize: 12, textAlign: 'center' }}>In a binder or on a table. Keep the bottom number sharp and tilt away from glare.</Txt></>}
        {busy && <View style={s.reading}><ActivityIndicator color="white" /><Txt style={{ color: 'white' }}>Reading the name and number…</Txt></View>}
      </View>
      <View style={ui.row}><Button title={photo ? 'Retake photo' : 'Take a photo'} icon="camera" onPress={() => takePhoto()} busy={busy} style={{ flex: 1 }} /><Button title="Choose photo" icon="photo" secondary onPress={() => takePhoto(true)} disabled={busy} style={{ flex: 1 }} /></View>
      {original && canRecognize && <View style={ui.row}><Button title="Adjust crop" icon="scan" secondary disabled={busy} onPress={() => { ++generation.current; setImproving('done'); setEditing(true); }} style={{ flex: 1 }} /><Button title="Read again" secondary disabled={busy} onPress={() => runScan(original.uri, language, manualCrop)} style={{ flex: 1 }} /></View>}
      {!photo && <View style={s.tip}><Icon name="scan" color={C.muted} size={19} /><Txt muted style={{ flex: 1, fontSize: 12, lineHeight: 18 }}>Mega, ex, and shiny cards: the tiny number at the bottom helps us find the exact version.</Txt></View>}
      {improving !== 'done' && <View accessibilityLiveRegion="polite" style={s.tip}><ActivityIndicator size="small" color={C.muted} /><Txt muted style={{ flex: 1, fontSize: 12 }}>{improving === 'refining' ? 'Reading the small print… You can choose a match now.' : 'Checking pictures… You can choose a match now.'}</Txt></View>}
      <ErrorNotice text={error} />
      {note && <View style={s.note}><Txt style={{ fontSize: 13, lineHeight: 20 }}>{note}</Txt></View>}
      <View style={{ gap: 8 }}><Txt style={ui.subtitle}>Or find your card</Txt><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{CARD_FILTERS.map(f => <Chip key={f.id} label={f.label} selected={typeFilter === f.id} onPress={() => changeType(f.id)} />)}</ScrollView><SearchBox value={query} onChange={setQuery} placeholder={language === 'ja' ? 'Name in English / 日本語, or card number' : 'Card name, set, or collector number'} /></View>
      {(typeFilter === 'energy' || energyHint) && <View style={s.note}><Txt style={{ fontWeight: '700', fontSize: 13 }}>An Energy card with just a symbol?</Txt><Txt muted style={{ fontSize: 12 }}>Choose its energy type, then check the set and number. Similar artwork can belong to different printings.</Txt><View style={[ui.row, { flexWrap: 'wrap', marginTop: 6 }]}>{ENERGY_SEARCHES.map(e => <Chip key={e.label} label={e.label} onPress={() => { changeType('energy'); setQuery(e[language]); }} />)}</View></View>}
      {!query && typeFilter === 'all' && !suggested.length && <View style={[ui.row, { flexWrap: 'wrap' }]}>{['Pikachu', 'Eevee', 'Charizard'].map(name => <Chip key={name} label={name} onPress={() => setQuery(name)} />)}</View>}
      {results.length > 0 && <Txt muted style={{ fontSize: 12 }}>{query || browsing ? `${results.length === 80 ? 'First 80' : results.length} ${results.length === 1 ? 'result' : 'results'} — tap the card that matches yours` : 'Suggested matches — choose your exact card'}</Txt>}
    </View>}
    ListEmptyComponent={query.trim() ? <View style={s.note}><Txt style={{ fontWeight: '700' }}>No matching cards</Txt><Txt muted style={{ fontSize: 13 }}>Check the language above, or try just the Pokémon name or collector number.</Txt></View> : null}
    renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Review ${item.name} ${item.id}`} onPress={() => { ++generation.current; setImproving('done'); onCard(item); }} style={({ pressed }) => [s.result, pressed && { opacity: .65 }]}><CardArt card={item} style={{ width: 65 }} /><View style={{ flex: 1, gap: 2 }}><Txt style={{ fontWeight: '800' }}>{item.name}</Txt><Txt muted style={{ fontSize: 12, lineHeight: 18 }}>{setForCard(item)?.name ?? item.id}</Txt><Txt muted style={{ fontSize: 11 }}>{cardKindLabel(item)}</Txt><Txt muted style={{ fontSize: 12 }}>#{item.localId} · {item.language === 'ja' ? 'Japanese' : 'English'}</Txt>{!query && <Txt muted style={{ fontSize: 11, lineHeight: 16 }}>{suggested.find(s => s.card.id === item.id)?.evidence}</Txt>}<CardPriceTag card={item} enabled={!busy && improving === 'done'} /></View><Icon name="arrow" size={19} color={C.muted} /></Pressable>} />;
}
const s = StyleSheet.create({
  list: { padding: 20, paddingBottom: 40 },
  capture: { minHeight: 245, backgroundColor: '#2C4037', borderRadius: 19, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 2, overflow: 'hidden' },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: '#86B99A' },
  reading: { position: 'absolute', inset: 0, backgroundColor: '#20392BE8', justifyContent: 'center', alignItems: 'center', gap: 10 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  note: { padding: 14, backgroundColor: '#DEE8D1', borderRadius: 12, gap: 3 },
  result: { flexDirection: 'row', alignItems: 'center', gap: 15, backgroundColor: '#FAFCF6', borderWidth: 1, borderColor: C.line, padding: 12, borderRadius: 13, marginBottom: 10 },
});
