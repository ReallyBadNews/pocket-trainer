import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { BadgeArtwork } from '@/components/badge-artwork';
import { BadgeInspection } from '@/components/badge-inspection';
import { Page, PageFrame, openPage } from '@/components/page';
import { ActionRow, Button, C, Icon, Progress, S, Segmented, Txt, mono, pressFx, tick, ui } from '@/components/pokedex-ui';
import { badgeMeter, badgeStatus, filterGoals, findBadge, goalCounts, languageCards, speciesColumns, speciesGoals, type BadgeStatus, type SpeciesFilter, type SpeciesGoal } from '@/lib/badge-details';
import { BADGES, type Badge } from '@/lib/badges';
import { catalogSet, speciesById, speciesImage } from '@/lib/catalog';
import { useCollection } from '@/lib/collection-context';
import { LANGUAGE_LABELS } from '@/lib/languages';
import { discoveredIds, totalCards } from '@/lib/model';
import { usePokedexNav } from '@/lib/pokedex-nav';
import { setProgress, type SetProgress } from '@/lib/set-progress';

const GOLD = '#80611F', GREEN = '#679255';
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
// Same words as a set checklist; the counts sit in a caption so each segment stays one short line.
const FILTERS: { id: SpeciesFilter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'todo', label: 'To find' }, { id: 'owned', label: 'Collected' }];

// Web export pre-renders one page per badge.
export function generateStaticParams() {
  return BADGES.map(badge => ({ id: badge.id }));
}

/** One badge: what it asks for, how close he is, and the 3D badge once it's earned. */
export function BadgePage() {
  const { id } = useLocalSearchParams<'/badges/[id]'>();
  const badge = findBadge(id);
  return badge ? <BadgeDetail key={badge.id} badge={badge} /> : <MissingBadge />;
}

function BadgeDetail({ badge }: { badge: Badge }) {
  const { trainer } = useCollection();
  const [inspecting, setInspecting] = useState(false);
  const discovered = useMemo(() => discoveredIds(trainer), [trainer]);
  const sets = useMemo(() => setProgress(trainer, catalogSet), [trainer]);
  const status = badgeStatus(trainer, badge, discovered, sets);
  const hero = <Hero badge={badge} status={status} onInspect={() => setInspecting(true)} />;
  return <>
    {badge.kind === 'species-set' ? <SpeciesChecklist badge={badge} discovered={discovered} header={hero} /> : <Page title={badge.name}>
      {hero}
      {badge.kind === 'sets' ? <SetsSection sets={sets} earned={status.earned} />
        : badge.kind === 'languages' ? <LanguagesSection earned={status.earned} />
        : <CountSection kind={badge.kind} count={badge.kind === 'species' ? discovered.size : totalCards(trainer)} earned={status.earned} />}
    </Page>}
    {inspecting && <BadgeInspection badge={badge} onClose={() => setInspecting(false)} />}
  </>;
}

function Hero({ badge, status, onInspect }: { badge: Badge; status: BadgeStatus; onInspect: () => void }) {
  const meter = badgeMeter(badge, status);
  return <View style={s.hero}>
    <View accessible accessibilityRole="image" accessibilityLabel={`${badge.name} badge${status.earned ? '' : ', not earned yet'}`} style={s.art}><BadgeArtwork emblem={badge.emblem} earned={status.earned} size={160} /></View>
    <View style={s.stack}><Txt muted variant="label">{badge.group}</Txt><Txt>{badge.description}</Txt></View>
    {status.earned ? <View style={s.stack}>
      <View style={s.earned}><Icon name="star" size={22} color={C.gold} filled /><Txt variant="subtitle" style={s.earnedText}>Badge earned!</Txt></View>
      <Button title="View in 3D" icon="badge" onPress={onInspect} accessibilityHint="Opens a full-screen badge viewer. Drag to turn it, or use Flip and Reset." />
    </View> : <View style={s.stack}>
      <Txt variant="label">{meter.label}</Txt>
      <Progress value={meter.value} total={meter.total} color={GREEN} />
      {meter.left && <Txt muted variant="caption">{meter.left}</Txt>}
    </View>}
  </View>;
}

/** Virtualized: the original 151 badge alone asks for 151 sprites. */
function SpeciesChecklist({ badge, discovered, header }: { badge: Badge; discovered: ReadonlySet<number>; header: ReactNode }) {
  const { openSpecies } = usePokedexNav();
  const { width, fontScale } = useWindowDimensions();
  const [listWidth, setListWidth] = useState(0);
  const [filter, setFilter] = useState<SpeciesFilter>('all');
  const goals = speciesGoals(badge, discovered);
  const counts = goalCounts(goals);
  const visible = filterGoals(goals, filter);
  const columns = speciesColumns((listWidth || Math.min(width, 1100)) - S.xl * 2, fontScale);
  return <PageFrame title={badge.name}>{scroll => <Animated.FlatList {...scroll} onLayout={event => setListWidth(event.nativeEvent.layout.width)} key={columns} data={visible} numColumns={columns} keyExtractor={goal => String(goal.id)} columnWrapperStyle={s.gridRow} contentContainerStyle={[s.list, scroll.contentContainerStyle]} showsVerticalScrollIndicator={false} initialNumToRender={12} maxToRenderPerBatch={12}
    ListHeaderComponent={<View style={s.listHeader}>
      {header}
      <View style={s.section}>
        <View style={s.stack}><Txt accessibilityRole="header" variant="subtitle">Pokémon to collect</Txt><Txt muted variant="caption">Tap a Pokémon to see its cards.</Txt></View>
        <View style={s.stack}>
          <Segmented label="Show Pokémon" options={FILTERS} value={filter} onChange={setFilter} />
          <Txt muted variant="caption">{counts.todo} to find · {counts.owned} collected</Txt>
        </View>
      </View>
    </View>}
    ListEmptyComponent={<View style={s.empty}>
      <Image source={require('../../assets/crafted/pokeball.png')} style={{ width: 80, height: 80 }} contentFit="contain" />
      <Txt muted style={s.emptyText}>{filter === 'todo' ? 'Nothing left to find. You got them all!' : 'None yet. Each one you find gets a check.'}</Txt>
    </View>}
    renderItem={({ item }) => <SpeciesTile goal={item} columns={columns} onPress={() => openSpecies(item.id)} />} />}</PageFrame>;
}

function SpeciesTile({ goal, columns, onPress }: { goal: SpeciesGoal; columns: number; onPress: () => void }) {
  const name = speciesById.get(goal.id)?.en ?? `#${goal.id}`;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${name}, number ${goal.id}, ${goal.owned ? 'collected' : 'still to find'}`} accessibilityHint="Shows this Pokémon's cards" onPress={() => { tick(); onPress(); }} style={state => [s.tile, { flex: 1 / columns }, pressFx(state)]}>
    <View style={ui.between}><Txt style={s.dexNumber}>#{String(goal.id).padStart(3, '0')}</Txt>{goal.owned ? <View style={s.ownedDot}><Icon name="check" size={11} color="#fff" /></View> : <Icon name="lock" color="#A7B59C" size={13} />}</View>
    <Image source={speciesImage(goal.id)} style={[s.sprite, !goal.owned && { opacity: .25 }]} tintColor={goal.owned ? undefined : '#526B50'} contentFit="contain" cachePolicy="memory-disk" />
    <Txt variant="cardTitle" style={{ textAlign: 'center' }}>{name}</Txt>
  </Pressable>;
}

/** Discover-N and collect-N badges: the real count (past the target too), and where to go next. */
function CountSection({ kind, count, earned }: { kind: 'species' | 'cards'; count: number; earned: boolean }) {
  const nav = usePokedexNav();
  const species = kind === 'species';
  const summary = species
    ? count ? `You have discovered ${count} different Pokémon. Each one counts once, however many cards it is on.` : 'No Pokémon discovered yet. Each new Pokémon you add counts once.'
    : count ? `You have ${plural(count, 'card')}. Every copy counts, even doubles!` : 'No cards yet. Every card you add counts, even doubles!';
  return <View style={s.section}>
    <View style={s.stack}><Txt accessibilityRole="header" variant="subtitle">{species ? 'Your discoveries' : 'Your cards'}</Txt><Txt>{summary}</Txt></View>
    {!earned && <Button title="Scan a card" icon="scan" onPress={() => nav.openScan()} />}
    <ActionRow title={species ? 'Open your Pokédex' : 'Open your Binder'} icon={species ? 'dex' : 'binder'} onPress={() => nav.goToTab(species ? 'dex' : 'binder')} />
  </View>;
}

function LanguagesSection({ earned }: { earned: boolean }) {
  const nav = usePokedexNav();
  const { trainer } = useCollection();
  const languages = languageCards(trainer);
  return <View style={s.section}>
    <View style={s.stack}><Txt accessibilityRole="header" variant="subtitle">Your languages</Txt><Txt muted variant="caption">Pokémon cards are printed all over the world. A card in any of these languages counts.</Txt></View>
    <View>{languages.map(({ language, cards }) => <View key={language} accessible accessibilityLabel={`${LANGUAGE_LABELS[language]}, ${cards ? plural(cards, 'card') : 'not collected yet'}`} style={s.languageRow}>
      {cards ? <View style={s.languageDot}><Icon name="check" size={14} color="#fff" /></View> : <View style={[s.languageDot, s.languageDotEmpty]} />}
      <Txt style={s.languageName}>{LANGUAGE_LABELS[language]}</Txt>
      <Txt variant="caption" muted={!cards} style={s.languageCount}>{cards ? plural(cards, 'card') : 'Not yet'}</Txt>
    </View>)}</View>
    {!earned && <Button title="Scan a card" icon="scan" onPress={() => nav.openScan()} />}
  </View>;
}

/** Set master: the sets he is closest to finishing, each opening its checklist. */
function SetsSection({ sets, earned }: { sets: readonly SetProgress[]; earned: boolean }) {
  const nav = usePokedexNav();
  if (!sets.length) return <View style={s.empty}>
    <Image source={require('../../assets/crafted/pokeball.png')} style={{ width: 80, height: 80 }} contentFit="contain" />
    <Txt accessibilityRole="header" style={[ui.subtitle, s.emptyText]}>No sets started yet</Txt>
    <Txt muted style={s.emptyText}>Every card you add starts filling in its set. Finish every numbered card in one to earn this badge.</Txt>
    <Button title="Scan a card" icon="scan" onPress={() => nav.openScan()} />
  </View>;
  return <View style={s.section}>
    <View style={s.stack}><Txt accessibilityRole="header" variant="subtitle">{earned ? 'Your best sets' : 'Closest to finishing'}</Txt><Txt muted variant="caption">Tap a set to see which cards are still missing.</Txt></View>
    <View>{sets.slice(0, 3).map(set => <SetRow key={set.key} set={set} />)}</View>
    <ActionRow title="See all your sets" value={plural(sets.length, 'set')} icon="binder" onPress={() => openPage('/sets')} />
  </View>;
}

function SetRow({ set }: { set: SetProgress }) {
  const left = set.official - set.owned;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${set.name}, ${LANGUAGE_LABELS[set.language]}, ${set.complete ? 'finished' : `${set.owned} of ${set.official} cards`}`} accessibilityHint="Opens the set checklist" onPress={() => { tick(); openPage({ pathname: '/sets/[language]/[id]', params: { language: set.language, id: set.setId } }); }} style={state => [s.setRow, pressFx(state)]}>
    <View style={s.copy}>
      <Txt variant="cardTitle">{set.name}</Txt>
      <Txt muted variant="caption">{LANGUAGE_LABELS[set.language]}</Txt>
      <View style={s.setProgress}><Progress value={set.owned} total={set.official} color={set.complete ? '#A98428' : GREEN} /></View>
      <Txt variant="caption" style={[s.setCount, set.complete && { color: GOLD }]}>{set.complete ? `Finished! All ${set.official} cards` : `${set.owned} of ${set.official} · ${left} to go`}</Txt>
    </View>
    <Icon name="chevron" size={16} color={C.muted} />
  </Pressable>;
}

function MissingBadge() {
  return <Page title="Badge not found"><View style={s.empty}>
    <Image source={require('../../assets/crafted/badge.png')} style={{ width: 96, height: 96, opacity: .5 }} contentFit="contain" accessibilityIgnoresInvertColors />
    <Txt accessibilityRole="header" style={[ui.subtitle, s.emptyText]}>{"We couldn't find that badge"}</Txt>
    <Txt muted style={s.emptyText}>Your badges are all still safe. Have a look at the full list.</Txt>
    <Button title="See all badges" icon="badge" onPress={() => router.dismissTo('/badges')} />
  </View></Page>;
}

const s = StyleSheet.create({
  hero: { gap: S.lg },
  art: { alignItems: 'center', paddingVertical: S.sm },
  stack: { gap: S.xs },
  copy: { flex: 1, minWidth: 0, gap: S.xs },
  earned: { flexDirection: 'row', alignItems: 'center', gap: S.sm, marginBottom: S.sm },
  earnedText: { color: GOLD, flexShrink: 1 },
  section: { gap: S.md },
  list: { paddingHorizontal: S.xl },
  listHeader: { gap: S.xl, marginBottom: S.lg },
  gridRow: { gap: S.md },
  tile: { paddingVertical: S.sm, paddingHorizontal: S.xs, marginBottom: S.md, minWidth: 0 },
  dexNumber: { fontFamily: mono, fontSize: 12, lineHeight: 18, color: C.muted },
  ownedDot: { backgroundColor: GREEN, borderRadius: 10, padding: 3 },
  sprite: { width: '100%', height: 92, marginVertical: S.xs },
  languageRow: { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 48, paddingVertical: S.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  languageDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  languageDotEmpty: { backgroundColor: 'transparent', borderWidth: 2, borderColor: '#A7B59C' },
  languageName: { flex: 1, minWidth: 0 },
  languageCount: { flexShrink: 1, textAlign: 'right', fontWeight: '600' },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: S.md, minHeight: 44, paddingVertical: S.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  setProgress: { marginVertical: S.xs },
  setCount: { color: C.muted, fontWeight: '600', flexShrink: 1 },
  empty: { alignItems: 'center', paddingVertical: 28, gap: 12 },
  emptyText: { textAlign: 'center', maxWidth: 330 },
});
