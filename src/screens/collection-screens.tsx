import Animated from 'react-native-reanimated';
import { useChromeScroll } from '@/components/scroll-chrome';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { C, CardArt, CardCaption, ChoiceMenu, Icon, IconButton, Progress, S, SearchBox, ToolbarAction, Txt, Button, mono, pressFx, tick, ui } from '@/components/pokedex-ui';
import { useCollection } from '@/lib/collection-context';
import { catalogSet, species, speciesById, speciesImage, normalize } from '@/lib/catalog';
import { CARD_FILTERS, matchesCardFilter, type CardFilter } from '@/lib/card-kind';
import { LANGUAGES, LANGUAGE_CODES, LANGUAGE_LABELS } from '@/lib/languages';
import { collectorNumber, discoveredIds, duplicateCards, FINISH_LABELS, totalCards, type Entry } from '@/lib/model';
import { CardPriceTag, CollectionValue } from '@/components/card-values';
import { HoloShine } from '@/components/celebration';
import { isShiny } from '@/lib/shine';
import { BINDER_SORTS, needsPrinting, sortBinderEntries, type BinderSort } from '@/lib/binder-order';
import { usePricing } from '@/lib/use-pricing';
import { speciesTypes, typeCounts, typeLabel, TYPE_COLORS, type PokemonType } from '@/lib/species-details';
import { QuizInvite } from './quiz-screen';
import { QUIZ_LENGTH } from '@/lib/quiz';
import { setProgress, type SetProgress } from '@/lib/set-progress';
import { BINDER_VIEWS, BinderPages, type BinderView } from '@/components/binder-pages';
import { wishesOf } from '@/lib/wishlist';

export function DexScreen({ onScan, onSpecies, onEntry, onNeedsPrinting, onQuiz }: { onScan: () => void; onSpecies: (id: number) => void; onEntry: (entry: Entry) => void; onNeedsPrinting: () => void; onQuiz: () => void }) {
  const scroll = useChromeScroll();
  const { trainer } = useCollection();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All Pokémon');
  const { width, fontScale } = useWindowDimensions();
  const [listWidth, setListWidth] = useState(0);
  const contentWidth = (listWidth || Math.min(width, 1100)) - S.xl * 2;
  const gridWidth = contentWidth / Math.min(fontScale, 1.4);
  const columns = gridWidth >= 850 ? 5 : gridWidth >= 600 ? 4 : gridWidth >= 450 ? 3 : 2;
  const [overviewOpen, setOverviewOpen] = useState(false);
  const discovered = useMemo(() => discoveredIds(trainer), [trainer]);
  const types = useMemo(() => typeCounts(discovered), [discovered]);
  const [typeFilter, setTypeFilter] = useState<PokemonType | null>(null);
  // A type disappears from the readout if its last card is deleted; stop filtering by it too.
  const activeType = types.some(t => t.type === typeFilter) ? typeFilter : null;
  const visible = useMemo(() => species.filter(s => (filter !== 'Discovered' || discovered.has(s.id)) && (filter !== 'Kanto' || s.id <= 151) && (!activeType || speciesTypes(s.id).includes(activeType)) && (!query || normalize(`${LANGUAGES.map(lang => s[lang] ?? '').join('')}${s.id}`).includes(normalize(query)))), [query, filter, discovered, activeType]);
  return <Animated.FlatList {...scroll} onLayout={event => setListWidth(event.nativeEvent.layout.width)} key={columns} data={visible} numColumns={columns} keyExtractor={s => String(s.id)} showsVerticalScrollIndicator={false} contentContainerStyle={[s.list, scroll.contentContainerStyle]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" columnWrapperStyle={{ gap: S.md }} initialNumToRender={15} maxToRenderPerBatch={20}
    ListHeaderComponent={<View style={s.header}>
      <View><Txt accessibilityRole="header" variant="title">Your Pokédex</Txt><View style={s.summaryRow}><Txt muted variant="caption" style={s.summaryCopy}>{discovered.size} discovered</Txt><QuizInvite onPlay={onQuiz} /><ToolbarAction title="Overview" expanded={overviewOpen} onPress={() => setOverviewOpen(open => !open)} /></View></View>
      {trainer.entries.length > 0 && <CollectionValue entries={trainer.entries} onNeedsPrinting={onNeedsPrinting} onEntry={onEntry} />}
      <SearchBox value={query} onChange={setQuery} placeholder="Find a Pokémon by name or number" />
      <View style={s.toolbar}>
        <ChoiceMenu compact label="Show Pokémon" options={['All Pokémon', 'Discovered', 'Kanto'].map(label => ({ id: label, label }))} value={filter} onChange={setFilter} style={s.menu} />
        {types.length > 0 && <ChoiceMenu<PokemonType | 'all'> compact label="Pokémon type" options={[{ id: 'all', label: 'Every type' }, ...types.map(t => ({ id: t.type, label: `${typeLabel(t.type)} (${t.count})` }))]} value={activeType ?? 'all'} onChange={value => setTypeFilter(value === 'all' ? null : value)} style={s.menu} />}
      </View>
      {overviewOpen && <View style={s.overview}>
        <View style={s.section}><Txt accessibilityRole="header" variant="subtitle">Your discoveries</Txt><Progress value={discovered.size} total={species.length} /><Txt muted variant="caption">{discovered.size} Pokémon discovered · {totalCards(trainer)} cards in binder</Txt>{!!trainer.quizBest && <Txt muted variant="caption">Best quiz score: {trainer.quizBest}/{QUIZ_LENGTH}</Txt>}</View>
        {types.length > 0 && <View style={s.section}><Txt accessibilityRole="header" variant="subtitle">Your types</Txt><View style={s.typeBar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{types.map(t => <View key={t.type} style={{ flex: t.count, backgroundColor: TYPE_COLORS[t.type] }} />)}</View>{types.map(t => <Pressable key={t.type} accessibilityRole="button" accessibilityLabel={`${typeLabel(t.type)}, ${t.count} discovered. ${activeType === t.type ? 'Show every type' : 'Show this type'}`} accessibilityState={{ selected: activeType === t.type }} onPress={() => { tick(); setTypeFilter(activeType === t.type ? null : t.type); setOverviewOpen(false); }} style={state => [s.typeRow, pressFx(state)]}><View style={[s.typeDot, { backgroundColor: TYPE_COLORS[t.type] }]} /><Txt style={{ flex: 1 }}>{typeLabel(t.type)}</Txt><Txt muted variant="readout">{t.count}</Txt>{activeType === t.type && <Icon name="check" size={18} />}</Pressable>)}</View>}
      </View>}
      {!discovered.size && filter !== 'Discovered' && !query && !activeType && <View style={s.section}>
        <Txt accessibilityRole="header" variant="subtitle">Your first discovery is waiting</Txt><Txt muted variant="caption">Add a Pokémon card to bring its entry to life.</Txt><Button size="medium" title="Scan a card" icon="scan" onPress={onScan} style={{ alignSelf: 'flex-start' }} />
      </View>}
      {(query || activeType || filter !== 'All Pokémon') && <View style={s.sectionHeading}><Txt muted variant="caption">{visible.length} Pokémon shown</Txt><ToolbarAction title="Clear" onPress={() => { setQuery(''); setFilter('All Pokémon'); setTypeFilter(null); }} /></View>}
    </View>}
    ListEmptyComponent={<View style={s.empty}>{!discovered.size && !query && <Image source={require('../../assets/crafted/pokeball.png')} style={{ width: 104, height: 104 }} contentFit="contain" />}<Txt style={ui.subtitle}>{query || activeType ? 'No Pokémon found' : 'Your first discovery is waiting'}</Txt><Txt muted style={{ textAlign: 'center', maxWidth: 280 }}>{query ? 'Try another name, or a number like 25.' : activeType ? `No ${typeLabel(activeType)} Pokémon here. Try another type or filter.` : 'Add a Pokémon card to bring its entry to life.'}</Txt>{!discovered.size && !query && <Button title="Scan a card" icon="scan" onPress={onScan} style={{ marginTop: 10 }} />}</View>}
    renderItem={({ item }) => {
      const owned = discovered.has(item.id);
      return <Pressable accessibilityRole="button" accessibilityLabel={`${item.en}, number ${item.id}, ${owned ? 'discovered' : 'not yet discovered'}`} onPress={() => onSpecies(item.id)} style={({ pressed }) => [s.pokemon, { flex: 1 / columns }, pressed && { opacity: .7 }]}>
        <View style={ui.between}><Txt style={s.dexNumber}>#{String(item.id).padStart(3, '0')}</Txt>{owned ? <View style={s.ownedDot}><Icon name="check" size={11} color="#fff" /></View> : <Icon name="lock" color="#A7B59C" size={13} />}</View>
        <Image source={speciesImage(item.id)} style={[s.sprite, !owned && { opacity: .25 }]} tintColor={owned ? undefined : '#526B50'} contentFit="contain" cachePolicy="memory-disk" />
        <Txt variant="cardTitle" style={{ textAlign: 'center' }}>{item.en}</Txt>
      </Pressable>;
    }} />;
}

export function BinderScreen({ onScan, onEntry, onSet, onWishlist, onlyNeedsPrinting, onNeedsPrintingChange, view, onViewChange }: {
  onScan: () => void; onEntry: (entry: Entry) => void; onSet: (set: SetProgress) => void; onWishlist: () => void; onlyNeedsPrinting: boolean; onNeedsPrintingChange: (value: boolean) => void;
  view: BinderView; onViewChange: (view: BinderView) => void;
}) {
  const scroll = useChromeScroll();
  const { trainer } = useCollection();
  const wishCount = wishesOf(trainer).length;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All cards');
  const [typeFilter, setTypeFilter] = useState<CardFilter>('all');
  const [sort, setSort] = useState<BinderSort>('recent');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const { width, fontScale } = useWindowDimensions();
  const [listWidth, setListWidth] = useState(0);
  const contentWidth = (listWidth || Math.min(width, 1100)) - S.xl * 2;
  const gridWidth = contentWidth / Math.min(fontScale, 1.4);
  const columns = gridWidth >= 850 ? 5 : gridWidth >= 600 ? 4 : gridWidth >= 450 ? 3 : 2;
  const client = usePricing(trainer.entries.map(e => e.card), 20);
  const confirmationCount = trainer.entries.filter(needsPrinting).length;
  const filtered = trainer.entries.filter(e => (!onlyNeedsPrinting || needsPrinting(e)) && matchesCardFilter(e.card, typeFilter) && (!query || query.trim().split(/\s+/).every(term => normalize(`${e.card.name} ${e.card.set.name} ${e.card.localId} ${e.card.dexIds.map(id => speciesById.get(id)?.en ?? '').join(' ')}`).includes(normalize(term)))) && (filter !== 'Favorites' || e.favorite) && (filter !== 'Doubles' || e.quantity > 1) && (filter !== 'Japanese' || e.card.language === 'ja') && (filter !== 'Korean' || e.card.language === 'ko') && (filter !== 'Chinese' || e.card.language.startsWith('zh-')));
  const entries = sortBinderEntries(filtered, sort, client.snapshots, client.fx);
  const priceSort = sort === 'priceHigh' || sort === 'priceLow';
  const sets = useMemo(() => setProgress(trainer, catalogSet), [trainer]);
  const pages = view === 'pages';
  const activeFilters = Number(filter !== 'All cards') + Number(typeFilter !== 'all') + Number(onlyNeedsPrinting);
  function clearFilters() { setQuery(''); setFilter('All cards'); setTypeFilter('all'); onNeedsPrintingChange(false); }
  // Pages keep this vertical list, so the app chrome still collapses; the carousel lives in the header.
  return <Animated.FlatList {...scroll} onLayout={event => setListWidth(event.nativeEvent.layout.width)} data={pages ? [] : entries} key={columns} numColumns={columns} keyExtractor={e => e.key} columnWrapperStyle={{ gap: S.md }} contentContainerStyle={[s.list, scroll.contentContainerStyle]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
    ListHeaderComponent={<View style={s.header}>
      <View><View style={s.collectionTitle}><Txt accessibilityRole="header" variant="title" style={{ flex: 1 }}>Binder</Txt><IconButton icon="plus" label="Add card" color={C.redDark} onPress={onScan} /><IconButton icon="star" label={`Wishlist (${wishCount})`} onPress={onWishlist} /></View><Txt muted variant="caption">{totalCards(trainer)} {totalCards(trainer) === 1 ? 'card' : 'cards'}{duplicateCards(trainer) ? ` · ${duplicateCards(trainer)} ${duplicateCards(trainer) === 1 ? 'double' : 'doubles'}` : ''}</Txt></View>
      {trainer.entries.length > 0 && <CollectionValue entries={trainer.entries} onEntry={onEntry} onNeedsPrinting={() => { clearFilters(); onNeedsPrintingChange(true); setOverviewOpen(false); }} />}
      <SearchBox value={query} onChange={setQuery} placeholder="Search your cards" />
      <View style={s.toolbar}>
        <ChoiceMenu compact triggerTitle="View" label="Binder view" options={BINDER_VIEWS} value={view} onChange={onViewChange} style={[s.tool, { flexBasis: 74 * Math.min(fontScale, 1.4) }]} />
        <ChoiceMenu compact triggerTitle="Sort" label="Sort cards" options={BINDER_SORTS} value={sort} onChange={setSort} style={[s.tool, { flexBasis: 74 * Math.min(fontScale, 1.4) }]} />
        <ToolbarAction title={filtersOpen ? 'Done' : activeFilters ? `Filter (${activeFilters})` : 'Filter'} expanded={filtersOpen} onPress={() => { setOverviewOpen(false); setFiltersOpen(open => !open); }} style={[s.tool, { flexBasis: (activeFilters ? 96 : 74) * Math.min(fontScale, 1.4) }]} />
        {sets.length > 0 && <ToolbarAction title="Sets" expanded={overviewOpen} onPress={() => { setFiltersOpen(false); setOverviewOpen(open => !open); }} style={[s.tool, { flexBasis: 74 * Math.min(fontScale, 1.4) }]} />}
      </View>
      {filtersOpen && <View style={s.section}>
        <ChoiceMenu label="Show" options={['All cards', 'Favorites', 'Doubles', 'Japanese', 'Korean', 'Chinese'].map(label => ({ id: label, label }))} value={filter} onChange={setFilter} />
        <ChoiceMenu label="Card kind" options={CARD_FILTERS} value={typeFilter} onChange={setTypeFilter} />
        <ChoiceMenu label="Printing" options={[{ id: 'all', label: 'All printings' }, { id: 'needs', label: `Needs printing (${confirmationCount})` }]} value={onlyNeedsPrinting ? 'needs' : 'all'} onChange={value => onNeedsPrintingChange(value === 'needs')} />
      </View>}
      {overviewOpen && sets.length > 0 && <View style={s.overview}>
        <YourSets sets={sets} onSet={onSet} />
      </View>}
      {priceSort && <Txt muted variant="caption">Uses the lower estimate in each range. Unpriced cards appear last.</Txt>}
      {(activeFilters > 0 || query) && <View style={s.sectionHeading}><Txt muted variant="caption" style={{ flexShrink: 1 }}>{entries.length} {entries.length === 1 ? 'card' : 'cards'}{onlyNeedsPrinting ? ' to confirm' : ' shown'}</Txt><ToolbarAction title="Clear filters" onPress={clearFilters} /></View>}
      {pages && entries.length > 0 && <BinderPages entries={entries} onEntry={onEntry} />}
    </View>}
    ListEmptyComponent={pages && entries.length > 0 ? null : <View style={s.empty}><Image source={require('../../assets/crafted/pokeball.png')} style={{ width: 150, height: 150 }} contentFit="contain" /><Txt style={ui.subtitle}>{onlyNeedsPrinting && !confirmationCount ? 'All printings confirmed' : trainer.entries.length ? 'No cards match these filters' : 'A home for every card'}</Txt><Txt muted style={{ textAlign: 'center', maxWidth: 280 }}>{onlyNeedsPrinting && !confirmationCount ? 'Your saved cards each have a printing selected.' : trainer.entries.length ? 'Try a different search or clear your filters.' : 'Add your English, Japanese, Korean and Chinese cards. Your favorites and extra copies will be easy to find.'}</Txt><Button title={trainer.entries.length ? 'Show all cards' : 'Add a card'} onPress={trainer.entries.length ? clearFilters : onScan} style={{ marginTop: 10 }} /></View>}
    renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.card.name}, ${item.card.set.name}, ${collectorNumber(item.card)}, ${LANGUAGE_LABELS[item.card.language]}, ${FINISH_LABELS[item.finish]}, ${item.quantity} ${item.quantity === 1 ? 'copy' : 'copies'}${item.favorite ? ', favorite' : ''}`} onPress={() => onEntry(item)} style={({ pressed }) => [{ flex: 1 / columns, marginBottom: 20 }, pressed && { opacity: .7 }]}>
      <View>{isShiny(item.card, item.finish) ? <HoloShine><CardArt card={item.card} /></HoloShine> : <CardArt card={item.card} />}{item.quantity > 1 && <View style={s.quantity}><Txt maxFontSizeMultiplier={1} style={{ color: 'white', fontWeight: '800', fontSize: 13 }}>×{item.quantity}</Txt></View>}{item.favorite && <View style={s.favorite}><Icon name="heart" size={15} color={C.red} filled /></View>}</View>
      <CardCaption name={item.card.name} setName={item.card.set.name} detail={`${item.card.language !== 'en' ? `${LANGUAGE_CODES[item.card.language]} · ` : ''}${collectorNumber(item.card)}`} />
      <CardPriceTag card={item.card} finish={item.finish} />
    </Pressable>} />;
}

/** Collection overview: the sets closest to complete, with a checklist behind each one. */
function YourSets({ sets, onSet }: { sets: SetProgress[]; onSet: (set: SetProgress) => void }) {
  const [all, setAll] = useState(false);
  if (!sets.length) return null;
  const complete = sets.filter(set => set.complete).length;
  return <View style={s.sets}>
    <View style={s.sectionHeading}><Txt accessibilityRole="header" variant="subtitle">Your sets</Txt><Txt muted variant="caption" style={{ flexShrink: 1 }}>{complete ? `${complete} complete!` : 'Tap a set to see what’s missing'}</Txt></View>
    {(all ? sets : sets.slice(0, 3)).map(set => {
      const note = [set.complete && 'Set complete!', set.bonus > 0 && `+${set.bonus} bonus`].filter(Boolean).join(' · ');
      return <Pressable key={set.key} accessibilityRole="button" accessibilityLabel={`${set.name}, ${LANGUAGE_LABELS[set.language]}: ${set.owned} of ${set.official} cards${note ? `, ${note}` : ''}. Open checklist`} onPress={() => { tick(); onSet(set); }} style={state => [s.setRow, pressFx(state)]}>
        <View style={[ui.between, { alignItems: 'flex-start', gap: S.md }]}><Txt variant="cardTitle" style={s.setName}>{set.name}<Txt variant="caption" muted> · {LANGUAGE_CODES[set.language]}</Txt></Txt><Txt variant="readout" style={{ fontWeight: '600' }}>{set.owned} / {set.official}</Txt></View>
        <Progress value={set.owned} total={set.official} color={set.complete ? '#A98428' : '#679255'} />
        {!!note && <View style={ui.row}>{set.complete && <Icon name="check" size={13} color="#80611F" />}<Txt variant="caption" style={{ flexShrink: 1, fontWeight: '600', color: set.complete ? '#80611F' : C.muted }}>{note}</Txt></View>}
      </Pressable>;
    })}
    {sets.length > 3 && <Pressable accessibilityRole="button" accessibilityLabel={all ? 'Show fewer sets' : `See all ${sets.length} sets`} aria-expanded={all} onPress={() => { tick(); setAll(value => !value); }} style={state => [s.setsToggle, pressFx(state)]}><Txt variant="label" style={{ flexShrink: 1 }}>{all ? 'Show fewer sets' : `See all sets (${sets.length})`}</Txt><Icon name={all ? 'minus' : 'plus'} size={18} /></Pressable>}
  </View>;
}

const PAD = S.xl;
const s = StyleSheet.create({
  list: { padding: PAD, paddingBottom: 32 }, header: { gap: S.sm, marginBottom: S.lg },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: S.xs },
  summaryCopy: { flexGrow: 1, flexShrink: 1, minWidth: 0, paddingVertical: S.sm },
  collectionTitle: { flexDirection: 'row', alignItems: 'center', gap: S.xs },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: S.xs },
  tool: { flexGrow: 1, flexShrink: 0, maxWidth: '100%' },
  menu: { flex: 1, minWidth: 0 },
  sectionHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: S.md, rowGap: S.xs },
  section: { gap: S.sm }, overview: { gap: S.xl, paddingVertical: S.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  typeBar: { flexDirection: 'row', gap: 2, height: 7, borderRadius: 4, overflow: 'hidden' },
  typeRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: S.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  typeDot: { width: 12, height: 12, borderRadius: 6 },
  pokemon: { paddingVertical: S.sm, paddingHorizontal: S.xs, marginBottom: S.md },
  dexNumber: { fontFamily: mono, fontSize: 12, lineHeight: 18, color: C.muted },
  sprite: { width: '100%', height: 108, marginVertical: S.xs }, ownedDot: { backgroundColor: '#679255', borderRadius: 10, padding: 3 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 38, gap: 12 },
  quantity: { position: 'absolute', bottom: 8, right: 8, backgroundColor: C.ink, paddingHorizontal: 9, borderRadius: 7 },
  favorite: { position: 'absolute', top: 7, right: 7, backgroundColor: 'white', borderRadius: 20, padding: 6 },
  sets: { gap: S.sm },
  setRow: { minHeight: 52, gap: S.sm, paddingVertical: S.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, justifyContent: 'center' },
  setName: { flex: 1, minWidth: 0 },
  setsToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S.sm },
});
