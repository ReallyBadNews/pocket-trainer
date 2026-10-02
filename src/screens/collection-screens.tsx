import Animated from 'react-native-reanimated';
import { useChromeScroll } from '@/components/scroll-chrome';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { C, CardArt, CardCaption, Chip, Icon, LinkButton, Progress, R, S, SearchBox, Segmented, Txt, TypePill, Button, ButtonRow, mono, pressFx, tick, ui } from '@/components/pokedex-ui';
import { useCollection } from '@/lib/collection-context';
import { catalogSet, species, speciesById, speciesImage, normalize } from '@/lib/catalog';
import { CARD_FILTERS, matchesCardFilter, type CardFilter } from '@/lib/card-kind';
import { LANGUAGES, LANGUAGE_CODES, LANGUAGE_LABELS } from '@/lib/languages';
import { collectorNumber, discoveredIds, duplicateCards, totalCards, type Entry } from '@/lib/model';
import { CardPriceTag, CollectionValue } from '@/components/card-values';
import { HoloShine } from '@/components/celebration';
import { isShiny } from '@/lib/shine';
import { BINDER_SORTS, needsPrinting, sortBinderEntries, type BinderSort } from '@/lib/binder-order';
import { usePricing } from '@/lib/use-pricing';
import { speciesTypes, typeCounts, typeLabel, TYPE_COLORS, type PokemonType } from '@/lib/species-details';
import { QuizInvite } from './quiz-screen';
import { setProgress, type SetProgress } from '@/lib/set-progress';
import { BINDER_VIEWS, BinderPages, type BinderView } from '@/components/binder-pages';
import { wishesOf } from '@/lib/wishlist';

export function DexScreen({ onScan, onSpecies, onNeedsPrinting, onQuiz }: { onScan: () => void; onSpecies: (id: number) => void; onNeedsPrinting: () => void; onQuiz: () => void }) {
  const scroll = useChromeScroll();
  const { trainer } = useCollection();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All Pokémon');
  const { width, fontScale } = useWindowDimensions();
  const [listWidth, setListWidth] = useState(0);
  const contentWidth = (listWidth || Math.min(width, 1100)) - S.xl * 2;
  const gridWidth = contentWidth / Math.min(fontScale, 1.4);
  const columns = gridWidth >= 850 ? 5 : gridWidth >= 600 ? 4 : gridWidth >= 450 ? 3 : 2;
  const stackAdventure = contentWidth < 300 || fontScale > 1.2;
  const deviceWidth = Math.min(180, contentWidth * .34);
  const discovered = useMemo(() => discoveredIds(trainer), [trainer]);
  const types = useMemo(() => typeCounts(discovered), [discovered]);
  const [typeFilter, setTypeFilter] = useState<PokemonType | null>(null);
  // A type disappears from the readout if its last card is deleted; stop filtering by it too.
  const activeType = types.some(t => t.type === typeFilter) ? typeFilter : null;
  const visible = useMemo(() => species.filter(s => (filter !== 'Discovered' || discovered.has(s.id)) && (filter !== 'Kanto' || s.id <= 151) && (!activeType || speciesTypes(s.id).includes(activeType)) && (!query || normalize(`${LANGUAGES.map(lang => s[lang] ?? '').join('')}${s.id}`).includes(normalize(query)))), [query, filter, discovered, activeType]);
  return <Animated.FlatList {...scroll} onLayout={event => setListWidth(event.nativeEvent.layout.width)} key={columns} data={visible} numColumns={columns} keyExtractor={s => String(s.id)} showsVerticalScrollIndicator={false} contentContainerStyle={[s.list, scroll.contentContainerStyle]} columnWrapperStyle={{ gap: S.md }} initialNumToRender={15} maxToRenderPerBatch={20}
    ListHeaderComponent={<View style={s.header}>
      <View style={s.heading}><View style={s.headingCopy}><Txt accessibilityRole="header" variant="title">Your Pokédex</Txt><Txt muted>Every card starts a discovery.</Txt></View><View style={s.counter}><Txt style={s.counterNumber}>{String(discovered.size).padStart(3, '0')}</Txt><Txt muted variant="caption">discovered</Txt></View></View>
      <View style={[s.adventure, stackAdventure && s.adventureStack]}>
        <View style={[s.adventureCopy, stackAdventure && { flex: 0, alignSelf: 'stretch' }]}><Txt accessibilityRole="header" variant="subtitle">{discovered.size ? 'Who will you discover next?' : 'Your adventure starts here.'}</Txt><Txt muted variant="caption" style={{ marginTop: S.sm, maxWidth: 250 }}>{discovered.size ? 'A new card. A new story for your Pokédex.' : 'Turn the cards you love into a world to explore.'}</Txt><Button size="medium" title="Scan a card" onPress={onScan} icon="scan" style={{ alignSelf: 'flex-start', marginTop: S.md }} /></View>
        <Image source={require('../../assets/crafted/device.png')} style={[s.deviceArt, { width: deviceWidth, height: deviceWidth * 1.25 }, stackAdventure && s.deviceArtStack]} contentFit="contain" accessibilityLabel="Custom red Pokédex device" />
      </View>
      <QuizInvite onPlay={onQuiz} />
      <View style={s.readout}><View style={s.discoveryReadout}><View style={s.readoutLabel}><Txt variant="label" style={{ flexShrink: 1 }}>Pokémon discovered</Txt><Txt variant="readout">{discovered.size} / {species.length.toLocaleString()}</Txt></View><View style={{ marginTop: S.sm }}><Progress value={discovered.size} total={species.length} /></View></View><View style={s.cardsReadout}><Txt variant="subtitle">{totalCards(trainer)}</Txt><Txt muted variant="caption">cards in binder</Txt></View></View>
      <CollectionValue entries={trainer.entries} compact onNeedsPrinting={onNeedsPrinting} />
      <SearchBox value={query} onChange={setQuery} placeholder="Find a Pokémon by name or number" />
      <View style={s.chipWrap}>{['All Pokémon', 'Discovered', 'Kanto'].map(label => <Chip key={label} label={label} selected={filter === label} onPress={() => setFilter(label)} />)}</View>
      {types.length > 0 && <View style={s.types}>
        <View style={s.sectionHeading}><Txt variant="label">Your types</Txt><Txt muted variant="caption" style={{ flexShrink: 1 }}>{activeType ? `Showing ${typeLabel(activeType)} Pokémon` : 'Tap a type to explore'}</Txt></View>
        <View style={s.typeBar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{types.map(t => <View key={t.type} style={{ flex: t.count, backgroundColor: TYPE_COLORS[t.type], opacity: activeType && activeType !== t.type ? .3 : 1 }} />)}</View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bleed} contentContainerStyle={s.bleedContent}>{types.map(t => <TypePill key={t.type} type={t.type} count={t.count} selected={activeType === t.type} onPress={() => setTypeFilter(activeType === t.type ? null : t.type)} />)}</ScrollView>
      </View>}
    </View>}
    ListEmptyComponent={<View style={s.empty}>{!discovered.size && <Image source={require('../../assets/crafted/pokeball.png')} style={{ width: 150, height: 150 }} contentFit="contain" />}<Txt style={ui.subtitle}>{query || activeType ? 'No Pokémon found' : 'Your first discovery is waiting'}</Txt><Txt muted style={{ textAlign: 'center', maxWidth: 280 }}>{query ? 'Try another name, or a number like 25.' : activeType ? `No ${typeLabel(activeType)} Pokémon here. Try another type or filter.` : 'Add a Pokémon card to bring its entry to life.'}</Txt>{!discovered.size && !query && <Button title="Scan a card" icon="scan" onPress={onScan} style={{ marginTop: 10 }} />}</View>}
    renderItem={({ item }) => {
      const owned = discovered.has(item.id);
      return <Pressable accessibilityRole="button" accessibilityLabel={`${item.en}, number ${item.id}, ${owned ? 'discovered' : 'not yet discovered'}`} onPress={() => onSpecies(item.id)} style={({ pressed }) => [s.pokemon, { flex: 1 / columns }, owned && s.pokemonOwned, pressed && { opacity: .7 }]}>
        <View style={ui.between}><Txt style={s.dexNumber}>#{String(item.id).padStart(3, '0')}</Txt>{owned ? <View style={s.ownedDot}><Icon name="check" size={11} color="#fff" /></View> : <Icon name="lock" color="#A7B59C" size={13} />}</View>
        <Image source={speciesImage(item.id)} style={[s.sprite, !owned && { opacity: .25 }]} tintColor={owned ? undefined : '#526B50'} contentFit="contain" cachePolicy="memory-disk" />
        <Txt variant="cardTitle" style={{ textAlign: 'center', minHeight: 40 }}>{item.en}</Txt>
        {!owned && <Txt muted variant="caption" style={{ textAlign: 'center' }}>Not found yet</Txt>}
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
  const [sortOpen, setSortOpen] = useState(false);
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
  const sortLabel = BINDER_SORTS.find(option => option.id === sort)!.label;
  const sets = useMemo(() => setProgress(trainer, catalogSet), [trainer]);
  const pages = view === 'pages';
  function clearFilters() { setQuery(''); setFilter('All cards'); setTypeFilter('all'); onNeedsPrintingChange(false); }
  // Pages keep this vertical list, so the app chrome still collapses; the carousel lives in the header.
  return <Animated.FlatList {...scroll} onLayout={event => setListWidth(event.nativeEvent.layout.width)} data={pages ? [] : entries} key={columns} numColumns={columns} keyExtractor={e => e.key} columnWrapperStyle={{ gap: S.md }} contentContainerStyle={[s.list, scroll.contentContainerStyle]} showsVerticalScrollIndicator={false}
    ListHeaderComponent={<View style={s.header}>
      <View><Txt accessibilityRole="header" variant="title">Your card binder</Txt><Txt muted>{totalCards(trainer)} {totalCards(trainer) === 1 ? 'card' : 'cards'} · {duplicateCards(trainer)} {duplicateCards(trainer) === 1 ? 'double' : 'doubles'}</Txt></View>
      <ButtonRow><Button size="medium" title="Add a card" icon="plus" onPress={onScan} /><Button size="medium" secondary title={`Wishlist (${wishCount})`} icon="star" onPress={onWishlist} style={s.wishButton} /></ButtonRow>
      <Segmented label="Binder view" options={BINDER_VIEWS} value={view} onChange={onViewChange} />
      {!pages && <CollectionValue entries={trainer.entries} onNeedsPrinting={() => { setQuery(''); setFilter('All cards'); setTypeFilter('all'); onNeedsPrintingChange(true); }} />}
      {!pages && <YourSets sets={sets} onSet={onSet} />}
      <SearchBox value={query} onChange={setQuery} placeholder="Search your cards" />
      <View style={{ gap: S.sm }}>
        <View style={s.tools}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Sort binder: ${sortLabel}`} aria-expanded={sortOpen} onPress={() => { tick(); setSortOpen(open => !open); }} style={state => [s.toolButton, s.sortButton, { flexBasis: 196 * Math.min(fontScale, 1.4) }, sortOpen && { borderColor: C.ink }, pressFx(state)]}>
            <Icon name="tools" size={18} /><Txt variant="control" style={s.toolText}>Sort: {sortLabel}</Txt><View style={{ transform: [{ rotate: sortOpen ? '90deg' : '-90deg' }] }}><Icon name="back" size={16} /></View>
          </Pressable>
          <Pressable accessibilityRole="checkbox" accessibilityLabel={`Needs printing${confirmationCount ? `, ${confirmationCount} cards` : ''}`} aria-checked={onlyNeedsPrinting} onPress={() => { tick(); onNeedsPrintingChange(!onlyNeedsPrinting); }} style={state => [s.toolButton, s.needsButton, { flexBasis: 196 * Math.min(fontScale, 1.4) }, onlyNeedsPrinting && s.needsSelected, pressFx(state)]}>
            {onlyNeedsPrinting && <Icon name="check" size={18} color="#FFF9E9" />}<Txt variant="control" style={[s.toolText, { color: onlyNeedsPrinting ? '#FFF9E9' : '#786037' }]}>Needs printing{confirmationCount ? ` (${confirmationCount})` : ''}</Txt>
          </Pressable>
        </View>
        {sortOpen && <View accessibilityRole="radiogroup" accessibilityLabel="Binder sort order" style={s.sortMenu}>{BINDER_SORTS.map(option => <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={option.label} aria-checked={sort === option.id} onPress={() => { tick(); setSort(option.id); setSortOpen(false); }} style={state => [s.sortOption, sort === option.id && s.sortOptionOn, pressFx(state)]}><Txt variant="control" style={{ flex: 1, fontWeight: sort === option.id ? '700' : '500' }}>{option.label}</Txt>{sort === option.id && <Icon name="check" size={18} />}</Pressable>)}</View>}
        {priceSort && <Txt muted variant="caption">Uses the lower estimate in each range. Unpriced cards appear last.</Txt>}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bleed} contentContainerStyle={s.bleedContent}>{['All cards', 'Favorites', 'Doubles', 'Japanese', 'Korean', 'Chinese'].map(label => <Chip key={label} label={label} selected={label === filter} onPress={() => setFilter(label)} />)}</ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bleed} contentContainerStyle={s.bleedContent}>{CARD_FILTERS.map(f => <Chip key={f.id} label={f.id === 'all' ? 'Every type' : f.label} selected={typeFilter === f.id} onPress={() => setTypeFilter(f.id)} />)}</ScrollView>
      {(onlyNeedsPrinting || query || filter !== 'All cards' || typeFilter !== 'all') && <View style={s.sectionHeading}><Txt muted variant="caption" style={{ flexShrink: 1 }}>{entries.length} {entries.length === 1 ? 'card' : 'cards'}{onlyNeedsPrinting ? ' to confirm' : ' shown'}</Txt><LinkButton title="Clear filters" onPress={clearFilters} /></View>}
      {pages && entries.length > 0 && <BinderPages entries={entries} onEntry={onEntry} />}
    </View>}
    ListEmptyComponent={pages && entries.length > 0 ? null : <View style={s.empty}><Image source={require('../../assets/crafted/pokeball.png')} style={{ width: 150, height: 150 }} contentFit="contain" /><Txt style={ui.subtitle}>{onlyNeedsPrinting && !confirmationCount ? 'All printings confirmed' : trainer.entries.length ? 'No cards match these filters' : 'A home for every card'}</Txt><Txt muted style={{ textAlign: 'center', maxWidth: 280 }}>{onlyNeedsPrinting && !confirmationCount ? 'Your saved cards each have a printing selected.' : trainer.entries.length ? 'Try a different search or clear your filters.' : 'Add your English, Japanese, Korean and Chinese cards. Your favorites and extra copies will be easy to find.'}</Txt><Button title={trainer.entries.length ? 'Show all cards' : 'Add a card'} onPress={trainer.entries.length ? clearFilters : onScan} style={{ marginTop: 10 }} /></View>}
    renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.card.name}, ${item.quantity} ${item.quantity === 1 ? 'copy' : 'copies'}, ${LANGUAGE_LABELS[item.card.language]}`} onPress={() => onEntry(item)} style={({ pressed }) => [{ flex: 1 / columns, marginBottom: 20 }, pressed && { opacity: .7 }]}>
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
      return <Pressable key={set.key} accessibilityRole="button" accessibilityLabel={`${set.name}, ${LANGUAGE_LABELS[set.language]}: ${set.owned} of ${set.official} cards${note ? `, ${note}` : ''}. Open checklist`} onPress={() => { tick(); onSet(set); }} style={state => [s.setRow, set.complete && s.setDone, pressFx(state)]}>
        <View style={[ui.between, { alignItems: 'flex-start' }]}><View style={s.setName}><Txt variant="cardTitle" style={{ flexShrink: 1 }}>{set.name}</Txt><Txt variant="caption" style={s.setLanguage}>{LANGUAGE_CODES[set.language]}</Txt></View><Txt variant="readout" style={{ fontWeight: '600' }}>{set.owned} / {set.official}</Txt></View>
        <Progress value={set.owned} total={set.official} color={set.complete ? '#A98428' : '#679255'} />
        {!!note && <View style={ui.row}>{set.complete && <Icon name="check" size={13} color="#80611F" />}<Txt variant="caption" style={{ flexShrink: 1, fontWeight: '600', color: set.complete ? '#80611F' : C.muted }}>{note}</Txt></View>}
      </Pressable>;
    })}
    {sets.length > 3 && <Pressable accessibilityRole="button" accessibilityLabel={all ? 'Show fewer sets' : `See all ${sets.length} sets`} aria-expanded={all} onPress={() => { tick(); setAll(value => !value); }} style={state => [s.setsToggle, pressFx(state)]}><Txt variant="label" style={{ flexShrink: 1 }}>{all ? 'Show fewer sets' : `See all sets (${sets.length})`}</Txt><Icon name={all ? 'minus' : 'plus'} size={18} /></Pressable>}
  </View>;
}

const PAD = S.xl;
const s = StyleSheet.create({
  list: { padding: PAD, paddingBottom: 32 }, header: { gap: S.lg, marginBottom: S.lg },
  // Chip rows scroll edge to edge instead of stopping short at the screen padding.
  bleed: { marginHorizontal: -PAD }, bleedContent: { gap: S.sm, paddingHorizontal: PAD },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  heading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: S.md },
  headingCopy: { flexGrow: 1, flexBasis: 190, minWidth: 0 },
  sectionHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: S.md, rowGap: S.xs },
  counter: { flexShrink: 0, alignItems: 'center', backgroundColor: '#DCE6CD', borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: S.sm },
  counterNumber: { fontFamily: mono, fontSize: 24, lineHeight: 29, fontWeight: '700' },
  adventure: { backgroundColor: '#E0E9D1', borderRadius: R.lg, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', padding: S.lg, borderWidth: 1, borderColor: '#CCD9BA' },
  adventureStack: { flexDirection: 'column', alignItems: 'flex-start', gap: S.sm },
  adventureCopy: { flex: 1, minWidth: 0, paddingRight: S.sm, zIndex: 1 },
  // The device bleeds past the card padding so it reads as sitting on the edge.
  deviceArt: { marginLeft: -8, marginRight: -12, marginVertical: -S.lg, transform: [{ rotate: '8deg' }] },
  deviceArtStack: { alignSelf: 'flex-end', width: 140, height: 175, marginVertical: -S.sm, marginLeft: 0, marginRight: 0 },
  readout: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: S.lg, rowGap: S.md, paddingVertical: S.xs },
  discoveryReadout: { flexGrow: 1, flexBasis: 210, minWidth: 0 },
  readoutLabel: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: S.xs },
  cardsReadout: { flexGrow: 1, flexBasis: 100 },
  // 2px gaps keep neighbouring type colors distinct in the stacked bar.
  types: { gap: 8 }, typeBar: { flexDirection: 'row', gap: 2, height: 10, borderRadius: 5, overflow: 'hidden' },
  pokemon: { backgroundColor: '#E6EDDB', borderRadius: 14, padding: 11, marginBottom: S.md, borderWidth: 1, borderColor: '#D8E1CD', overflow: 'hidden' },
  pokemonOwned: { backgroundColor: '#FCFDF9', borderColor: '#ADC79F' }, dexNumber: { fontFamily: mono, fontSize: 11, lineHeight: 18, color: '#7B8D73' },
  sprite: { width: '100%', height: 108, marginVertical: 4 }, ownedDot: { backgroundColor: '#679255', borderRadius: 10, padding: 3 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 38, gap: 12 },
  wishButton: { backgroundColor: '#F7ECC8', borderBottomColor: '#D5B458' },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm, alignItems: 'stretch' },
  toolButton: { flexGrow: 1, flexShrink: 0, maxWidth: '100%', justifyContent: 'center', minHeight: 48, borderRadius: R.md, borderWidth: 1, paddingHorizontal: S.md, paddingVertical: S.sm, flexDirection: 'row', alignItems: 'center', gap: S.sm },
  toolText: { flex: 1, minWidth: 0 },
  sortButton: { borderColor: '#C0CDB3', backgroundColor: '#F5F8EE' },
  needsButton: { borderColor: '#D5C6A7', backgroundColor: '#F2ECD9' },
  needsSelected: { backgroundColor: '#786037', borderColor: '#786037' },
  sortMenu: { borderRadius: R.md, padding: S.xs, gap: 2, backgroundColor: '#FAFCF6', borderWidth: 1, borderColor: '#C0CDB3' },
  sortOption: { minHeight: 48, paddingHorizontal: S.md, paddingVertical: S.sm, borderRadius: R.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S.sm },
  sortOptionOn: { backgroundColor: '#E9EFE0' },
  quantity: { position: 'absolute', bottom: 8, right: 8, backgroundColor: C.ink, paddingHorizontal: 9, borderRadius: 7 },
  favorite: { position: 'absolute', top: 7, right: 7, backgroundColor: 'white', borderRadius: 20, padding: 6 },
  sets: { gap: S.sm, padding: S.md, paddingBottom: S.xs, borderRadius: R.lg, backgroundColor: '#F5F8EE', borderWidth: 1, borderColor: C.line },
  setRow: { minHeight: 52, gap: S.sm, padding: S.md, borderRadius: R.md, backgroundColor: '#FCFDF9', borderWidth: 1, borderColor: '#DCE4D2', justifyContent: 'center' },
  setDone: { backgroundColor: '#F7ECCC', borderColor: '#DBC786' },
  setName: { flex: 1, minWidth: 0, alignItems: 'flex-start', gap: S.xs },
  setLanguage: { paddingHorizontal: S.xs, borderRadius: R.sm, overflow: 'hidden', backgroundColor: '#DCE6D0', color: C.muted },
  setsToggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: S.xs, gap: S.sm },
});
