import { ZoomablePhoto } from '@/components/zoomable-photo';
import { Image } from 'expo-image';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, FlatList, Pressable, ScrollView, Share, StyleSheet, Switch, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, ButtonRow, C, CardArt, Chip, ErrorNotice, Icon, IconButton, S, TypePill, Txt, mono, pressFx, tick, ui } from '@/components/pokedex-ui';
import { LANGUAGE_CODES, LANGUAGE_LABELS } from '@/lib/languages';
import { cardKindLabel, pokemonIds } from '@/lib/card-kind';
import { useCollection } from '@/lib/collection-context';
import { fetchCard, setForCard, speciesById, speciesImage } from '@/lib/catalog';
import { collectorNumber, changePrinting, defaultFinish, discoveredIds, FINISH_LABELS, mergeBackup, parseCollection, portableBackup, totalCards, TRAINER_HAIR_COLORS, TRAINER_HAIR_STYLES, TRAINER_HEADWEAR, TRAINER_OUTFITS, TRAINER_OUTFIT_COLORS, TRAINER_SKIN_TONES, trainerAppearanceFor, updateQuantity, type Card, type CardBrief, type Entry, type Finish, type Trainer, type TrainerAppearance } from '@/lib/model';
import { isWished, removeWish, restoreWish, toggleWish, wishesForSpecies, wishesOf, wishlistShareText, type Wish } from '@/lib/wishlist';
import { exportFile, importFile } from '@/lib/files';
import { useAddCards, type AddedCards } from '@/lib/use-add-cards';
import { CardPriceTag, CardValuePanel } from '@/components/card-values';
import { TRAINER_APPEARANCE_LABELS, TRAINER_HAIR_COLOR_VALUES, TRAINER_SKIN_COLORS, TrainerAvatar } from '@/components/trainer-avatar';
import { usePricing } from '@/lib/use-pricing';
import { priceKey } from '@/lib/pricing';
import { evolutionFamily, pokedexEntry, speciesTypes, typeLabel } from '@/lib/species-details';
import { useGrownUpCheck } from '@/components/grown-up-gate';
import { AboutScreen } from './about-screen';
import { animatedSprite } from '@/lib/pokedex-voice';
import { usePokedexVoice } from '@/lib/use-pokedex-voice';
import { CatchReveal, Confetti, HoloShine } from '@/components/celebration';
import { isShiny } from '@/lib/shine';
import Reanimated, { ZoomIn } from 'react-native-reanimated';

/** `overlay` (the grown-up check) covers the sheet and hides it from screen readers while open. `onBack` adds a back arrow for sub-pages; `dismissible={false}` stops a stray tap outside from throwing away a game or unsaved work. */
export function Sheet({ title, onClose, onBack, children, busy = false, dismissible = true, overlay }: { title: string; onClose: () => void; onBack?: () => void; children: ReactNode; busy?: boolean; dismissible?: boolean; overlay?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[m.overlay, { paddingTop: Math.max(insets.top, 15), paddingBottom: Math.max(insets.bottom, 15) }]}><Pressable accessibilityRole="button" accessibilityLabel="Close dialog" onPress={() => dismissible && !busy && onClose()} style={StyleSheet.absoluteFill} /><View accessibilityViewIsModal={!overlay} accessibilityElementsHidden={!!overlay} importantForAccessibility={overlay ? 'no-hide-descendants' : 'auto'} style={m.sheet}><View style={[m.sheetHeader, onBack && { paddingLeft: 10 }]}>{onBack && !busy && <IconButton round icon="back" label="Back" onPress={onBack} />}<Txt accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.8} style={[ui.subtitle, { flex: 1 }]}>{title}</Txt>{!busy && <IconButton round icon="close" label="Close" onPress={onClose} />}</View>{children}</View>{overlay}</View>;
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
  return <Sheet title={entry ? 'Inside your binder' : 'Is this your card?'} onClose={onClose} busy={busy} overlay={gate}><ScrollView contentContainerStyle={m.content} keyboardShouldPersistTaps="handled">
    {loading && <View style={m.loading}><ActivityIndicator color={C.ink} /><Txt>Finding the card details…</Txt></View>}
    <ErrorNotice text={error} />
    {!loading && !card && <Button title="Try again" onPress={() => setRetry(n => n + 1)} secondary />}
    {card && <>
      <View style={m.cardHero}><ZoomablePhoto aspectRatio={.716} label={`${card.name} card`} renderPhoto={(width) => <CardArt card={card} high style={{ width }} />}>{isShiny(card, finish) ? <HoloShine style={{ width: 210, maxWidth: '100%' }}><CardArt key={card.id} card={card} high /></HoloShine> : <CardArt key={card.id} card={card} high style={{ width: 210, maxWidth: '100%' }} />}</ZoomablePhoto><View style={m.languageTag}><Txt style={{ fontWeight: '800', fontSize: 12 }}>{LANGUAGE_LABELS[card.language]}</Txt></View></View>
      <View style={ui.between}><View style={{ flex: 1 }}><Txt style={ui.title}>{card.name}</Txt>{card.language !== 'en' && card.dexIds.length > 0 && <Txt muted>{card.dexIds.map(id => speciesById.get(id)?.en).filter(Boolean).join(' & ')}</Txt>}</View>{liveEntry && <IconButton icon="heart" color={liveEntry.favorite ? C.red : C.muted} filled={liveEntry.favorite} label={liveEntry.favorite ? 'Remove from favorites' : 'Add to favorites'} onPress={() => run(() => updateTrainer(t => ({ ...t, entries: t.entries.map(e => e.key === liveEntry.key ? { ...e, favorite: !e.favorite } : e) })))} />}</View>
      <View style={{ gap: 2, marginTop: -8 }}><Txt><Txt muted>{card.set.name} · </Txt><Txt style={{ fontWeight: '800' }}>{cardKindLabel(card)}</Txt></Txt><Txt muted style={{ fontSize: 13 }}>{pokemonIds(card).length ? `Pokédex entries: ${pokemonIds(card).map(id => speciesById.get(id)?.en ?? `#${id}`).join(' & ')}` : 'Counts toward your binder and collection badges.'}</Txt></View>
      <View style={m.cardMeta}><View><Txt muted style={m.small}>Card number</Txt><Txt style={{ fontFamily: mono, fontWeight: '700' }}>{collectorNumber(card)}</Txt></View><View><Txt muted style={m.small}>Rarity</Txt><Txt style={{ fontWeight: '700' }}>{card.rarity}</Txt></View>{card.hp && <View><Txt muted style={m.small}>HP</Txt><Txt style={{ fontWeight: '700' }}>{card.hp}</Txt></View>}</View>
      {!entry && <><Txt style={{ fontSize: 13, lineHeight: 20, color: C.muted }}>Compare the artwork and card number with yours before adding it.</Txt><Txt style={ui.subtitle}>Which printing?</Txt><View style={[ui.row, { flexWrap: 'wrap' }]}>{printingChoices.map(f => <Chip key={f} label={FINISH_LABELS[f]} selected={f === finish} onPress={() => !busy && setFinish(f)} />)}</View><Txt muted style={{ fontSize: 12, lineHeight: 18 }}>Holo has a shiny picture. Reverse holo usually shines around the picture. “Not sure yet” is okay.</Txt></>}
      {liveEntry && <><Txt style={ui.subtitle}>Your printing</Txt><View style={[ui.row, { flexWrap: 'wrap' }]}>{printingChoices.map(f => <Chip key={f} label={FINISH_LABELS[f]} selected={f === finish} onPress={() => !busy && setFinish(f)} />)}</View>{finish !== liveEntry.finish && <Button title="Save printing" secondary busy={busy} onPress={() => run(async () => { await updateTrainer(t => changePrinting(t, liveEntry.key, finish)); onClose(); })} />}</>}
      {!liveEntry && <CardValuePanel card={card} finish={finish} quantity={quantity} />}
      {liveEntry ? <><View style={ui.between}><View style={{ flex: 1 }}><Txt style={ui.subtitle}>Copies in your binder</Txt><Txt muted style={{ fontSize: 13 }}>{FINISH_LABELS[liveEntry.finish]}</Txt></View><View style={m.stepper}><StepButton icon="minus" label="Remove one copy" disabled={busy} onPress={() => liveEntry.quantity === 1 ? setRemoving(true) : run(() => updateTrainer(t => updateQuantity(t, liveEntry.key, liveEntry.quantity - 1)))} /><Txt style={m.stepperNumber}>{liveEntry.quantity}</Txt><StepButton icon="plus" label="Add one copy" disabled={busy} onPress={() => run(() => updateTrainer(t => updateQuantity(t, liveEntry.key, liveEntry.quantity + 1)))} /></View></View>
        {!removing && <Button title="Delete card" secondary disabled={busy} onPress={() => setRemoving(true)} />}
        {removing && <View style={m.removeBox}><Txt style={{ fontWeight: '800' }}>Delete {liveEntry.quantity === 1 ? 'this card' : `all ${liveEntry.quantity} copies`}?</Txt><Txt style={{ fontSize: 13 }}>This removes {card.name} ({FINISH_LABELS[liveEntry.finish]}) from {trainer.name}'s binder. Other printings stay in your collection. You can add this card again later.</Txt>{locked && <Txt style={{ fontSize: 13, fontWeight: '700' }}>A grown-up answers a quick question first.</Txt>}<ButtonRow><Button title="Keep it" size="medium" disabled={busy} onPress={() => setRemoving(false)} secondary /><Button title="Delete card" size="medium" icon={locked ? 'lock' : undefined} onPress={() => requireGrownUp(() => run(async () => { await updateTrainer(t => updateQuantity(t, liveEntry.key, 0)); onClose(); }), 'delete this card')} busy={busy} /></ButtonRow></View>}
        <CardValuePanel card={card} finish={finish} quantity={liveEntry.quantity} />
        {card.description && <View style={m.note}><Txt style={{ fontSize: 14 }}>{card.description}</Txt></View>}
      </> : <><View style={ui.between}><Txt style={[ui.subtitle, { flex: 1 }]}>How many copies?</Txt><View style={m.stepper}><StepButton icon="minus" label="Fewer copies" disabled={busy || quantity <= 1} onPress={() => setQuantity(n => Math.max(1, n - 1))} /><Txt style={m.stepperNumber}>{quantity}</Txt><StepButton icon="plus" label="More copies" disabled={busy} onPress={() => setQuantity(n => Math.min(999, n + 1))} /></View></View><Button title={`Add ${quantity === 1 ? 'to binder' : `${quantity} to binder`}`} icon="plus" onPress={save} busy={busy} />
        {canWish && <><WishButton wished={wished} disabled={busy || wishing} onPress={toggleWished} /><ErrorNotice text={wishError} /><Txt muted style={{ fontSize: 12, lineHeight: 18, textAlign: 'center' }}>{wished ? 'When you get it, add it to your binder. Wish granted!' : 'Don’t have it yet? Wish for it and share your list with family.'}</Txt></>}</>}
    </>}
  </ScrollView></Sheet>;
}

/** The big − / + keys beside a copy count. */
function StepButton({ icon, label, disabled, onPress }: { icon: 'minus' | 'plus'; label: string; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={() => { tick(); onPress(); }} style={state => [m.stepButton, disabled && { opacity: .4 }, pressFx(state)]}><Icon name={icon} size={24} /></Pressable>;
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
  const { width } = useWindowDimensions();
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
  // Only Eevee has more than three branches; wrap them into a grid beside it.
  // Tiles share the row (sheet width minus padding, arrows and gaps) so three stages fit a 375pt phone.
  const wideColumns = width >= 700 ? 4 : 2;
  const slots = family.reduce((n, stage) => n + (stage.length > 3 ? wideColumns : 1), 0);
  const tile = Math.min(96, Math.floor((Math.min(width - 24, 600) - 66 - (family.length - 1) * 30 - (wideColumns - 1) * 6 * Number(family.some(stage => stage.length > 3))) / Math.max(1, slots)));
  return <Sheet title={`Pokédex #${String(id).padStart(3, '0')}`} onClose={onClose}><ScrollView contentContainerStyle={m.content}>
    <View style={{ alignItems: 'center', gap: 8 }}><Image accessibilityLabel={owned ? pokemon.en : `${pokemon.en} silhouette`} source={speciesImage(id)} style={{ width: 240, height: 230, opacity: owned ? 1 : .3 }} tintColor={owned ? undefined : '#526B50'} contentFit="contain" cachePolicy="memory-disk" /><Txt style={ui.title}>{pokemon.en}</Txt>
      {types.length > 0 && <View accessible accessibilityLabel={`${types.map(typeLabel).join(' and ')} type`} style={ui.row}>{types.map(type => <TypePill key={type} type={type} />)}</View>}
      <Txt muted>{pokemon.ja} · {pokemon.genus}</Txt><View style={m.languageTag}><Txt style={{ fontSize: 12, fontWeight: '700' }}>{owned ? `${cardCount} ${cardCount === 1 ? 'card' : 'cards'} collected` : 'Not discovered yet'}</Txt></View></View>
    <View style={m.entry}>
      <View style={m.entryLip}><View style={m.speaker}>{[1, 2, 3].map(n => <View key={n} style={m.speakerLine} />)}</View><Txt style={m.entryLabel}>POKÉDEX ENTRY</Txt><View style={[m.power, !owned && { backgroundColor: '#A5B299' }]} /></View>
      <View style={m.entryScreen}>{owned
        ? <><View accessible accessibilityLabel={`Pokédex entry. ${entry ?? 'Coming soon.'}`} style={[ui.row, { alignItems: 'flex-start', gap: 12 }]}><AnimatedSprite id={id} /><Txt style={[m.entryText, { flex: 1 }]}>{entry ?? 'This Pokédex entry is still being written.'}</Txt></View>
          <View style={[ui.row, { marginTop: 12, flexWrap: 'wrap' }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={reading ? 'Stop reading' : `Read ${pokemon.en}'s Pokédex entry aloud`} onPress={() => reading ? voice.stop() : voice.speak(id)} style={({ pressed }) => [m.voiceButton, reading && m.voiceActive, pressed && { opacity: .7 }]}><Icon name={reading ? 'stop' : 'speaker'} size={18} color={reading ? 'white' : C.ink} /><Txt style={[m.voiceText, reading && { color: 'white' }]}>{reading ? 'Stop' : 'Read it to me'}</Txt></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Play ${pokemon.en}'s cry`} onPress={() => voice.cry(id)} style={({ pressed }) => [m.voiceButton, pressed && { opacity: .7 }]}><Icon name="note" size={18} /><Txt style={m.voiceText}>Hear its cry</Txt></Pressable>
          </View></>
        : <View accessible accessibilityLabel={`Pokédex entry locked. Discover ${pokemon.en} to unlock it.`} style={[ui.row, { alignItems: 'flex-start' }]}><Icon name="lock" size={24} color="#6B7B64" /><View style={{ flex: 1, gap: 2 }}><Txt style={[m.entryText, { fontWeight: '800' }]}>Discover {pokemon.en} to unlock its Pokédex entry!</Txt><Txt muted style={{ fontSize: 13, lineHeight: 19 }}>Scan or add any {pokemon.en} card.</Txt></View></View>}</View>
    </View>
    <View style={{ gap: 10 }}><Txt style={ui.subtitle}>Evolution</Txt>{family.length > 1 ? <>
      <View style={m.evolution}>{family.map((stage, i) => <Fragment key={i}>
        {i > 0 && <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Icon name="arrow" size={18} color={C.muted} /></View>}
        <View style={[m.stage, stage.length > 3 && { flexDirection: 'row', flexWrap: 'wrap', width: wideColumns * tile + (wideColumns - 1) * 6 }]}>{stage.map(member => {
          const current = member.id === id, found = discovered.has(member.id);
          return <Pressable key={member.id} accessibilityRole="button" accessibilityLabel={`${nameOf(member.id)}, ${found ? 'discovered' : 'not yet discovered'}${current ? ', showing now' : ''}`} accessibilityState={{ selected: current }} onPress={() => !current && onSpecies(member.id)} style={({ pressed }) => [m.stageTile, { width: tile }, current && m.stageCurrent, pressed && !current && { opacity: .7 }]}>
            <Image source={speciesImage(member.id)} style={[{ width: tile - 18, height: tile - 18 }, !found && { opacity: .3 }]} tintColor={found ? undefined : '#526B50'} contentFit="contain" cachePolicy="memory-disk" />
            <Txt numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.85} maxFontSizeMultiplier={1.2} style={m.stageName}>{nameOf(member.id)}</Txt>
          </Pressable>;
        })}</View>
      </Fragment>)}</View>
      <Txt style={{ textAlign: 'center', fontWeight: '700', fontSize: 14 }}>{familyNote(familyIds, discovered)}</Txt>
    </> : <Txt muted>{pokemon.en} doesn’t evolve. It’s one of a kind!</Txt>}</View>
    <Button title={`Find ${pokemon.en} cards`} icon="search" onPress={() => onFindCards(pokemon.en)} />
    {wished > 0 && <View style={[m.wishBadge, { alignSelf: 'center' }]}><Icon name="star" size={16} color={WISH.star} filled /><Txt style={m.wishBadgeText}>{wished} {pokemon.en} {wished === 1 ? 'card' : 'cards'} on your wishlist</Txt></View>}
    {owned && <><Txt style={ui.subtitle}>Your {pokemon.en} cards</Txt><View style={m.cardGrid}>{entries.map(e => <Pressable accessibilityRole="button" accessibilityLabel={`Open ${e.card.name}, ${e.card.set.name}${e.quantity > 1 ? `, ${e.quantity} copies` : ''}`} key={e.key} onPress={() => { tick(); onEntry(e); }} style={state => [m.cardTile, pressFx(state)]}><View><CardArt card={e.card} />{e.quantity > 1 && <View style={m.countBadge}><Txt style={m.countText}>×{e.quantity}</Txt></View>}</View><Txt numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', marginTop: 6 }}>{e.card.set.name}</Txt><CardPriceTag card={e.card} finish={e.finish} /></Pressable>)}</View></>}
  </ScrollView></Sheet>;
}

function TrainerChoiceRow({ title, options, value, labels, colors, onChange }: { title: string; options: readonly string[]; value: string; labels: Record<string, string>; colors?: Record<string, string>; onChange: (value: string) => void }) {
  // Exact thirds, so a short last row lines up with the columns above instead of stretching.
  const [width, setWidth] = useState(0);
  const tileWidth = width ? Math.floor((width - 2 * S.sm) / 3) : '31%';
  return <View style={m.builderGroup}><Txt style={{ fontWeight: '800', fontSize: 16 }}>{title}</Txt><View onLayout={e => setWidth(e.nativeEvent.layout.width)} style={m.builderChoices}>{options.map(option => {
    const selected = value === option;
    return <Pressable key={option} accessibilityRole="button" accessibilityLabel={`${title}: ${labels[option]}`} accessibilityState={{ selected }} onPress={() => { if (!selected) { tick(); onChange(option); } }} style={state => [m.builderChoice, { width: tileWidth }, selected && m.builderChoiceSelected, !selected && pressFx(state)]}>
      {colors && <View style={[m.builderSwatch, { backgroundColor: colors[option] }, selected && { borderColor: C.paper }]} />}
      <Txt numberOfLines={2} maxFontSizeMultiplier={1.3} style={[m.builderChoiceText, selected && { color: C.paper }]}>{labels[option]}</Txt>
    </Pressable>;
  })}</View></View>;
}

type Feedback = { at: string; note?: string; error?: string };

export function ProfilesModal({ onClose, onBusyChange }: { onClose: () => void; onBusyChange: (busy: boolean) => void }) {
  const { collection, trainer, transact, updateTrainer } = useCollection();
  const [name, setName] = useState(trainer.name);
  const [newName, setNewName] = useState('');
  const [building, setBuilding] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [draft, setDraft] = useState<TrainerAppearance>(trainer.appearance);
  // Which action is saving: only its button spins, the rest wait.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const busy = busyKey !== null;
  const guard = useRef(false);
  // Notes and errors show right under the control that caused them.
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const { locked, requireGrownUp, gate } = useGrownUpCheck();
  async function run(key: string, action: (note: (text: string) => void) => Promise<void>, at = key) {
    if (guard.current) return;
    guard.current = true; setBusyKey(key); onBusyChange(true); setFeedback(null);
    try { await action(text => setFeedback({ at, note: text })); } catch (e) { setFeedback({ at, error: e instanceof Error ? e.message : 'The change could not be saved.' }); }
    finally { guard.current = false; setBusyKey(null); onBusyChange(false); }
  }
  const feedbackAt = (at: string) => feedback?.at === at ? <><ErrorNotice text={feedback.error ?? null} />{feedback.note && <View accessibilityLiveRegion="polite" style={m.note}><Txt style={{ fontSize: 14 }}>{feedback.note}</Txt></View>}</> : null;
  function choose(part: keyof TrainerAppearance, value: string) {
    setDraft(current => ({ ...current, [part]: value } as TrainerAppearance));
  }
  if (aboutOpen) return <Sheet title="About" onClose={onClose} onBack={() => setAboutOpen(false)}><AboutScreen /></Sheet>;
  if (building) return <Sheet title="Build your trainer" onClose={onClose} onBack={() => { setDraft(trainer.appearance); setBuilding(false); }} busy={busy} dismissible={false}><ScrollView contentContainerStyle={m.content}>
    <View style={[m.trainerCard, { borderColor: TRAINER_OUTFIT_COLORS[draft.outfit] }]}>
      <View style={m.trainerCardHeader}><Txt style={{ fontWeight: '900' }}>Trainer card</Txt><Txt style={{ fontFamily: mono, fontSize: 12 }}>PT-{trainer.id.replace(/\D/g, '').slice(-4).padStart(4, '0')}</Txt></View>
      <TrainerAvatar appearance={draft} size={190} />
      <Txt style={[ui.title, { textAlign: 'center' }]}>{trainer.name}</Txt>
      <View style={m.trainerStats}><View><Txt style={m.trainerStatNumber}>{discoveredIds(trainer).size}</Txt><Txt muted style={m.trainerStatLabel}>Pokémon</Txt></View><View style={m.trainerStatRule} /><View><Txt style={m.trainerStatNumber}>{totalCards(trainer)}</Txt><Txt muted style={m.trainerStatLabel}>cards</Txt></View></View>
    </View>
    <Txt style={[ui.subtitle, { textAlign: 'center' }]}>Pick your look!</Txt>
    <TrainerChoiceRow title="Skin tone" options={TRAINER_SKIN_TONES} value={draft.skinTone} labels={TRAINER_APPEARANCE_LABELS.skinTone} colors={TRAINER_SKIN_COLORS} onChange={value => choose('skinTone', value)} />
    <TrainerChoiceRow title="Hair style" options={TRAINER_HAIR_STYLES} value={draft.hairStyle} labels={TRAINER_APPEARANCE_LABELS.hairStyle} onChange={value => choose('hairStyle', value)} />
    <TrainerChoiceRow title="Hair color" options={TRAINER_HAIR_COLORS} value={draft.hairColor} labels={TRAINER_APPEARANCE_LABELS.hairColor} colors={TRAINER_HAIR_COLOR_VALUES} onChange={value => choose('hairColor', value)} />
    <TrainerChoiceRow title="Jacket" options={TRAINER_OUTFITS} value={draft.outfit} labels={TRAINER_APPEARANCE_LABELS.outfit} colors={TRAINER_OUTFIT_COLORS} onChange={value => choose('outfit', value)} />
    <TrainerChoiceRow title="Hat" options={TRAINER_HEADWEAR} value={draft.headwear} labels={TRAINER_APPEARANCE_LABELS.headwear} onChange={value => choose('headwear', value)} />
    {feedbackAt('look')}
    <Button title="Save my look" icon="check" busy={busyKey === 'look'} onPress={() => run('look', async note => { await updateTrainer(t => ({ ...t, appearance: draft, color: TRAINER_OUTFIT_COLORS[draft.outfit] })); setBuilding(false); note('New look saved!'); })} />
  </ScrollView></Sheet>;

  return <Sheet title="Settings" onClose={onClose} busy={busy} overlay={gate}><ScrollView contentContainerStyle={[m.content, { gap: S.xxl }]} keyboardShouldPersistTaps="handled">
    <View style={m.section}>
      <Txt accessibilityRole="header" style={ui.subtitle}>Your trainers</Txt><Txt muted>Each trainer gets their own Pokédex and binder.</Txt>
      {collection.trainers.map(t => {
        const active = t.id === trainer.id, key = `switch-${t.id}`;
        return <Pressable accessibilityRole="button" accessibilityLabel={active ? `${t.name}, playing now` : `Switch to ${t.name}`} accessibilityState={{ selected: active, disabled: busy }} key={t.id} disabled={busy} onPress={() => { tick(); run(key, async () => { await transact(c => ({ ...c, activeId: t.id })); setName(t.name); setDraft(t.appearance); }, 'switch'); }} style={state => [m.profile, active && { borderColor: C.ink, backgroundColor: '#DEE7D2' }, busy && busyKey !== key && { opacity: .6 }, pressFx(state)]}><TrainerAvatar appearance={t.appearance} size={48} /><View style={{ flex: 1 }}><Txt style={{ fontWeight: '800', fontSize: 16 }}>{t.name}</Txt><Txt muted style={{ fontSize: 13 }}>{totalCards(t)} cards · {discoveredIds(t).size} Pokémon</Txt></View>{busyKey === key ? <ActivityIndicator color={C.ink} /> : active && <Icon name="check" size={22} />}</Pressable>;
      })}
      {feedbackAt('switch')}
      <Pressable accessibilityRole="button" accessibilityLabel={`Change ${trainer.name}'s look`} disabled={busy} onPress={() => { tick(); setFeedback(null); setDraft(trainer.appearance); setBuilding(true); }} style={state => [m.builderInvite, { borderColor: trainer.color }, busy && { opacity: .6 }, pressFx(state)]}><TrainerAvatar appearance={trainer.appearance} size={72} /><View style={{ flex: 1, gap: 2 }}><Txt style={[ui.subtitle, { fontSize: 18 }]}>Change {trainer.name}’s look</Txt><Txt muted style={{ fontSize: 14 }}>Hair, jacket, hat and more</Txt></View><Icon name="arrow" size={22} color={C.redDark} /></Pressable>
      {feedbackAt('look')}
    </View>
    <View style={m.section}>
      <Txt accessibilityRole="header" style={ui.subtitle}>Trainer name</Txt><TextInput accessibilityLabel="Trainer name" value={name} onChangeText={setName} maxLength={32} style={m.input} editable={!busy} />
      <Button title="Save name" size="medium" secondary disabled={busy || !name.trim() || name.trim() === trainer.name} busy={busyKey === 'name'} onPress={() => run('name', async note => { await updateTrainer(t => ({ ...t, name: name.trim() })); note('Trainer name saved.'); })} />
      {feedbackAt('name')}
    </View>
    <View style={m.section}>
      <Txt accessibilityRole="header" style={ui.subtitle}>Add another trainer</Txt><TextInput accessibilityLabel="New trainer name" placeholder="New trainer’s name" placeholderTextColor={C.muted} value={newName} onChangeText={setNewName} maxLength={32} style={m.input} editable={!busy} />
      <Button title="Add trainer" size="medium" icon="plus" disabled={busy || !newName.trim() || collection.trainers.length >= 20} busy={busyKey === 'add'} onPress={() => run('add', async note => { await transact(c => { if (c.trainers.length >= 20) throw new Error('This device already has 20 trainers.'); const appearance = trainerAppearanceFor(c.trainers.length); return { ...c, trainers: [...c.trainers, { id: `trainer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: newName.trim(), color: TRAINER_OUTFIT_COLORS[appearance.outfit], appearance, entries: [], wishlist: [] }] }; }); setNewName(''); note('New trainer added! Tap their name above to play as them.'); })} />
      {feedbackAt('add')}
    </View>
    <View style={m.section}>
      <Txt accessibilityRole="header" style={ui.subtitle}>Grown-up lock</Txt>
      <View style={m.lockRow}><Icon name="lock" size={24} color={locked ? C.ink : C.muted} /><View style={{ flex: 1 }}><Txt style={{ fontWeight: '800' }}>{locked ? 'On' : 'Off'}</Txt><Txt muted style={{ fontSize: 14 }}>{locked ? 'A grown-up solves a math question before cards are deleted or backups are used.' : 'Anyone can delete cards or use backups.'}</Txt></View>{busyKey === 'lock' ? <ActivityIndicator color={C.ink} /> : <Switch accessibilityLabel="Grown-up lock" accessibilityHint={locked ? 'Turning it off asks a grown-up question first' : undefined} value={locked} disabled={busy} trackColor={{ true: C.red, false: '#C7D2BB' }} onValueChange={on => on ? run('lock', async note => { await transact(c => ({ ...c, grownUpLock: true })); note('Grown-up lock is on.'); }) : requireGrownUp(() => run('lock', async note => { await transact(c => ({ ...c, grownUpLock: false })); note('Grown-up lock is off.'); }), 'turn off the grown-up lock')} />}</View>
      {feedbackAt('lock')}
    </View>
    <View style={m.section}>
      <Txt accessibilityRole="header" style={ui.subtitle}>Backups (grown-ups)</Txt><Txt muted style={{ fontSize: 14 }}>Save a copy of everyone’s cards. Loading one adds trainers and erases nothing.</Txt>
      <ButtonRow>
        <Button title="Save backup" size="medium" icon="download" secondary disabled={busy} busy={busyKey === 'export'} onPress={() => requireGrownUp(() => run('export', () => exportFile(portableBackup(collection)), 'backup'), 'save a backup')} />
        <Button title="Load backup" size="medium" icon="upload" secondary disabled={busy} busy={busyKey === 'import'} onPress={() => requireGrownUp(() => run('import', async note => { const raw = await importFile(); if (!raw) return; const incoming = parseCollection(raw); await transact(c => mergeBackup(c, incoming)); note(`Added ${incoming.trainers.length} trainer${incoming.trainers.length === 1 ? '' : 's'} from the backup.`); }, 'backup'), 'load a backup')} />
      </ButtonRow>
      {feedbackAt('backup')}
    </View>
    <View style={m.section}>
      <Button title="About this app" size="medium" secondary disabled={busy} onPress={() => setAboutOpen(true)} />
      <Txt muted style={{ fontSize: 13 }}>Saved on this device. Live family syncing is planned for a later version. Card text is read on your iPhone/iPad; photos are not sent to a server.</Txt><Txt muted style={{ fontSize: 12 }}>Card data and images: TCGdex. Pokémon names, Pokédex data and artwork: PokéAPI. An unofficial family fan project. Pokémon belongs to its respective owners.</Txt>
    </View>
  </ScrollView></Sheet>;
}

const WISH = { star: '#B98310', ink: '#664C0E', fill: '#F7ECC8', line: '#E0C676' };
function WishButton({ wished, disabled, onPress }: { wished: boolean; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={wished ? 'On your wishlist' : 'Add to wishlist'} accessibilityHint={wished ? 'Takes this card off your wishlist' : 'Saves this card to a list you can share with family'} accessibilityState={{ selected: wished, disabled }} disabled={disabled} onPress={() => { tick(); onPress(); }} style={({ pressed }) => [ui.button, ui.secondary, wished && m.wishOn, disabled && { opacity: .45 }, pressed && { opacity: .85, transform: [{ translateY: 2 }] }]}>
    <Icon name="star" size={22} color={wished ? WISH.star : C.ink} filled={wished} /><Txt numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.8} maxFontSizeMultiplier={1.2} style={{ flexShrink: 1, color: wished ? WISH.ink : C.ink, fontWeight: '800', fontSize: 17 }}>{wished ? 'On your wishlist' : 'Add to wishlist'}</Txt>
  </Pressable>;
}

function WishTile({ wish, columns, onOpen, onRemove }: { wish: Wish; columns: number; onOpen: () => void; onRemove: () => void }) {
  const { card } = wish;
  const set = setForCard(card)?.name;
  return <View style={{ flex: 1 / columns, marginBottom: S.lg }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${card.name}, ${set ? `${set}, ` : ''}number ${card.localId}, ${LANGUAGE_LABELS[card.language]}`} accessibilityHint="Opens the card so you can add it when you get it" onPress={() => { tick(); onOpen(); }} style={pressFx}>
      <CardArt card={card} /><Txt style={{ fontWeight: '800', fontSize: 15, marginTop: 6 }} numberOfLines={1}>{card.name}</Txt><Txt muted style={{ fontSize: 13 }} numberOfLines={1}>{set ?? card.id}</Txt><Txt muted style={{ fontFamily: mono, fontSize: 12 }}>{LANGUAGE_CODES[card.language]} · #{card.localId}</Txt>
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
      {wishes.length > 0 && <><Txt muted style={{ fontSize: 14 }}>{wishes.length} {wishes.length === 1 ? 'card' : 'cards'} {trainer.name} hopes to find. When you get one, tap it and add it to your binder.</Txt><Button title="Share my wishlist" icon="upload" onPress={share} /><Txt muted style={{ fontSize: 13 }}>Prices are ungraded estimates to help grown-ups shop.</Txt></>}
      {removed && <View style={[m.note, ui.between, { paddingVertical: S.xs }]}><Txt style={{ flex: 1, fontSize: 14 }}>Removed {removed.wish.card.name}.</Txt><Pressable accessibilityRole="button" accessibilityLabel={`Undo. Put ${removed.wish.card.name} back on your wishlist`} hitSlop={4} onPress={() => { tick(); const { wish, index } = removed; setRemoved(null); change(t => restoreWish(t, wish, index)); }} style={state => [m.undo, pressFx(state)]}><Txt style={{ fontSize: 15, fontWeight: '800', textDecorationLine: 'underline' }}>Undo</Txt></Pressable></View>}
      <ErrorNotice text={error} />
      {shareFailed && wishes.length > 0 && <View style={[m.note, { gap: 6 }]}><Txt style={{ fontWeight: '800' }}>Sharing isn’t available here.</Txt><Txt muted style={{ fontSize: 13 }}>Copy this list instead:</Txt><Txt selectable style={{ fontSize: 13, lineHeight: 20 }}>{wishlistShareText(trainer.name, wishes)}</Txt></View>}
    </View>}
    ListEmptyComponent={<View style={m.wishEmpty}><View style={m.wishEmptyStar}><Icon name="star" size={46} color={WISH.star} filled /></View><Txt style={ui.subtitle}>No wishes yet</Txt><Txt muted style={{ textAlign: 'center', maxWidth: 320 }}>Find a card you’d love to get, then tap “Add to wishlist.” Your wishes show up here, ready to share with family.</Txt><Button title="Find cards to wish for" icon="search" onPress={onFind} style={{ alignSelf: 'stretch' }} /></View>}
    renderItem={({ item, index }) => <WishTile wish={item} columns={columns} onOpen={() => onCard(item.card)} onRemove={() => { setRemoved({ wish: item, index }); change(t => removeWish(t, item.key)); }} />} /></Sheet>;
}

export function DiscoveryModal({ card, newIds, quantity, granted = 0, nextLabel, onNext, onClose }: { card: Card; newIds: number[]; quantity: number; granted?: number; nextLabel: string; onNext: () => void; onClose: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const discovered = newIds.length > 0;
  const pokemon = speciesById.get(newIds[0]);
  const voice = usePokedexVoice();
  // Like the anime Pokédex: the new Pokémon calls out, then its entry is read. VoiceOver users keep control.
  useEffect(() => {
    if (!pokemon || !revealed) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    AccessibilityInfo.isScreenReaderEnabled().then(reader => {
      if (cancelled || reader) return;
      void voice.cry(pokemon.id);
      timer = setTimeout(() => { if (!cancelled) void voice.speak(pokemon.id); }, 1400);
    });
    return () => { cancelled = true; clearTimeout(timer); };
  }, [pokemon?.id, revealed]);
  const list = newIds.map(id => speciesById.get(id)?.en ?? `#${id}`), names = list.length > 2 ? `${list.slice(0, -1).join(', ')} & ${list.at(-1)}` : list.join(' & ');
  // The next steps wait until the Poké Ball opens, so the first tap goes to the ball.
  const ready = !discovered || revealed;
  return <Sheet title={discovered ? 'New Pokémon discovered!' : 'Added to your binder!'} onClose={onClose} dismissible={false}><ScrollView contentContainerStyle={[m.content, { alignItems: 'center' }]}><View style={m.discoveryStage}><View style={m.discoveryRing} />{discovered ? <CatchReveal onReveal={() => setRevealed(true)}><View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', zIndex: 2 }}>{newIds.map(id => <Image key={id} accessibilityLabel={speciesById.get(id)?.en} source={speciesImage(id)} style={{ width: newIds.length > 1 ? 95 : 220, height: newIds.length > 1 ? 130 : 210 }} contentFit="contain" />)}</View><Image source={require('../../assets/crafted/pokeball-open.png')} style={{ width: 155, height: 145, marginTop: -25 }} contentFit="contain" /></CatchReveal> : <><Confetti count={18} /><Reanimated.View entering={ZoomIn.springify().damping(12)}>{isShiny(card) ? <HoloShine style={{ width: 185, marginVertical: 20 }}><CardArt card={card} /></HoloShine> : <CardArt card={card} style={{ width: 185, marginVertical: 20 }} />}</Reanimated.View></>}</View>{discovered && !revealed ? <View style={{ alignItems: 'center', gap: S.xs }}><Txt accessibilityLiveRegion="polite" style={[ui.title, { textAlign: 'center' }]}>Who’s inside?</Txt><Txt muted style={{ textAlign: 'center', fontSize: 17, fontWeight: '700' }}>Tap the Poké Ball!</Txt></View> : <><Txt accessibilityLiveRegion="polite" style={[ui.title, { textAlign: 'center' }]}>{discovered ? newIds.length > 2 ? `${newIds.length} new Pokémon!` : names : quantity > 1 ? `${quantity} cards added!` : card.name}</Txt>{discovered && newIds.length > 2 && <Txt style={{ textAlign: 'center', fontWeight: '700' }}>{names}</Txt>}<Txt muted style={{ textAlign: 'center' }}>{discovered ? newIds.length === 1 ? 'It’s in your Pokédex now!' : 'They’re in your Pokédex now!' : quantity > 1 ? 'Your binder keeps growing!' : 'It’s in your binder now!'}</Txt>{pokemon && newIds.length === 1 && <View style={m.languageTag}><Txt style={{ fontFamily: mono, fontSize: 12 }}>#{String(pokemon.id).padStart(3, '0')} · {pokemon.genus}</Txt></View>}{pokemon && <Pressable accessibilityRole="button" accessibilityLabel={voice.speaking === pokemon.id ? 'Stop reading' : `Hear ${pokemon.en}'s Pokédex entry`} onPress={() => voice.speaking === pokemon.id ? voice.stop() : (void voice.cry(pokemon.id), void voice.speak(pokemon.id))} style={({ pressed }) => [m.voiceButton, voice.speaking === pokemon.id && m.voiceActive, pressed && { opacity: .7 }]}><Icon name={voice.speaking === pokemon.id ? 'stop' : 'speaker'} size={18} color={voice.speaking === pokemon.id ? 'white' : C.ink} /><Txt style={[m.voiceText, voice.speaking === pokemon.id && { color: 'white' }]}>{voice.speaking === pokemon.id ? 'Stop' : 'Hear it again'}</Txt></Pressable>}{granted > 0 && <View style={m.wishBadge}><Icon name="star" size={18} color={WISH.star} filled /><Txt style={m.wishBadgeText}>{granted === 1 ? 'Wish granted! It’s off your wishlist.' : `${granted} wishes granted! They’re off your wishlist.`}</Txt></View>}</>}{ready && <View style={{ alignSelf: 'stretch', gap: S.md, marginTop: S.sm }}><Button title={nextLabel} icon="camera" onPress={onNext} /><Button title="Done" secondary onPress={onClose} /></View>}</ScrollView></Sheet>;
}

const m = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#14201CC9', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  sheet: { width: '100%', maxWidth: 600, maxHeight: '100%', backgroundColor: C.screen, borderRadius: 24, overflow: 'hidden', borderWidth: 3, borderColor: '#AFC1A3' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 20, paddingRight: 12, minHeight: 64, borderBottomWidth: 1, borderColor: C.line, backgroundColor: '#DFE8D4' },
  content: { padding: 20, paddingBottom: 26, gap: 16 }, loading: { padding: 50, alignItems: 'center', gap: 14 },
  cardHero: { alignItems: 'center', backgroundColor: '#DDE6D1', padding: 18, gap: 12, borderRadius: 16 }, languageTag: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10, backgroundColor: '#D4E1C7' },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 25, paddingVertical: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line }, small: { fontSize: 11, lineHeight: 17 },
  stepper: { flexDirection: 'row', alignItems: 'center', flexShrink: 0, backgroundColor: '#DCE6D0', borderRadius: 14 }, stepButton: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  stepperNumber: { fontFamily: mono, fontSize: 22, lineHeight: 28, fontWeight: '700', minWidth: 32, textAlign: 'center' },
  removeBox: { padding: 14, backgroundColor: '#F3DADB', borderRadius: 14, gap: 10 }, note: { padding: 14, backgroundColor: '#DBE7CD', borderRadius: 12 },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: '#F8FAF3' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 14, borderWidth: 1, borderColor: C.line },
  builderInvite: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, borderWidth: 2, backgroundColor: '#F8FAF3' },
  trainerCard: { alignItems: 'center', padding: 16, borderWidth: 3, borderRadius: 22, backgroundColor: '#DCE8D2', overflow: 'hidden' },
  trainerCardHeader: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 4 },
  trainerStats: { flexDirection: 'row', alignItems: 'center', gap: 22, marginTop: 8 },
  trainerStatNumber: { textAlign: 'center', fontFamily: mono, fontSize: 19, lineHeight: 23, fontWeight: '800' },
  trainerStatLabel: { textAlign: 'center', fontSize: 13 },
  trainerStatRule: { width: 1, height: 30, backgroundColor: '#AEBEA4' },
  builderGroup: { gap: 8 },
  builderChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, section: { gap: 8 },
  builderChoice: { minHeight: 48, paddingHorizontal: 6, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#B8C6AC', backgroundColor: '#F8FAF3', alignItems: 'center', justifyContent: 'center', gap: 4 },
  builderChoiceSelected: { backgroundColor: C.ink, borderColor: C.ink },
  builderChoiceText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  builderSwatch: { width: 22, height: 22, borderRadius: 12, borderWidth: 2, borderColor: '#FFFFFF' },
  input: { minHeight: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: '#B8C6AC', borderRadius: 12, backgroundColor: '#FCFDF9', color: C.ink, fontSize: 16 },
  entry: { borderRadius: 16, borderWidth: 3, borderColor: '#A72937', overflow: 'hidden' },
  entryLip: { height: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#CBD6BE', backgroundColor: '#DDE5D4' },
  entryLabel: { fontWeight: '900', fontSize: 11, lineHeight: 17, color: '#6B7B64', letterSpacing: 2 },
  speaker: { flexDirection: 'row', gap: 3 }, speakerLine: { width: 3, height: 9, borderRadius: 2, backgroundColor: '#A5B299' }, power: { height: 6, width: 6, borderRadius: 5, backgroundColor: '#6DAB63' },
  entryScreen: { padding: 16, backgroundColor: '#D6E7BD' },
  voiceButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, borderRadius: 12, backgroundColor: '#C3D6A8', borderBottomWidth: 2, borderBottomColor: '#A9BF8D' },
  voiceActive: { backgroundColor: C.ink, borderBottomColor: '#101A15' }, voiceText: { fontWeight: '800', fontSize: 14 },
  sprite: { width: 72, height: 72, borderRadius: 10, backgroundColor: '#C8DCAB' }, entryText: { fontSize: 16, lineHeight: 24 },
  evolution: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, borderRadius: 16, backgroundColor: '#DDE6D1' },
  stage: { gap: 6, justifyContent: 'center' }, stageTile: { minHeight: 88, alignItems: 'center', justifyContent: 'center', padding: 3, borderRadius: 12, borderWidth: 2, borderColor: 'transparent' },
  stageCurrent: { backgroundColor: '#F8FAF3', borderColor: '#ADC79F' }, stageName: { fontSize: 13, lineHeight: 17, fontWeight: '800', textAlign: 'center', letterSpacing: -.2 },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 16 }, cardTile: { width: '48%' },
  countBadge: { position: 'absolute', top: 6, right: 6, minWidth: 36, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, backgroundColor: C.ink, alignItems: 'center' }, countText: { color: 'white', fontFamily: mono, fontSize: 14, fontWeight: '800' },
  wishOn: { backgroundColor: WISH.fill, borderBottomColor: WISH.line },
  wishBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 12, backgroundColor: WISH.fill, borderWidth: 1, borderColor: WISH.line },
  wishBadgeText: { color: WISH.ink, fontWeight: '800', fontSize: 13, flexShrink: 1 },
  wishList: { padding: 20, paddingBottom: 26 }, undo: { minHeight: 44, minWidth: 56, alignItems: 'center', justifyContent: 'center' },
  wishRemove: { position: 'absolute', top: 0, right: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  wishRemoveDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFFFFFE8', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line },
  wishEmpty: { alignItems: 'center', gap: S.lg, paddingVertical: S.xl }, wishEmptyStar: { width: 92, height: 92, borderRadius: 46, backgroundColor: WISH.fill, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: WISH.line },
  discoveryStage: { width: '100%', alignItems: 'center', justifyContent: 'center', minHeight: 290 }, discoveryRing: { position: 'absolute', width: 265, height: 265, borderRadius: 140, backgroundColor: '#D6E7BD', borderWidth: 16, borderColor: '#E3EDCD' },
});
