import { ZoomablePhoto } from '@/components/zoomable-photo';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, C, CardArt, Chip, ErrorNotice, Icon, IconButton, Txt, mono, ui } from '@/components/pokedex-ui';
import { cardKindLabel, pokemonIds } from '@/lib/card-kind';
import { useCollection } from '@/lib/collection-context';
import { fetchCard, speciesById, speciesImage } from '@/lib/catalog';
import { addCard, changePrinting, discoveredIds, FINISH_LABELS, mergeBackup, parseCollection, portableBackup, totalCards, TRAINER_COLORS, updateQuantity, type Card, type CardBrief, type Entry, type Finish } from '@/lib/model';
import { exportFile, importFile, keepCardArt } from '@/lib/files';
import { CardPriceTag, CardValuePanel } from '@/components/card-values';
import { usePricing } from '@/lib/use-pricing';
import { priceKey } from '@/lib/pricing';

export function Sheet({ title, onClose, children, busy = false }: { title: string; onClose: () => void; children: ReactNode; busy?: boolean }) {
  const insets = useSafeAreaInsets();
  return <View style={[m.overlay, { paddingTop: Math.max(insets.top, 15), paddingBottom: Math.max(insets.bottom, 15) }]}><Pressable accessibilityRole="button" accessibilityLabel="Close dialog" onPress={() => !busy && onClose()} style={StyleSheet.absoluteFill} /><View accessibilityViewIsModal style={m.sheet}><View style={m.sheetHeader}><Txt style={ui.subtitle}>{title}</Txt>{!busy && <IconButton icon="close" label="Close" onPress={onClose} />}</View>{children}</View></View>;
}

export function CardModal({ brief, entry, onClose, onAdded, onBusyChange }: { brief: CardBrief; entry?: Entry; onClose: () => void; onAdded: (card: Card, newIds: number[], quantity: number) => void; onBusyChange: (busy: boolean) => void }) {
  const { trainer, updateTrainer } = useCollection();
  const [card, setCard] = useState<Card | null>(entry?.card ?? null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(!entry);
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  const [quantity, setQuantity] = useState(1);
  const [finish, setFinish] = useState<Finish>(entry?.finish ?? 'unsure');
  const [removing, setRemoving] = useState(false);
  const liveEntry = entry ? trainer.entries.find(e => e.key === entry.key) : undefined;
  const priceClient = usePricing([brief], 0);
  const printingChoices: Finish[] = [...new Set([...(card?.finishes ?? []), ...(priceClient.snapshots[priceKey(brief)]?.finishes ?? [])].filter(f => f !== 'unsure')), 'unsure'];
  useEffect(() => {
    let active = true;
    if (entry) return;
    setLoading(true); setError(null);
    const saved = trainer.entries.find(e => e.card.id === brief.id && e.card.language === brief.language)?.card;
    (saved ? Promise.resolve(saved) : fetchCard(brief)).then(c => {
      if (!active) return;
      setCard(c); setFinish(c.finishes.length === 2 ? c.finishes[0] : 'unsure');
    }).catch(e => active && setError(e instanceof Error ? e.message : 'Unable to load this card. Try again.')).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [brief.id, brief.language, retry]);
  async function run(action: () => Promise<void>) {
    if (guard.current) return;
    guard.current = true; setBusy(true); onBusyChange(true); setError(null);
    try { await action(); }
    catch (e) { setError(e instanceof Error ? e.message : 'We could not save this change. Please try again.'); }
    finally { guard.current = false; setBusy(false); onBusyChange(false); }
  }
  function save() {
    if (!card) return;
    run(async () => {
      const savedCard = await keepCardArt(card);
      let newIds: number[] = [];
      await updateTrainer(t => { const before = discoveredIds(t); const next = addCard(t, savedCard, finish, quantity); newIds = pokemonIds(savedCard).filter(id => !before.has(id)); return next; });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onAdded(savedCard, newIds, quantity);
    });
  }
  return <Sheet title={entry ? 'Inside your binder' : 'Is this your card?'} onClose={onClose} busy={busy}><ScrollView contentContainerStyle={m.content} keyboardShouldPersistTaps="handled">
    {loading && <View style={m.loading}><ActivityIndicator color={C.ink} /><Txt>Finding the card details…</Txt></View>}
    <ErrorNotice text={error} />
    {!loading && !card && <Button title="Try again" onPress={() => setRetry(n => n + 1)} secondary />}
    {card && <>
      <View style={m.cardHero}><ZoomablePhoto aspectRatio={.716} label={`${card.name} card`} renderPhoto={(width) => <CardArt card={card} high style={{ width }} />}><CardArt key={card.id} card={card} high style={{ width: 210, maxWidth: '100%' }} /></ZoomablePhoto><View style={m.languageTag}><Txt style={{ fontWeight: '800', fontSize: 12 }}>{card.language === 'ja' ? '日本語 · Japanese' : 'English'}</Txt></View></View>
      <View style={ui.between}><View style={{ flex: 1 }}><Txt style={ui.title}>{card.name}</Txt>{card.language === 'ja' && card.dexIds.length > 0 && <Txt muted>{card.dexIds.map(id => speciesById.get(id)?.en).filter(Boolean).join(' & ')}</Txt>}</View>{liveEntry && <IconButton icon="heart" color={liveEntry.favorite ? C.red : C.muted} filled={liveEntry.favorite} label={liveEntry.favorite ? 'Remove from favorites' : 'Add to favorites'} onPress={() => run(() => updateTrainer(t => ({ ...t, entries: t.entries.map(e => e.key === liveEntry.key ? { ...e, favorite: !e.favorite } : e) })))} />}</View>
      <Txt muted>{card.set.name}</Txt><Txt style={{ fontWeight: '800', fontSize: 13 }}>{cardKindLabel(card)}</Txt><Txt muted style={{ fontSize: 12, lineHeight: 18 }}>{pokemonIds(card).length ? `Pokédex entries: ${pokemonIds(card).map(id => speciesById.get(id)?.en ?? `#${id}`).join(' & ')}` : 'Counts toward your binder and collection badges.'}</Txt>
      <View style={m.cardMeta}><View><Txt muted style={m.small}>Card number</Txt><Txt style={{ fontFamily: mono, fontWeight: '700' }}>{card.localId}/{card.set.total || '?'}</Txt></View><View><Txt muted style={m.small}>Rarity</Txt><Txt style={{ fontWeight: '700' }}>{card.rarity}</Txt></View>{card.hp && <View><Txt muted style={m.small}>HP</Txt><Txt style={{ fontWeight: '700' }}>{card.hp}</Txt></View>}</View>
      {!entry && <><Txt style={{ fontSize: 13, lineHeight: 20, color: C.muted }}>Compare the artwork and card number with yours before adding it.</Txt><Txt style={ui.subtitle}>Which printing?</Txt><View style={[ui.row, { flexWrap: 'wrap' }]}>{printingChoices.map(f => <Chip key={f} label={FINISH_LABELS[f]} selected={f === finish} onPress={() => !busy && setFinish(f)} />)}</View><Txt muted style={{ fontSize: 12, lineHeight: 18 }}>Holo has a shiny picture. Reverse holo usually shines around the picture. “Not sure yet” is okay.</Txt></>}
      {liveEntry && <><Txt style={ui.subtitle}>Your printing</Txt><View style={[ui.row, { flexWrap: 'wrap' }]}>{printingChoices.map(f => <Chip key={f} label={FINISH_LABELS[f]} selected={f === finish} onPress={() => !busy && setFinish(f)} />)}</View>{finish !== liveEntry.finish && <Button title="Save printing" secondary busy={busy} onPress={() => run(async () => { await updateTrainer(t => changePrinting(t, liveEntry.key, finish)); onClose(); })} />}</>}
      <CardValuePanel card={card} finish={finish} quantity={liveEntry?.quantity ?? quantity} />
      {liveEntry ? <><View style={ui.between}><View><Txt style={ui.subtitle}>Copies in your binder</Txt><Txt muted style={{ fontSize: 13 }}>{FINISH_LABELS[liveEntry.finish]}</Txt></View><View style={m.stepper}><IconButton icon="minus" label="Remove one copy" onPress={() => !busy && (liveEntry.quantity === 1 ? setRemoving(true) : run(() => updateTrainer(t => updateQuantity(t, liveEntry.key, liveEntry.quantity - 1))))} /><Txt style={m.stepperNumber}>{liveEntry.quantity}</Txt><IconButton icon="plus" label="Add one copy" onPress={() => run(() => updateTrainer(t => updateQuantity(t, liveEntry.key, liveEntry.quantity + 1)))} /></View></View>
        {!removing && <Button title="Delete card" secondary disabled={busy} onPress={() => setRemoving(true)} />}
        {removing && <View style={m.removeBox}><Txt style={{ fontWeight: '800' }}>Delete {liveEntry.quantity === 1 ? 'this card' : `all ${liveEntry.quantity} copies`}?</Txt><Txt style={{ fontSize: 13 }}>This removes {card.name} ({FINISH_LABELS[liveEntry.finish]}) from {trainer.name}'s binder. Other printings stay in your collection. You can add this card again later.</Txt><View style={ui.row}><Button title="Keep it" disabled={busy} onPress={() => setRemoving(false)} secondary style={{ flex: 1 }} /><Button title="Delete card" onPress={() => run(async () => { await updateTrainer(t => updateQuantity(t, liveEntry.key, 0)); onClose(); })} busy={busy} style={{ flex: 1 }} /></View></View>}
        {card.description && <View style={m.note}><Txt style={{ fontSize: 14 }}>{card.description}</Txt></View>}
        <Button title="Done" onPress={onClose} secondary disabled={busy} />
      </> : <><View style={ui.between}><Txt style={ui.subtitle}>How many copies?</Txt><View style={m.stepper}><IconButton icon="minus" label="Fewer copies" onPress={() => !busy && setQuantity(n => Math.max(1, n - 1))} /><Txt style={m.stepperNumber}>{quantity}</Txt><IconButton icon="plus" label="More copies" onPress={() => !busy && setQuantity(n => Math.min(999, n + 1))} /></View></View><Button title={`Add ${quantity === 1 ? 'to binder' : `${quantity} to binder`}`} icon="plus" onPress={save} busy={busy} /></>}
    </>}
  </ScrollView></Sheet>;
}

export function SpeciesModal({ id, onClose, onFindCards, onEntry }: { id: number; onClose: () => void; onFindCards: (name: string) => void; onEntry: (entry: Entry) => void }) {
  const { trainer } = useCollection();
  const pokemon = speciesById.get(id)!;
  const entries = trainer.entries.filter(e => pokemonIds(e.card).includes(id));
  const owned = entries.length > 0;
  return <Sheet title={`Pokédex #${String(id).padStart(3, '0')}`} onClose={onClose}><ScrollView contentContainerStyle={m.content}>
    <View style={{ alignItems: 'center', gap: 8 }}><Image source={speciesImage(id)} style={{ width: 240, height: 230, opacity: owned ? 1 : .3 }} tintColor={owned ? undefined : '#526B50'} contentFit="contain" cachePolicy="memory-disk" /><Txt style={ui.title}>{pokemon.en}</Txt><Txt muted>{pokemon.ja} · {pokemon.genus}</Txt><View style={m.languageTag}><Txt style={{ fontSize: 12, fontWeight: '700' }}>{owned ? `${entries.reduce((n, e) => n + e.quantity, 0)} cards collected` : 'Not discovered yet'}</Txt></View></View>
    <Button title={`Find ${pokemon.en} cards`} icon="search" onPress={() => onFindCards(pokemon.en)} />
    {owned ? <><Txt style={ui.subtitle}>Your {pokemon.en} cards</Txt><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{entries.map(e => <Pressable accessibilityRole="button" accessibilityLabel={`Open ${e.card.name} ${e.card.id}`} key={e.key} onPress={() => onEntry(e)} style={{ width: '46%', marginBottom: 8 }}><CardArt card={e.card} /><Txt style={{ fontSize: 12, marginTop: 5, fontWeight: '700' }}>{e.card.language === 'ja' ? 'JP' : 'EN'} · #{e.card.localId} · ×{e.quantity}</Txt><Txt muted style={{ fontSize: 11, lineHeight: 16 }}>{e.card.set.name}</Txt><CardPriceTag card={e.card} finish={e.finish} /></Pressable>)}</View></> : <Txt muted style={{ textAlign: 'center' }}>Add a {pokemon.en} card to bring this entry to life.</Txt>}
  </ScrollView></Sheet>;
}

export function ProfilesModal({ onClose, onBusyChange }: { onClose: () => void; onBusyChange: (busy: boolean) => void }) {
  const { collection, trainer, transact, updateTrainer } = useCollection();
  const [name, setName] = useState(trainer.name);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  async function run(action: () => Promise<void>) {
    if (guard.current) return;
    guard.current = true; setBusy(true); onBusyChange(true); setError(null); setNote(null);
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'The change could not be saved.'); }
    finally { guard.current = false; setBusy(false); onBusyChange(false); }
  }
  return <Sheet title="Your trainer family" onClose={onClose} busy={busy}><ScrollView contentContainerStyle={m.content} keyboardShouldPersistTaps="handled"><Txt muted>Each trainer has their own Pokédex and binder on this device.</Txt>
    {collection.trainers.map(t => <Pressable accessibilityRole="button" accessibilityLabel={`Switch to ${t.name}`} key={t.id} disabled={busy} onPress={() => run(async () => { await transact(c => ({ ...c, activeId: t.id })); setName(t.name); })} style={[m.profile, t.id === trainer.id && { borderColor: C.ink, backgroundColor: '#DEE7D2' }]}><View style={[m.avatar, { backgroundColor: t.color }]}><Txt style={{ color: 'white', fontSize: 22, fontWeight: '800' }}>{t.name.slice(0, 1).toUpperCase()}</Txt></View><View style={{ flex: 1 }}><Txt style={{ fontWeight: '800' }}>{t.name}</Txt><Txt muted style={{ fontSize: 12 }}>{totalCards(t)} cards · {discoveredIds(t).size} Pokémon</Txt></View>{t.id === trainer.id && <Icon name="check" size={21} />}</Pressable>)}
    <Txt style={ui.subtitle}>Trainer name</Txt><TextInput accessibilityLabel="Trainer name" value={name} onChangeText={setName} maxLength={32} style={m.input} editable={!busy} /><Button title="Save name" secondary disabled={!name.trim() || name.trim() === trainer.name} busy={busy} onPress={() => run(async () => { await updateTrainer(t => ({ ...t, name: name.trim() })); setNote('Trainer name saved.'); })} />
    <Txt style={ui.subtitle}>Add another trainer</Txt><TextInput accessibilityLabel="New trainer name" placeholder="Choose a trainer name" placeholderTextColor={C.muted} value={newName} onChangeText={setNewName} maxLength={32} style={m.input} editable={!busy} /><Button title="Add trainer" icon="plus" disabled={!newName.trim() || collection.trainers.length >= 20} busy={busy} onPress={() => run(async () => { await transact(c => { if (c.trainers.length >= 20) throw new Error('This device already has 20 trainers.'); return { ...c, trainers: [...c.trainers, { id: `trainer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: newName.trim(), color: TRAINER_COLORS[c.trainers.length % TRAINER_COLORS.length], entries: [] }] }; }); setNewName(''); setNote('New trainer added. Tap their name to start collecting.'); })} />
    <View style={m.divider} /><Txt style={ui.subtitle}>Keep your collection safe</Txt><Txt muted style={{ fontSize: 13 }}>Save a family backup to Files or share it to another device. Importing adds copies of the trainers and keeps your current collections.</Txt>
    <Button title="Export family backup" icon="download" secondary busy={busy} onPress={() => run(() => exportFile(portableBackup(collection)))} />
    <Button title="Import a backup" icon="upload" secondary busy={busy} onPress={() => run(async () => { const raw = await importFile(); if (!raw) return; const incoming = parseCollection(raw); await transact(c => mergeBackup(c, incoming)); setNote(`Imported ${incoming.trainers.length} trainer profile${incoming.trainers.length === 1 ? '' : 's'}.`); })} />
    <ErrorNotice text={error} />{note && <View style={m.note}><Txt>{note}</Txt></View>}
    <View style={m.divider} /><Txt muted style={{ fontSize: 12, lineHeight: 19 }}>Saved on this device. Live family syncing is planned for a later version. Card text is read on your iPhone/iPad; photos are not sent to a server.</Txt><Txt muted style={{ fontSize: 11, lineHeight: 17 }}>Card data and images: TCGdex. Pokémon names and artwork: PokéAPI. An unofficial family fan project. Pokémon belongs to its respective owners.</Txt>
  </ScrollView></Sheet>;
}

export function DiscoveryModal({ card, newIds, quantity, onClose }: { card: Card; newIds: number[]; quantity: number; onClose: () => void }) {
  const [reduced, setReduced] = useState(true);
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduced(value); });
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { active = false; listener.remove(); };
  }, []);
  useEffect(() => {
    if (reduced) { scale.setValue(1); return; }
    scale.setValue(.75);
    const animation = Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true });
    animation.start(); return () => animation.stop();
  }, [reduced, scale]);
  const discovered = newIds.length > 0;
  const pokemon = speciesById.get(newIds[0]);
  return <Sheet title={discovered ? 'New Pokémon discovered!' : 'Added to your binder!'} onClose={onClose}><ScrollView contentContainerStyle={[m.content, { alignItems: 'center', paddingVertical: 25 }]}><View style={m.discoveryStage}><View style={m.discoveryRing} /><Animated.View style={{ transform: [{ scale }], alignItems: 'center' }}>{discovered ? <><View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', zIndex: 2 }}>{newIds.map(id => <Image key={id} accessibilityLabel={speciesById.get(id)?.en} source={speciesImage(id)} style={{ width: newIds.length > 1 ? 95 : 220, height: newIds.length > 1 ? 130 : 210 }} contentFit="contain" />)}</View><Image source={require('../../assets/crafted/pokeball-open.png')} style={{ width: 155, height: 145, marginTop: -25 }} contentFit="contain" /></> : <CardArt card={card} style={{ width: 185, marginVertical: 20 }} />}</Animated.View></View><Txt style={[ui.title, { textAlign: 'center' }]}>{discovered ? newIds.map(id => speciesById.get(id)?.en ?? `#${id}`).join(' & ') : card.name}</Txt><Txt muted style={{ textAlign: 'center' }}>{discovered ? `You brought ${newIds.length === 1 ? 'a new entry' : `${newIds.length} new entries`} to life in your Pokédex.` : `${quantity} ${quantity === 1 ? 'card' : 'cards'} saved. Your collection keeps growing.`}</Txt>{pokemon && <View style={m.languageTag}><Txt style={{ fontFamily: mono, fontSize: 12 }}>#{String(pokemon.id).padStart(3, '0')} · {pokemon.genus}</Txt></View>}<Button title="Keep collecting" icon="scan" onPress={onClose} style={{ alignSelf: 'stretch', marginTop: 12 }} /></ScrollView></Sheet>;
}

const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#14201CC9', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  sheet: { width: '100%', maxWidth: 600, maxHeight: '100%', backgroundColor: C.screen, borderRadius: 24, overflow: 'hidden', borderWidth: 3, borderColor: '#AFC1A3' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 8, minHeight: 64, borderBottomWidth: 1, borderColor: C.line, backgroundColor: '#DFE8D4' },
  content: { padding: 20, paddingBottom: 26, gap: 16 }, loading: { padding: 50, alignItems: 'center', gap: 14 },
  cardHero: { alignItems: 'center', backgroundColor: '#DDE6D1', padding: 18, gap: 12, borderRadius: 16 }, languageTag: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10, backgroundColor: '#D4E1C7' },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 25, paddingVertical: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line }, small: { fontSize: 11, lineHeight: 17 },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#DCE6D0', borderRadius: 12 }, stepperNumber: { fontFamily: mono, fontSize: 19, fontWeight: '700', minWidth: 27, textAlign: 'center' },
  removeBox: { padding: 14, backgroundColor: '#F3DADB', borderRadius: 14, gap: 10 }, note: { padding: 14, backgroundColor: '#DBE7CD', borderRadius: 12 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 14, borderWidth: 1, borderColor: C.line }, avatar: { width: 44, height: 44, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: '#B8C6AC', borderRadius: 12, backgroundColor: '#FCFDF9', color: C.ink, fontSize: 16 }, divider: { height: 1, backgroundColor: C.line, marginVertical: 4 },
  discoveryStage: { width: '100%', alignItems: 'center', justifyContent: 'center', minHeight: 290 }, discoveryRing: { position: 'absolute', width: 265, height: 265, borderRadius: 140, backgroundColor: '#D6E7BD', borderWidth: 16, borderColor: '#E3EDCD' },
});
