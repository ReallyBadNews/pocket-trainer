import { CardInspection } from '@/components/card-inspection';
import { DiscoveryDevice } from '@/components/discovery-device';
import { Image } from 'expo-image';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, Switch, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionRow, Button, ButtonRow, C, CardArt, CardCaption, ChoiceMenu, ErrorNotice, Icon, IconButton, S, SheetHeader, ToolbarAction, TypePill, Txt, mono, pressFx, tick, ui } from '@/components/pokedex-ui';
import { LANGUAGE_CODES, LANGUAGE_LABELS } from '@/lib/languages';
import { cardKindLabel, pokemonIds } from '@/lib/card-kind';
import { useCollection } from '@/lib/collection-context';
import { fetchCard, setForCard, speciesById, speciesImage } from '@/lib/catalog';
import { collectorNumber, changePrinting, defaultFinish, discoveredIds, FINISH_LABELS, mergeBackup, parseCollection, portableBackup, totalCards, TRAINER_HAIR_COLORS, TRAINER_HAIR_STYLES, TRAINER_HEADWEAR, TRAINER_OUTFITS, TRAINER_OUTFIT_COLORS, TRAINER_SKIN_TONES, trainerAppearanceFor, updateQuantity, type Card, type CardBrief, type Entry, type Finish, type Trainer, type TrainerAppearance } from '@/lib/model';
import { isWished, removeWish, restoreWish, toggleWish, wishesForSpecies, wishesOf, wishlistShareText, type Wish } from '@/lib/wishlist';
import { exportFile, importFile } from '@/lib/files';
import { useAddCards, type AddedCards } from '@/lib/use-add-cards';
import { CardPriceTag, CardValuePanel } from '@/components/card-values';
import { TRAINER_APPEARANCE_LABELS, TrainerAvatar } from '@/components/trainer-avatar';
import { usePricing } from '@/lib/use-pricing';
import { priceKey } from '@/lib/pricing';
import { evolutionFamily, pokedexEntry, speciesTypes, typeLabel } from '@/lib/species-details';
import { useGrownUpCheck } from '@/components/grown-up-gate';
import { AboutScreen } from './about-screen';
import { animatedSprite } from '@/lib/pokedex-voice';
import { usePokedexVoice } from '@/lib/use-pokedex-voice';
import { Confetti, HoloShine } from '@/components/celebration';
import { isShiny } from '@/lib/shine';
import Reanimated, { useReducedMotion, ZoomIn } from 'react-native-reanimated';

/** `overlay` (the grown-up check) covers the sheet and hides it from screen readers while open. `onBack` adds a back arrow for sub-pages; `dismissible={false}` stops a stray tap outside from throwing away a game or unsaved work. */
export function Sheet({ title, onClose, onBack, children, busy = false, dismissible = true, overlay }: { title: string; onClose: () => void; onBack?: () => void; children: ReactNode; busy?: boolean; dismissible?: boolean; overlay?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[m.overlay, { paddingTop: Math.max(insets.top, 15), paddingBottom: Math.max(insets.bottom, 15) }]}><Pressable accessibilityRole="button" accessibilityLabel="Close dialog" onPress={() => dismissible && !busy && onClose()} style={StyleSheet.absoluteFill} /><View accessibilityViewIsModal={!overlay} accessibilityElementsHidden={!!overlay} importantForAccessibility={overlay ? 'no-hide-descendants' : 'auto'} style={m.sheet}><SheetHeader title={title} onClose={onClose} onBack={onBack} busy={busy} />{children}</View>{overlay}</KeyboardAvoidingView>;
}

export function CardModal({ brief, entry, draft, onClose, onAdded, onBusyChange }: { brief: CardBrief; entry?: Entry; draft?: Card; onClose: () => void; onAdded: (added: AddedCards) => void; onBusyChange: (busy: boolean) => void }) {
  const { trainer, updateTrainer } = useCollection();
  const addCards = useAddCards();
  const [card, setCard] = useState<Card | null>(entry?.card ?? draft ?? null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(!entry);
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  const cardScroll = useRef<ScrollView>(null);
  const [quantity, setQuantity] = useState(1);
  const [finish, setFinish] = useState<Finish>(entry?.finish ?? 'unsure');
  const [removing, setRemoving] = useState(false);
  const { locked, requireGrownUp, gate } = useGrownUpCheck();
  const liveEntry = entry ? trainer.entries.find(e => e.key === entry.key) : undefined;
  const wished = isWished(trainer, brief);
  // Manual drafts have no catalog identity to reopen later, and owned cards are already granted.
  const canWish = !draft && (wished || !trainer.entries.some(e => e.card.id === brief.id && e.card.language === brief.language));
  const [wishing, setWishing] = useState(false);
  const [wishError, setWishError] = useState<string | null>(null);
  const priceClient = usePricing([brief], 0);
  const printingChoices: Finish[] = [...new Set([...(card?.finishes ?? []), ...(priceClient.snapshots[priceKey(brief)]?.finishes ?? [])].filter(f => f !== 'unsure')), 'unsure'];
  useEffect(() => {
    let active = true;
    if (entry) return;
    if (draft) { setLoading(false); return; }
    setLoading(true); setError(null);
    const saved = trainer.entries.find(e => e.card.id === brief.id && e.card.language === brief.language)?.card;
    (saved ? Promise.resolve(saved) : fetchCard(brief)).then(c => {
      if (!active) return;
      setCard(c); setFinish(defaultFinish(c));
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
    run(async () => onAdded(await addCards([{ card, finish, quantity }])));
  }
  async function toggleWished() {
    if (!card || wishing || guard.current) return;
    setWishing(true); setWishError(null);
    try { await updateTrainer(t => toggleWish(t, card, pokemonIds(card))); }
    catch (e) { setWishError(e instanceof Error ? e.message : 'We could not update your wishlist. Please try again.'); }
    finally { setWishing(false); }
  }
  return <Sheet title={entry ? 'Card details' : 'Review card'} onClose={onClose} busy={busy} overlay={gate}><ScrollView ref={cardScroll} style={m.scrolling} contentContainerStyle={m.content} keyboardShouldPersistTaps="handled">
    {loading && <View style={m.loading}><ActivityIndicator color={C.ink} /><Txt>Finding the card details…</Txt></View>}
    <ErrorNotice text={error} />
    {!loading && !card && <Button title="Try again" onPress={() => setRetry(n => n + 1)} secondary />}
    {card && <>
      <View style={m.cardHero}><CardInspection card={card} finish={finish} disabled={busy}><CardArt key={card.id} card={card} high style={{ width: 160, maxWidth: '100%' }} /></CardInspection></View>
      <View style={{ gap: S.xs }}>
        <View style={ui.between}><View style={{ flex: 1, minWidth: 0 }}><Txt variant="title">{card.name}</Txt>{card.language !== 'en' && card.dexIds.length > 0 && <Txt muted>{card.dexIds.map(id => speciesById.get(id)?.en).filter(Boolean).join(' & ')}</Txt>}</View>{liveEntry && <IconButton disabled={busy} icon="heart" color={liveEntry.favorite ? C.red : C.muted} filled={liveEntry.favorite} label={liveEntry.favorite ? 'Remove from favorites' : 'Add to favorites'} onPress={() => run(() => updateTrainer(t => ({ ...t, entries: t.entries.map(e => e.key === liveEntry.key ? { ...e, favorite: !e.favorite } : e) })))} />}</View>
        <Txt variant="caption" muted>{card.set.name} · {LANGUAGE_LABELS[card.language]}</Txt>
        <Txt variant="readout" muted>#{collectorNumber(card)} · {card.rarity} · {cardKindLabel(card)}{card.hp ? ` · HP ${card.hp}` : ''}</Txt>
        <Txt variant="caption" muted>{pokemonIds(card).length ? `Pokédex entries: ${pokemonIds(card).map(id => speciesById.get(id)?.en ?? `#${id}`).join(' & ')}` : 'Counts toward your binder and collection badges.'}</Txt>
      </View>
      <View style={m.section}><ChoiceMenu disabled={busy} label="Printing" options={printingChoices.map(id => ({ id, label: FINISH_LABELS[id] }))} value={finish} onChange={value => !busy && setFinish(value)} />{!entry && <Txt variant="caption" muted>Compare the artwork and card number with yours. Holo shines on the picture; reverse holo shines around it. “Not sure yet” is okay.</Txt>}</View>
      {liveEntry ? <><CopiesField finish={liveEntry.finish} quantity={liveEntry.quantity} busy={busy} minusLabel="Remove one copy" plusLabel="Add one copy" onMinus={() => liveEntry.quantity === 1 ? setRemoving(true) : run(() => updateTrainer(t => updateQuantity(t, liveEntry.key, liveEntry.quantity - 1)))} onPlus={() => run(() => updateTrainer(t => updateQuantity(t, liveEntry.key, liveEntry.quantity + 1)))} />
        <CardValuePanel card={card} finish={finish} quantity={liveEntry.quantity} />
        {card.description && <Txt>{card.description}</Txt>}
        {!removing && <ActionRow title="Delete card" destructive disabled={busy} onPress={() => setRemoving(true)} />}
        {removing && <View onLayout={event => cardScroll.current?.scrollTo({ y: Math.max(0, event.nativeEvent.layout.y - S.sm), animated: true })} style={m.removeBox}><Txt variant="cardTitle">Delete {liveEntry.quantity === 1 ? 'this card' : `all ${liveEntry.quantity} copies`}?</Txt><Txt variant="caption">This removes {card.name} ({FINISH_LABELS[liveEntry.finish]}) from {trainer.name}'s binder. Other printings stay in your collection. You can add this card again later.</Txt>{locked && <Txt variant="caption" style={{ fontWeight: '600' }}>A grown-up answers a quick question first.</Txt>}<ActionRow title="Keep it" disabled={busy} onPress={() => setRemoving(false)} /><ActionRow title="Delete card" destructive icon={locked ? 'lock' : undefined} disabled={busy} detail={busy ? 'Deleting…' : undefined} onPress={() => requireGrownUp(() => run(async () => { await updateTrainer(t => updateQuantity(t, liveEntry.key, 0)); onClose(); }), 'delete this card')} /></View>}
      </> : <><CopiesField finish={finish} quantity={quantity} busy={busy} minusDisabled={quantity <= 1} minusLabel="Fewer copies" plusLabel="More copies" onMinus={() => setQuantity(n => Math.max(1, n - 1))} onPlus={() => setQuantity(n => Math.min(999, n + 1))} /><CardValuePanel card={card} finish={finish} quantity={quantity} />
        {canWish && <><WishButton wished={wished} disabled={busy || wishing} onPress={toggleWished} /><ErrorNotice text={wishError} /><Txt variant="caption" muted>{wished ? 'When you get it, add it to your binder. Wish granted!' : 'Don’t have it yet? Wish for it and share your list with family.'}</Txt></>}</>}
    </>}
  </ScrollView>{card && !loading && (!liveEntry || finish !== liveEntry.finish) && <View style={m.footer}>{liveEntry ? <Button title="Save printing" busy={busy} onPress={() => run(async () => { await updateTrainer(t => changePrinting(t, liveEntry.key, finish)); onClose(); })} /> : <Button title={`Add ${quantity === 1 ? 'to binder' : `${quantity} to binder`}`} icon="plus" onPress={save} busy={busy} />}</View>}</Sheet>;
}

/** Copy controls stay in one row until the measured space or text size needs a second line. */
function CopiesField({ finish, quantity, busy, minusDisabled = false, minusLabel, plusLabel, onMinus, onPlus }: { finish: Finish; quantity: number; busy: boolean; minusDisabled?: boolean; minusLabel: string; plusLabel: string; onMinus: () => void; onPlus: () => void }) {
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const [stepperWidth, setStepperWidth] = useState(0);
  const stacked = width > 0 && width < (stepperWidth || 128) + S.lg + 112 * Math.min(fontScale, 1.4);
  return <View onLayout={e => setWidth(e.nativeEvent.layout.width)} style={[m.quantityField, stacked && m.quantityStacked]}><View style={[m.quantityLabel, stacked && { flex: 0, width: '100%' }]}><Txt>Copies</Txt><Txt variant="caption" muted>{FINISH_LABELS[finish]}</Txt></View><View onLayout={e => setStepperWidth(e.nativeEvent.layout.width)} style={m.stepper}><StepButton icon="minus" label={minusLabel} disabled={busy || minusDisabled} onPress={onMinus} /><Txt variant="readout" style={m.stepperNumber}>{quantity}</Txt><StepButton icon="plus" label={plusLabel} disabled={busy} onPress={onPlus} /></View></View>;
}

function StepButton({ icon, label, disabled, onPress }: { icon: 'minus' | 'plus'; label: string; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={() => { tick(); onPress(); }} style={state => [m.stepButton, disabled && { opacity: .4 }, pressFx(state)]}><Icon name={icon} size={20} /></Pressable>;
}

const nameOf = (id: number) => speciesById.get(id)?.en ?? `#${id}`;
const listNames = (ids: number[]) => ids.length < 2 ? ids.map(nameOf).join('') : `${ids.slice(0, -1).map(nameOf).join(', ')} and ${nameOf(ids[ids.length - 1])}`;
function familyNote(ids: number[], discovered: ReadonlySet<number>) {
  const have = ids.filter(id => discovered.has(id));
  if (have.length === ids.length) return 'You have the whole family!';
  if (!have.length) return 'Who will you discover first?';
  return have.length <= 3 ? `You have ${listNames(have)}!` : `You have ${have.length} of ${ids.length} in this family!`;
}

/** The moving sprite the games show on the Pokédex screen; newer Pokémon without one use their artwork. */
function AnimatedSprite({ id }: { id: number }) {
  const [failed, setFailed] = useState(false);
  const source = animatedSprite(id);
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={m.sprite}><Image source={failed || !source ? speciesImage(id) : source} style={{ width: '100%', height: '100%' }} contentFit="contain" cachePolicy="memory-disk" onError={() => setFailed(true)} /></View>;
}

export function SpeciesModal({ id, onClose, onFindCards, onEntry, onSpecies }: { id: number; onClose: () => void; onFindCards: (name: string) => void; onEntry: (entry: Entry) => void; onSpecies: (id: number) => void }) {
  const { trainer } = useCollection();
  const { width, fontScale } = useWindowDimensions();
  const pokemon = speciesById.get(id)!;
  const entries = trainer.entries.filter(e => pokemonIds(e.card).includes(id));
  const owned = entries.length > 0;
  const cardCount = entries.reduce((n, e) => n + e.quantity, 0);
  const wished = wishesForSpecies(trainer, id).length;
  const discovered = useMemo(() => discoveredIds(trainer), [trainer]);
  const types = speciesTypes(id);
  const entry = pokedexEntry(id);
  const family = evolutionFamily(id);
  const voice = usePokedexVoice();
  const reading = voice.speaking === id;
  const familyIds = family.flat().map(member => member.id);
  // Keep names readable rather than squeezing every stage into the sheet.
  // Large branching families wrap beside their previous stage.
  const wideColumns = width >= 700 ? 4 : 2;
  const tile = Math.ceil(94 * Math.min(fontScale, 1.4));
  return <Sheet title={`Pokédex #${String(id).padStart(3, '0')}`} onClose={onClose}><ScrollView contentContainerStyle={m.content}>
    <View style={{ alignItems: 'center', gap: S.sm }}><Image accessibilityLabel={owned ? pokemon.en : `${pokemon.en} silhouette`} source={speciesImage(id)} style={{ width: 180, maxWidth: '100%', height: 160, opacity: owned ? 1 : .3 }} tintColor={owned ? undefined : '#526B50'} contentFit="contain" cachePolicy="memory-disk" /><Txt style={[ui.title, { textAlign: 'center' }]}>{pokemon.en}</Txt>
      {types.length > 0 && <View accessible accessibilityLabel={`${types.map(typeLabel).join(' and ')} type`} style={[ui.row, { flexWrap: 'wrap', justifyContent: 'center' }]}>{types.map(type => <TypePill key={type} type={type} />)}</View>}
      <Txt variant="caption" muted style={{ textAlign: 'center' }}>{pokemon.ja} · {pokemon.genus}</Txt><Txt variant="caption" muted style={{ textAlign: 'center' }}>{owned ? `${cardCount} ${cardCount === 1 ? 'card' : 'cards'} collected` : 'Not discovered yet'}</Txt></View>
    <View style={m.entry}>
      <Txt accessibilityRole="header" variant="subtitle">Pokédex entry</Txt>
      <View style={m.entryScreen}>{owned
        ? <><View accessible accessibilityLabel={`Pokédex entry. ${entry ?? 'Coming soon.'}`} style={[ui.row, { alignItems: 'flex-start', gap: 12 }]}><AnimatedSprite id={id} /><Txt style={[m.entryText, { flex: 1 }]}>{entry ?? 'This Pokédex entry is still being written.'}</Txt></View>
          <View style={[ui.row, { marginTop: 12, flexWrap: 'wrap' }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={reading ? 'Stop reading' : `Read ${pokemon.en}'s Pokédex entry aloud`} onPress={() => reading ? voice.stop() : voice.speak(id)} style={({ pressed }) => [m.voiceButton, reading && m.voiceActive, pressed && { opacity: .7 }]}><Icon name={reading ? 'stop' : 'speaker'} size={18} color={reading ? 'white' : C.ink} /><Txt variant="control" style={[m.voiceText, reading && { color: 'white' }]}>{reading ? 'Stop' : 'Read it to me'}</Txt></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Play ${pokemon.en}'s cry`} onPress={() => voice.cry(id)} style={({ pressed }) => [m.voiceButton, pressed && { opacity: .7 }]}><Icon name="note" size={18} /><Txt variant="control" style={m.voiceText}>Hear its cry</Txt></Pressable>
          </View></>
        : <View accessible accessibilityLabel={`Pokédex entry locked. Discover ${pokemon.en} to unlock it.`} style={[ui.row, { alignItems: 'flex-start' }]}><Icon name="lock" size={24} color="#6B7B64" /><View style={{ flex: 1, gap: S.xs }}><Txt style={[m.entryText, { fontWeight: '600' }]}>Discover {pokemon.en} to unlock its Pokédex entry!</Txt><Txt variant="caption" muted>Scan or add any {pokemon.en} card.</Txt></View></View>}</View>
    </View>
    <View style={{ gap: 10 }}><Txt style={ui.subtitle}>Evolution</Txt>{family.length > 1 ? <>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={m.evolution}>{family.map((stage, i) => <Fragment key={i}>
        {i > 0 && <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Icon name="arrow" size={14} color={C.muted} /></View>}
        <View style={[m.stage, stage.length > 3 && { flexDirection: 'row', flexWrap: 'wrap', width: wideColumns * tile + (wideColumns - 1) * 6 }]}>{stage.map(member => {
          const current = member.id === id, found = discovered.has(member.id);
          return <Pressable key={member.id} accessibilityRole="button" accessibilityLabel={`${nameOf(member.id)}, ${found ? 'discovered' : 'not yet discovered'}${current ? ', showing now' : ''}`} accessibilityState={{ selected: current }} onPress={() => !current && onSpecies(member.id)} style={({ pressed }) => [m.stageTile, { minWidth: tile }, current && m.stageCurrent, pressed && !current && { opacity: .7 }]}>
            <Image source={speciesImage(member.id)} style={[{ width: 76, height: 76 }, !found && { opacity: .3 }]} tintColor={found ? undefined : '#526B50'} contentFit="contain" cachePolicy="memory-disk" />
            <Txt variant="caption" style={m.stageName}>{nameOf(member.id)}</Txt>
          </Pressable>;
        })}</View>
      </Fragment>)}</ScrollView>
      <Txt variant="label" style={{ textAlign: 'center' }}>{familyNote(familyIds, discovered)}</Txt>
    </> : <Txt muted>{pokemon.en} doesn’t evolve. It’s one of a kind!</Txt>}</View>
    <Button title={`Find ${pokemon.en} cards`} icon="search" onPress={() => onFindCards(pokemon.en)} />
    {wished > 0 && <View style={[m.wishBadge, { alignSelf: 'center' }]}><Icon name="star" size={16} color={WISH.star} filled /><Txt variant="caption" style={m.wishBadgeText}>{wished} {pokemon.en} {wished === 1 ? 'card' : 'cards'} on your wishlist</Txt></View>}
    {owned && <><Txt style={ui.subtitle}>Your {pokemon.en} cards</Txt><View style={m.cardGrid}>{entries.map(e => <Pressable accessibilityRole="button" accessibilityLabel={`Open ${e.card.name}, ${e.card.set.name}, ${collectorNumber(e.card)}, ${LANGUAGE_LABELS[e.card.language]}, ${FINISH_LABELS[e.finish]}${e.quantity > 1 ? `, ${e.quantity} copies` : ''}`} key={e.key} onPress={() => { tick(); onEntry(e); }} style={state => [m.cardTile, pressFx(state)]}><View><CardArt card={e.card} />{e.quantity > 1 && <View style={m.countBadge}><Txt style={m.countText}>×{e.quantity}</Txt></View>}</View><CardCaption name={e.card.name} setName={e.card.set.name} detail={`${LANGUAGE_CODES[e.card.language]} · ${collectorNumber(e.card)} · ${FINISH_LABELS[e.finish]}`} /><CardPriceTag card={e.card} finish={e.finish} /></Pressable>)}</View></>}
  </ScrollView></Sheet>;
}

function TrainerChoiceRow({ title, options, value, labels, busy, onChange }: { title: string; options: readonly string[]; value: string; labels: Record<string, string>; busy: boolean; onChange: (value: string) => void }) {
  return <ChoiceMenu disabled={busy} label={title} options={options.map(id => ({ id, label: labels[id] }))} value={value} onChange={next => !busy && onChange(next)} />;
}

type Feedback = { at: string; note?: string; error?: string };
type ProfilePage = 'settings' | 'rename' | 'add' | 'appearance' | 'about';

export function ProfilesModal({ onClose, onBusyChange }: { onClose: () => void; onBusyChange: (busy: boolean) => void }) {
  const { collection, trainer, transact, updateTrainer } = useCollection();
  const [name, setName] = useState(trainer.name);
  const [newName, setNewName] = useState('');
  const [page, setPage] = useState<ProfilePage>('settings');
  const [draft, setDraft] = useState<TrainerAppearance>(trainer.appearance);
  // Which action is saving: only its row reports progress, the rest wait.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const busy = busyKey !== null;
  const guard = useRef(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const { locked, requireGrownUp, gate } = useGrownUpCheck();
  async function run(key: string, action: (note: (text: string) => void) => Promise<void>, at = key) {
    if (guard.current) return;
    guard.current = true; setBusyKey(key); onBusyChange(true); setFeedback(null);
    try { await action(text => setFeedback({ at, note: text })); } catch (e) { setFeedback({ at, error: e instanceof Error ? e.message : 'The change could not be saved.' }); }
    finally { guard.current = false; setBusyKey(null); onBusyChange(false); }
  }
  const feedbackAt = (at: string) => feedback?.at === at ? <><ErrorNotice text={feedback.error ?? null} />{feedback.note && <View accessibilityLiveRegion="polite"><Txt variant="caption" muted>{feedback.note}</Txt></View>}</> : null;
  function choose(part: keyof TrainerAppearance, value: string) {
    setDraft(current => ({ ...current, [part]: value } as TrainerAppearance));
  }
  function returnToSettings() {
    setName(trainer.name); setNewName(''); setDraft(trainer.appearance); setPage('settings');
  }
  function saveName() {
    run('name', async note => { await updateTrainer(t => ({ ...t, name: name.trim() })); setPage('settings'); note('Trainer name saved.'); });
  }
  function addTrainer() {
    run('add', async note => {
      await transact(c => {
        if (c.trainers.length >= 20) throw new Error('This device already has 20 trainers.');
        const appearance = trainerAppearanceFor(c.trainers.length);
        return { ...c, trainers: [...c.trainers, { id: `trainer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: newName.trim(), color: TRAINER_OUTFIT_COLORS[appearance.outfit], appearance, entries: [], wishlist: [] }] };
      });
      setNewName(''); setPage('settings'); note('New trainer added! Tap their name above to play as them.');
    });
  }
  if (page === 'about') return <Sheet title="About" onClose={onClose} onBack={returnToSettings}><AboutScreen><View style={m.aboutDetails}><Txt variant="caption" muted>Saved on this device. Live family syncing is planned for a later version. Card text is read on your iPhone/iPad; photos are not sent to a server.</Txt><Txt variant="caption" muted>Card data and images: TCGdex. Pokémon names, Pokédex data and artwork: PokéAPI. An unofficial family fan project. Pokémon belongs to its respective owners.</Txt></View></AboutScreen></Sheet>;
  if (page === 'rename' || page === 'add') {
    const adding = page === 'add', key = adding ? 'add' : 'name';
    const value = adding ? newName : name;
    const disabled = busy || !value.trim() || (adding ? collection.trainers.length >= 20 : value.trim() === trainer.name);
    return <Sheet title={adding ? 'Add a trainer' : 'Trainer name'} onClose={onClose} onBack={returnToSettings} busy={busy} dismissible={false}><ScrollView style={m.scrolling} contentContainerStyle={m.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"><Txt variant="label">{adding ? 'Name' : 'Trainer name'}</Txt><TextInput accessibilityLabel={adding ? 'New trainer name' : 'Trainer name'} placeholder={adding ? 'New trainer’s name' : undefined} placeholderTextColor={C.muted} value={value} onChangeText={adding ? setNewName : setName} autoFocus maxLength={32} maxFontSizeMultiplier={1.4} style={m.input} editable={!busy} returnKeyType="done" onSubmitEditing={() => !disabled && (adding ? addTrainer() : saveName())} /><Txt variant="caption" muted>{adding ? 'Each trainer gets their own Pokédex and binder.' : 'This name appears on your trainer profile.'}</Txt>{feedbackAt(key)}</ScrollView><View style={m.footer}><Button title={adding ? 'Add trainer' : 'Save name'} icon={adding ? 'plus' : undefined} disabled={disabled} busy={busyKey === key} onPress={adding ? addTrainer : saveName} /></View></Sheet>;
  }
  if (page === 'appearance') return <Sheet title="Trainer appearance" onClose={onClose} onBack={returnToSettings} busy={busy} dismissible={false}><View style={m.builderPreview}><TrainerAvatar appearance={draft} size={88} /><View style={{ flex: 1, minWidth: 0, gap: S.xs }}><Txt variant="subtitle">{trainer.name}</Txt><Txt variant="caption" muted>Your look updates as you choose.</Txt></View></View><ScrollView style={m.scrolling} contentContainerStyle={m.builderContent}>
    <TrainerChoiceRow title="Skin tone" options={TRAINER_SKIN_TONES} value={draft.skinTone} labels={TRAINER_APPEARANCE_LABELS.skinTone} busy={busy} onChange={value => choose('skinTone', value)} />
    <TrainerChoiceRow title="Hair style" options={TRAINER_HAIR_STYLES} value={draft.hairStyle} labels={TRAINER_APPEARANCE_LABELS.hairStyle} busy={busy} onChange={value => choose('hairStyle', value)} />
    <TrainerChoiceRow title="Hair color" options={TRAINER_HAIR_COLORS} value={draft.hairColor} labels={TRAINER_APPEARANCE_LABELS.hairColor} busy={busy} onChange={value => choose('hairColor', value)} />
    <TrainerChoiceRow title="Jacket" options={TRAINER_OUTFITS} value={draft.outfit} labels={TRAINER_APPEARANCE_LABELS.outfit} busy={busy} onChange={value => choose('outfit', value)} />
    <TrainerChoiceRow title="Hat" options={TRAINER_HEADWEAR} value={draft.headwear} labels={TRAINER_APPEARANCE_LABELS.headwear} busy={busy} onChange={value => choose('headwear', value)} />
    {feedbackAt('look')}
  </ScrollView><View style={m.footer}><Button title="Save my look" busy={busyKey === 'look'} onPress={() => run('look', async note => { await updateTrainer(t => ({ ...t, appearance: draft, color: TRAINER_OUTFIT_COLORS[draft.outfit] })); setPage('settings'); note('New look saved!'); })} /></View></Sheet>;

  return <Sheet title="Settings" onClose={onClose} busy={busy} overlay={gate}><ScrollView style={m.scrolling} contentContainerStyle={[m.content, { gap: S.xxl }]} keyboardShouldPersistTaps="handled">
    <View style={m.section}>
      <Txt accessibilityRole="header" variant="label" muted>Your trainers</Txt>
      {collection.trainers.map(t => {
        const active = t.id === trainer.id, key = `switch-${t.id}`;
        return <Pressable accessibilityRole="button" accessibilityLabel={active ? `${t.name}, playing now` : `Switch to ${t.name}`} accessibilityState={{ selected: active, disabled: busy }} key={t.id} disabled={busy} onPress={() => { tick(); run(key, async () => { await transact(c => ({ ...c, activeId: t.id })); setName(t.name); setDraft(t.appearance); }, 'switch'); }} style={state => [m.profile, busy && busyKey !== key && { opacity: .6 }, pressFx(state)]}><TrainerAvatar appearance={t.appearance} size={36} /><View style={{ flex: 1, minWidth: 0, gap: 2 }}><Txt style={{ fontWeight: active ? '600' : '400' }}>{t.name}</Txt><Txt variant="caption" muted>{totalCards(t)} cards · {discoveredIds(t).size} Pokémon</Txt></View>{busyKey === key ? <ActivityIndicator color={C.ink} /> : active && <Icon name="check" size={20} />}</Pressable>;
      })}
      {feedbackAt('switch')}
      <ActionRow title="Add trainer" icon="plus" disabled={busy || collection.trainers.length >= 20} detail={collection.trainers.length >= 20 ? 'This device already has 20 trainers.' : undefined} onPress={() => { setNewName(''); setFeedback(null); setPage('add'); }} />
      {feedbackAt('add')}
    </View>
    <View style={m.section}>
      <Txt accessibilityRole="header" variant="label" muted>Your profile</Txt>
      <ActionRow title="Name" value={trainer.name} disabled={busy} onPress={() => { setName(trainer.name); setFeedback(null); setPage('rename'); }} />
      {feedbackAt('name')}
      <ActionRow title="Appearance" icon="user" disabled={busy} onPress={() => { setFeedback(null); setDraft(trainer.appearance); setPage('appearance'); }} />
      {feedbackAt('look')}
    </View>
    <View style={m.section}>
      <Txt accessibilityRole="header" variant="label" muted>Family</Txt>
      <View style={m.lockRow}><Icon name="lock" size={20} /><Txt style={{ flex: 1, minWidth: 0 }}>Grown-up lock</Txt>{busyKey === 'lock' ? <ActivityIndicator color={C.ink} /> : <Switch accessibilityLabel="Grown-up lock" accessibilityHint={locked ? 'Turning it off asks a grown-up question first' : undefined} value={locked} disabled={busy} trackColor={{ true: C.red, false: '#C7D2BB' }} onValueChange={on => on ? run('lock', async note => { await transact(c => ({ ...c, grownUpLock: true })); note('Grown-up lock is on.'); }) : requireGrownUp(() => run('lock', async note => { await transact(c => ({ ...c, grownUpLock: false })); note('Grown-up lock is off.'); }), 'turn off the grown-up lock')} />}</View>
      <Txt variant="caption" muted>{locked ? 'A grown-up solves a math question before cards are deleted or backups are used.' : 'Anyone can delete cards or use backups.'}</Txt>
      {feedbackAt('lock')}
      <ActionRow title="Save backup" icon="download" disabled={busy} detail={busyKey === 'export' ? 'Saving…' : undefined} onPress={() => requireGrownUp(() => run('export', () => exportFile(portableBackup(collection)), 'backup'), 'save a backup')} />
      <ActionRow title="Load backup" icon="upload" disabled={busy} detail={busyKey === 'import' ? 'Loading…' : undefined} onPress={() => requireGrownUp(() => run('import', async note => { const raw = await importFile(); if (!raw) return; const incoming = parseCollection(raw); await transact(c => mergeBackup(c, incoming)); note(`Added ${incoming.trainers.length} trainer${incoming.trainers.length === 1 ? '' : 's'} from the backup.`); }, 'backup'), 'load a backup')} />
      <Txt variant="caption" muted>Save everyone’s cards. Loading a backup adds trainers and erases nothing.</Txt>
      {feedbackAt('backup')}
    </View>
    <View style={m.section}><ActionRow title="About this app" disabled={busy} onPress={() => setPage('about')} /><Txt variant="caption" muted>Cards are saved on this device.</Txt></View>
  </ScrollView></Sheet>;
}

const WISH = { star: '#B98310', ink: '#664C0E' };
function WishButton({ wished, disabled, onPress }: { wished: boolean; disabled: boolean; onPress: () => void }) {
  return <Button title={wished ? 'On your wishlist' : 'Add to wishlist'} accessibilityHint={wished ? 'Takes this card off your wishlist' : 'Saves this card to a list you can share with family'} selected={wished} icon="star" size="medium" secondary disabled={disabled} onPress={onPress} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }} />;
}

function WishTile({ wish, columns, onOpen, onRemove }: { wish: Wish; columns: number; onOpen: () => void; onRemove: () => void }) {
  const { card } = wish;
  const set = setForCard(card)?.name;
  return <View style={{ flex: 1 / columns, marginBottom: S.lg }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${card.name}, ${set ? `${set}, ` : ''}number ${card.localId}, ${LANGUAGE_LABELS[card.language]}`} accessibilityHint="Opens the card so you can add it when you get it" onPress={() => { tick(); onOpen(); }} style={pressFx}>
      <CardArt card={card} /><CardCaption name={card.name} setName={set ?? card.id} detail={`${LANGUAGE_CODES[card.language]} · #${card.localId}`} />
    </Pressable>
    <CardPriceTag card={card} printingHint={false} />
    {/* A sibling, not a child, of the tile button so VoiceOver can reach it. */}
    <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${card.name} from your wishlist`} onPress={() => { tick(); onRemove(); }} style={state => [m.wishRemove, pressFx(state)]}><View style={m.wishRemoveDot}><Icon name="close" size={16} /></View></Pressable>
  </View>;
}

export function WishlistModal({ onClose, onCard, onFind }: { onClose: () => void; onCard: (card: CardBrief) => void; onFind: () => void }) {
  const { trainer, updateTrainer } = useCollection();
  const wishes = wishesOf(trainer);
  const { width } = useWindowDimensions();
  const columns = Math.min(600, width - 24) - 40 >= 440 ? 3 : 2;
  const [removed, setRemoved] = useState<{ wish: Wish; index: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareFailed, setShareFailed] = useState(false);
  function change(update: (t: Trainer) => Trainer) {
    setError(null);
    updateTrainer(update).catch(e => setError(e instanceof Error ? e.message : 'We could not update your wishlist. Please try again.'));
  }
  async function share() {
    setShareFailed(false);
    try { await Share.share({ message: wishlistShareText(trainer.name, wishes) }, { subject: `${trainer.name}'s Pokémon card wishlist`, dialogTitle: 'Share your wishlist' }); }
    // Some browsers cannot share; show the list so a grown-up can copy it. Cancelling is not an error.
    catch (e) { if (!(e instanceof Error && e.name === 'AbortError')) setShareFailed(true); }
  }
  return <Sheet title="Your wishlist" onClose={onClose}><FlatList key={columns} data={wishes} numColumns={columns} keyExtractor={w => w.key} columnWrapperStyle={{ gap: S.md }} contentContainerStyle={m.wishList}
    ListHeaderComponent={<View style={{ gap: S.lg, marginBottom: wishes.length ? S.xl : 0 }}>
      {wishes.length > 0 && <><View style={ui.between}><Txt variant="caption" muted style={{ flex: 1 }}>{wishes.length} {wishes.length === 1 ? 'wish' : 'wishes'} · {trainer.name}</Txt><ToolbarAction title="Share wishlist" icon="upload" onPress={share} /></View><Txt variant="caption" muted>Tap a card to add it when you get it. Prices are ungraded estimates to help grown-ups shop.</Txt></>}
      {removed && <View style={[m.note, ui.between, { paddingVertical: S.xs }]}><Txt variant="caption" style={{ flex: 1 }}>Removed {removed.wish.card.name}.</Txt><Pressable accessibilityRole="button" accessibilityLabel={`Undo. Put ${removed.wish.card.name} back on your wishlist`} hitSlop={4} onPress={() => { tick(); const { wish, index } = removed; setRemoved(null); change(t => restoreWish(t, wish, index)); }} style={state => [m.undo, pressFx(state)]}><Txt variant="label" style={{ textDecorationLine: 'underline' }}>Undo</Txt></Pressable></View>}
      <ErrorNotice text={error} />
      {shareFailed && wishes.length > 0 && <View style={[m.note, { gap: S.sm }]}><Txt variant="cardTitle">Sharing isn’t available here.</Txt><Txt variant="caption" muted>Copy this list instead:</Txt><Txt variant="caption" selectable>{wishlistShareText(trainer.name, wishes)}</Txt></View>}
    </View>}
    ListEmptyComponent={<View style={m.wishEmpty}><View style={m.wishEmptyStar}><Icon name="star" size={46} color={WISH.star} filled /></View><Txt style={ui.subtitle}>No wishes yet</Txt><Txt muted style={{ textAlign: 'center', maxWidth: 320 }}>Find a card you’d love to get, then tap “Add to wishlist.” Your wishes show up here, ready to share with family.</Txt><Button title="Find cards to wish for" icon="search" onPress={onFind} style={{ alignSelf: 'stretch' }} /></View>}
    renderItem={({ item, index }) => <WishTile wish={item} columns={columns} onOpen={() => onCard(item.card)} onRemove={() => { setRemoved({ wish: item, index }); change(t => removeWish(t, item.key)); }} />} /></Sheet>;
}

export function DiscoveryModal({ card, newIds, quantity, granted = 0, nextLabel, onNext, onClose }: { card: Card; newIds: number[]; quantity: number; granted?: number; nextLabel: string; onNext: () => void; onClose: () => void }) {
  const reduced = useReducedMotion();
  const [revealed, setRevealed] = useState(reduced);
  const [index, setIndex] = useState(0);
  const reveal = useCallback(() => setRevealed(true), []);
  const discovered = newIds.length > 0;
  const id = newIds[index];
  const pokemon = speciesById.get(id);
  const voice = usePokedexVoice();
  const ready = !discovered || revealed;
  function select(next: number) { voice.stop(); setIndex(next); }
  useEffect(() => {
    if (!discovered || !revealed || Platform.OS !== 'ios') return;
    let cancelled = false;
    void AccessibilityInfo.isScreenReaderEnabled().then(enabled => {
      if (enabled && !cancelled) AccessibilityInfo.announceForAccessibility(`${pokemon?.en ?? `Pokémon number ${id}`} discovered.${newIds.length > 1 ? ` ${index + 1} of ${newIds.length} new Pokémon.` : ''}`);
    });
    return () => { cancelled = true; };
  }, [discovered, revealed, id, index, newIds.length, pokemon?.en]);

  return <Sheet title={discovered ? 'Pokédex updated' : 'Added to your binder'} onClose={onClose} dismissible={false}>
    <ScrollView contentContainerStyle={[m.content, { alignItems: 'center' }]}>
      {discovered ? <DiscoveryDevice id={id} onReveal={reveal} /> : <View style={m.savedCard}>
        {!reduced && <Confetti count={18} />}
        <Reanimated.View entering={reduced ? undefined : ZoomIn.duration(220)}>
          {isShiny(card) ? <HoloShine style={{ width: 185 }}><CardArt card={card} /></HoloShine> : <CardArt card={card} style={{ width: 185 }} />}
        </Reanimated.View>
      </View>}
      <View style={m.discoveryCopy}>
        <Txt accessibilityRole="header" accessibilityLiveRegion="polite" variant="title" style={m.center}>{!ready ? 'A new discovery…' : discovered ? pokemon?.en ?? `Pokémon #${id}` : quantity > 1 ? `${quantity} cards added` : card.name}</Txt>
        <Txt muted style={m.center}>{!ready ? 'Tap the Pokédex to reveal it.' : discovered ? 'Discovered in your collection' : 'Saved in your binder'}</Txt>
        {ready && pokemon && <Txt variant="caption" muted style={m.center}>#{String(pokemon.id).padStart(3, '0')} · {pokemon.genus}</Txt>}
      </View>
      {ready && discovered && newIds.length > 1 && <View style={m.discoveryPager}>
        <IconButton icon="back" label="Previous discovery" disabled={index === 0} onPress={() => select(index - 1)} />
        <Txt variant="caption" accessibilityLiveRegion="polite">{index + 1} of {newIds.length} new Pokémon</Txt>
        <View style={{ transform: [{ rotate: '180deg' }] }}><IconButton icon="back" label="Next discovery" disabled={index === newIds.length - 1} onPress={() => select(index + 1)} /></View>
      </View>}
      {ready && pokemon && <View style={m.discoveryAudio}>
        <ToolbarAction title={voice.speaking === id ? 'Stop reading' : 'Hear entry'} icon={voice.speaking === id ? 'stop' : 'speaker'} onPress={() => voice.speaking === id ? voice.stop() : void voice.speak(id)} />
        <ToolbarAction title="Play cry" icon="note" onPress={() => void voice.cry(id)} />
      </View>}
      {ready && granted > 0 && <View style={m.wishBadge}><Icon name="star" size={18} color={WISH.star} filled /><Txt variant="caption" style={m.wishBadgeText}>{granted === 1 ? 'Wish granted. It’s off your wishlist.' : `${granted} wishes granted. They’re off your wishlist.`}</Txt></View>}
    </ScrollView>
    {ready && <View style={m.footer}><ButtonRow><Button title="Done" onPress={onClose} /><Button title={nextLabel} icon="camera" secondary onPress={onNext} /></ButtonRow></View>}
  </Sheet>;
}

const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#14201CC9', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  sheet: { width: '100%', maxWidth: 600, maxHeight: '100%', backgroundColor: C.paper, borderRadius: 20, overflow: 'hidden' },
  scrolling: { flexShrink: 1 }, content: { padding: S.xl, paddingBottom: S.xxl, gap: S.lg }, loading: { padding: 50, alignItems: 'center', gap: 14 },
  footer: { padding: S.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, backgroundColor: C.paper },
  cardHero: { alignItems: 'center' }, languageTag: { paddingVertical: S.xs },
  quantityField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S.lg, paddingVertical: S.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  quantityStacked: { flexDirection: 'column', alignItems: 'flex-start' }, quantityLabel: { flex: 1, minWidth: 0, gap: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#E8EEE1', borderRadius: 8 }, stepButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepperNumber: { fontSize: 20, lineHeight: 26, fontWeight: '600', minWidth: 32, textAlign: 'center' },
  removeBox: { paddingVertical: S.md, gap: S.sm }, note: { paddingVertical: S.sm },
  lockRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingVertical: S.md },
  profile: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: S.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  builderPreview: { flexDirection: 'row', alignItems: 'center', gap: S.lg, padding: S.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  builderContent: { paddingHorizontal: S.xl, paddingBottom: S.lg, gap: S.sm }, aboutDetails: { gap: S.md }, section: { gap: S.sm },
  input: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: '#B8C6AC', borderRadius: 12, backgroundColor: '#FCFDF9', color: C.ink, fontSize: 15 },
  entry: { gap: S.md }, entryScreen: { gap: S.sm },
  voiceButton: { minHeight: 44, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: S.sm, paddingVertical: S.sm, borderRadius: 8 },
  voiceActive: { backgroundColor: C.ink }, voiceText: { flexShrink: 1 },
  sprite: { width: 48, height: 48 }, entryText: { fontSize: 15, lineHeight: 22 },
  evolution: { flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  stage: { gap: 6, justifyContent: 'center' }, stageTile: { minHeight: 88, alignItems: 'center', justifyContent: 'center', padding: 3, borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },
  stageCurrent: { backgroundColor: '#F8FAF3', borderColor: '#ADC79F' }, stageName: { fontWeight: '600', textAlign: 'center' },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 16 }, cardTile: { width: '48%' },
  countBadge: { position: 'absolute', top: 6, right: 6, minWidth: 36, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, backgroundColor: C.ink, alignItems: 'center' }, countText: { color: 'white', fontFamily: mono, fontSize: 14, fontWeight: '700' },
  wishBadge: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: S.sm },
  wishBadgeText: { color: WISH.ink, fontWeight: '600', flexShrink: 1 },
  wishList: { padding: 20, paddingBottom: 26 }, undo: { minHeight: 44, minWidth: 56, alignItems: 'center', justifyContent: 'center' },
  wishRemove: { position: 'absolute', top: 0, right: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  wishRemoveDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFFFFFE8', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line },
  wishEmpty: { alignItems: 'center', gap: S.lg, paddingVertical: S.xl }, wishEmptyStar: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  savedCard: { alignItems: 'center', paddingVertical: S.lg },
  discoveryCopy: { alignSelf: 'stretch', gap: S.xs }, center: { textAlign: 'center' },
  discoveryPager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S.sm, flexWrap: 'wrap' },
  discoveryAudio: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: S.md, flexWrap: 'wrap' },
});
