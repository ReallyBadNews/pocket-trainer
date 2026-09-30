import Animated from 'react-native-reanimated';
import { useChromeScroll } from '@/components/scroll-chrome';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { C, CardArt, Chip, Icon, LinkButton, Progress, R, S, SearchBox, Segmented, Txt, TypePill, Button, mono, pressFx, tick, ui } from '@/components/pokedex-ui';
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
  const { width } = useWindowDimensions();
  const columns = width >= 900 ? 5 : width >= 650 ? 4 : 2;
  const discovered = useMemo(() => discoveredIds(trainer), [trainer]);
  const types = useMemo(() => typeCounts(discovered), [discovered]);
  const [typeFilter, setTypeFilter] = useState<PokemonType | null>(null);
  // A type disappears from the readout if its last card is deleted; stop filtering by it too.
  const activeType = types.some(t => t.type === typeFilter) ? typeFilter : null;
  const visible = useMemo(() => species.filter(s => (filter !== 'Discovered' || discovered.has(s.id)) && (filter !== 'Kanto' || s.id <= 151) && (!activeType || speciesTypes(s.id).includes(activeType)) && (!query || normalize(`${LANGUAGES.map(lang => s[lang] ?? '').join('')}${s.id}`).includes(normalize(query)))), [query, filter, discovered, activeType]);
  return <Animated.FlatList {...scroll} key={columns} data={visible} numColumns={columns} keyExtractor={s => String(s.id)} showsVerticalScrollIndicator={false} contentContainerStyle={[s.list, scroll.contentContainerStyle]} columnWrapperStyle={{ gap: S.md }} initialNumToRender={15} maxToRenderPerBatch={20}
    ListHeaderComponent={<View style={s.header}>
      <View style={ui.between}><View><Txt style={ui.title}>Your Pokédex</Txt><Txt muted>Every card starts a discovery.</Txt></View><View style={s.counter}><Txt style={s.counterNumber}>{String(discovered.size).padStart(3, '0')}</Txt><Txt muted style={{ fontSize: 12 }}>discovered</Txt></View></View>
      <View style={s.adventure}>
        <View style={s.adventureCopy}><Txt style={{ fontSize: 22, fontWeight: '900', lineHeight: 28, letterSpacing: -.5 }}>{discovered.size ? 'Who will you\ndiscover next?' : 'Your adventure\nstarts here.'}</Txt><Txt muted style={{ fontSize: 13, lineHeight: 19, marginTop: 6, maxWidth: 250 }}>{discovered.size ? 'A new card. A new story for your Pokédex.' : 'Turn the cards you love into a world to explore.'}</Txt><Button title="Scan a card" onPress={onScan} icon="scan" style={{ alignSelf: 'flex-start', marginTop: 14 }} /></View>
        <Image source={require('../../assets/crafted/device.png')} style={s.deviceArt} contentFit="contain" accessibilityLabel="Custom red Pokédex device" />
      </View>
      <QuizInvite onPlay={onQuiz} />
      <View style={s.readout}><View style={{ flex: 1 }}><View style={ui.between}><Txt style={{ fontWeight: '700', fontSize: 13 }}>Pokémon discovered</Txt><Txt style={{ fontFamily: mono, fontSize: 12 }}>{discovered.size} / {species.length.toLocaleString()}</Txt></View><View style={{ marginTop: 8 }}><Progress value={discovered.size} total={species.length} /></View></View><View style={s.readoutDivider} /><View><Txt style={{ fontSize: 23, lineHeight: 27, fontWeight: '900' }}>{totalCards(trainer)}</Txt><Txt muted style={{ fontSize: 13 }}>cards in binder</Txt></View></View>
      <CollectionValue entries={trainer.entries} compact onNeedsPrinting={onNeedsPrinting} />
      <SearchBox value={query} onChange={setQuery} placeholder="Find a Pokémon by name or number" />
      <View style={s.chipWrap}>{['All Pokémon', 'Discovered', 'Kanto'].map(label => <Chip key={label} label={label} selected={filter === label} onPress={() => setFilter(label)} />)}</View>
      {types.length > 0 && <View style={s.types}>
        <View style={ui.between}><Txt style={{ fontWeight: '700', fontSize: 13 }}>Your types</Txt><Txt muted style={{ fontSize: 13, flexShrink: 1, textAlign: 'right' }}>{activeType ? `Showing ${typeLabel(activeType)} Pokémon` : 'Tap a type to explore'}</Txt></View>
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
        <Txt numberOfLines={1} style={{ textAlign: 'center', fontWeight: '800', fontSize: 14 }}>{item.en}</Txt>
        {!owned && <Txt muted style={{ fontSize: 12, textAlign: 'center' }}>Not found yet</Txt>}
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
  const { width } = useWindowDimensions();
  const columns = width >= 900 ? 5 : width >= 650 ? 4 : 2;
  const client = usePricing(trainer.entries.map(e => e.card), 20);
  const confirmationCount = trainer.entries.filter(needsPrinting).length;
  const filtered = trainer.entries.filter(e => (!onlyNeedsPrinting || needsPrinting(e)) && matchesCardFilter(e.card, typeFilter) && (!query || query.trim().split(/\s+/).every(term => normalize(`${e.card.name} ${e.card.set.name} ${e.card.localId} ${e.card.dexIds.map(id => speciesById.get(id)?.en ?? '').join(' ')}`).includes(normalize(term)))) && (filter !== 'Favorites' || e.favorite) && (filter !== 'Doubles' || e.quantity > 1) && (filter !== 'Japanese' || e.card.language === 'ja') && (filter !== 'Korean' || e.card.language === 'ko') && (filter !== 'Chinese' || e.card.language.startsWith('zh-')));
  const entries = sortBinderEntries(filtered, sort, client.snapshots, client.fx);
  const priceSort = sort === 'priceHigh' || sort === 'priceLow';
  const sets = useMemo(() => setProgress(trainer, catalogSet), [trainer]);
  const pages = view === 'pages';
  function clearFilters() { setQuery(''); setFilter('All cards'); setTypeFilter('all'); onNeedsPrintingChange(false); }
  // Pages keep this vertical list, so the app chrome still collapses; the carousel lives in the header.
  return <Animated.FlatList {...scroll} data={pages ? [] : entries} key={columns} numColumns={columns} keyExtractor={e => e.key} columnWrapperStyle={{ gap: S.md }} contentContainerStyle={[s.list, scroll.contentContainerStyle]} showsVerticalScrollIndicator={false}
    ListHeaderComponent={<View style={s.header}>
      <View style={s.titleRow}>
        <View style={{ flex: 1, gap: S.md }}><View><Txt style={ui.title}>Your card binder</Txt><Txt muted>{totalCards(trainer)} {totalCards(trainer) === 1 ? 'card' : 'cards'} · {duplicateCards(trainer)} {duplicateCards(trainer) === 1 ? 'double' : 'doubles'}</Txt></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Wishlist, ${wishCount} ${wishCount === 1 ? 'card' : 'cards'}`} onPress={() => { tick(); onWishlist(); }} style={state => [s.wishButton, pressFx(state)]}><Icon name="star" size={19} color="#B98310" filled /><Txt style={{ color: '#664C0E', fontWeight: '800', fontSize: 15 }}>Wishlist ({wishCount})</Txt><Icon name="arrow" size={15} color="#664C0E" /></Pressable></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Add a card" onPress={() => { tick(); onScan(); }} style={({ pressed }) => [s.addButton, pressed && { opacity: .85, transform: [{ translateY: 2 }] }]}><Icon name="plus" color="white" size={26} /></Pressable>
      </View>
      <Segmented label="Binder view" options={BINDER_VIEWS} value={view} onChange={onViewChange} />
      {!pages && <CollectionValue entries={trainer.entries} onNeedsPrinting={() => { setQuery(''); setFilter('All cards'); setTypeFilter('all'); onNeedsPrintingChange(true); }} />}
      {!pages && <YourSets sets={sets} onSet={onSet} />}
      <SearchBox value={query} onChange={setQuery} placeholder="Search your cards" />
      <View style={{ gap: S.sm }}>
        <View style={s.tools}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Sort binder: ${BINDER_SORTS.find(option => option.id === sort)!.label}`} aria-expanded={sortOpen} onPress={() => { tick(); setSortOpen(open => !open); }} style={state => [s.toolButton, s.sortButton, { flex: 0 }, sortOpen && { borderColor: C.ink }, pressFx(state)]}>
            <Icon name="tools" size={18} /><Txt numberOfLines={1} style={s.toolText}>Sort</Txt><View style={{ transform: [{ rotate: sortOpen ? '90deg' : '-90deg' }] }}><Icon name="back" size={16} /></View>
          </Pressable>
          <Pressable accessibilityRole="checkbox" accessibilityLabel="Needs printing" aria-checked={onlyNeedsPrinting} onPress={() => { tick(); onNeedsPrintingChange(!onlyNeedsPrinting); }} style={state => [s.toolButton, s.needsButton, onlyNeedsPrinting && s.needsSelected, pressFx(state)]}>
            <Txt numberOfLines={1} style={[s.toolText, { flexShrink: 1, color: onlyNeedsPrinting ? '#FFF9E9' : '#786037' }]}>Needs printing{confirmationCount ? ` (${confirmationCount})` : ''}</Txt>
          </Pressable>
        </View>
        {sortOpen && <View accessibilityRole="radiogroup" accessibilityLabel="Binder sort order" style={s.sortMenu}>{BINDER_SORTS.map(option => <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={option.label} aria-checked={sort === option.id} onPress={() => { tick(); setSort(option.id); setSortOpen(false); }} style={state => [s.sortOption, sort === option.id && s.sortOptionOn, pressFx(state)]}><Txt style={{ fontSize: 15, fontWeight: sort === option.id ? '800' : '500' }}>{option.label}</Txt>{sort === option.id && <Icon name="check" size={18} />}</Pressable>)}</View>}
        {priceSort && <Txt muted style={{ fontSize: 13 }}>Uses the lower estimate in each range. Unpriced cards appear last.</Txt>}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bleed} contentContainerStyle={s.bleedContent}>{['All cards', 'Favorites', 'Doubles', 'Japanese', 'Korean', 'Chinese'].map(label => <Chip key={label} label={label} selected={label === filter} onPress={() => setFilter(label)} />)}</ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bleed} contentContainerStyle={s.bleedContent}>{CARD_FILTERS.map(f => <Chip key={f.id} label={f.id === 'all' ? 'Every type' : f.label} selected={typeFilter === f.id} onPress={() => setTypeFilter(f.id)} />)}</ScrollView>
      {(onlyNeedsPrinting || query || filter !== 'All cards' || typeFilter !== 'all') && <View style={ui.between}><Txt muted style={{ fontSize: 14, flexShrink: 1 }}>{entries.length} {entries.length === 1 ? 'card' : 'cards'}{onlyNeedsPrinting ? ' to confirm' : ' shown'}</Txt><LinkButton title="Clear filters" onPress={clearFilters} /></View>}
      {pages && entries.length > 0 && <BinderPages entries={entries} onEntry={onEntry} />}
    </View>}
    ListEmptyComponent={pages && entries.length > 0 ? null : <View style={s.empty}><Image source={require('../../assets/crafted/pokeball.png')} style={{ width: 150, height: 150 }} contentFit="contain" /><Txt style={ui.subtitle}>{onlyNeedsPrinting && !confirmationCount ? 'All printings confirmed' : trainer.entries.length ? 'No cards match these filters' : 'A home for every card'}</Txt><Txt muted style={{ textAlign: 'center', maxWidth: 280 }}>{onlyNeedsPrinting && !confirmationCount ? 'Your saved cards each have a printing selected.' : trainer.entries.length ? 'Try a different search or clear your filters.' : 'Add your English, Japanese, Korean and Chinese cards. Your favorites and extra copies will be easy to find.'}</Txt><Button title={trainer.entries.length ? 'Show all cards' : 'Add a card'} onPress={trainer.entries.length ? clearFilters : onScan} style={{ marginTop: 10 }} /></View>}
    renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.card.name}, ${item.quantity} ${item.quantity === 1 ? 'copy' : 'copies'}, ${LANGUAGE_LABELS[item.card.language]}`} onPress={() => onEntry(item)} style={({ pressed }) => [{ flex: 1 / columns, marginBottom: 20 }, pressed && { opacity: .7 }]}>
      <View>{isShiny(item.card, item.finish) ? <HoloShine><CardArt card={item.card} /></HoloShine> : <CardArt card={item.card} />}{item.quantity > 1 && <View style={s.quantity}><Txt maxFontSizeMultiplier={1} style={{ color: 'white', fontWeight: '800', fontSize: 13 }}>×{item.quantity}</Txt></View>}{item.favorite && <View style={s.favorite}><Icon name="heart" size={15} color={C.red} filled /></View>}</View>
      <Txt style={{ fontWeight: '800', fontSize: 14, marginTop: 8 }} numberOfLines={1}>{item.card.name}</Txt><Txt muted style={{ fontSize: 12 }} numberOfLines={1}>{item.card.set.name}</Txt><Txt muted numberOfLines={1} style={{ fontFamily: mono, fontSize: 12 }}>{item.card.language !== 'en' ? `${LANGUAGE_CODES[item.card.language]} · ` : ''}{collectorNumber(item.card)}</Txt>
      <CardPriceTag card={item.card} finish={item.finish} />
    </Pressable>} />;
}

/** Collection overview: the sets closest to complete, with a checklist behind each one. */
function YourSets({ sets, onSet }: { sets: SetProgress[]; onSet: (set: SetProgress) => void }) {
  const [all, setAll] = useState(false);
  if (!sets.length) return null;
  const complete = sets.filter(set => set.complete).length;
  return <View style={s.sets}>
    <View style={ui.between}><Txt accessibilityRole="header" style={{ fontWeight: '800', fontSize: 17 }}>Your sets</Txt><Txt muted style={{ fontSize: 13, flexShrink: 1, textAlign: 'right' }}>{complete ? `${complete} complete!` : 'Tap a set to see what’s missing'}</Txt></View>
    {(all ? sets : sets.slice(0, 3)).map(set => {
      const note = [set.complete && 'Set complete!', set.bonus > 0 && `+${set.bonus} bonus`].filter(Boolean).join(' · ');
      return <Pressable key={set.key} accessibilityRole="button" accessibilityLabel={`${set.name}, ${LANGUAGE_LABELS[set.language]}: ${set.owned} of ${set.official} cards${note ? `, ${note}` : ''}. Open checklist`} onPress={() => { tick(); onSet(set); }} style={state => [s.setRow, set.complete && s.setDone, pressFx(state)]}>
        <View style={ui.between}><View style={s.setName}><Txt numberOfLines={1} style={{ fontWeight: '800', fontSize: 14, flexShrink: 1 }}>{set.name}</Txt><Txt style={s.setLanguage}>{LANGUAGE_CODES[set.language]}</Txt></View><Txt style={{ fontFamily: mono, fontSize: 13, fontWeight: '700' }}>{set.owned} / {set.official}</Txt></View>
        <Progress value={set.owned} total={set.official} color={set.complete ? '#A98428' : '#679255'} />
        {!!note && <View style={ui.row}>{set.complete && <Icon name="check" size={13} color="#80611F" />}<Txt style={{ fontSize: 13, fontWeight: '700', color: set.complete ? '#80611F' : C.muted }}>{note}</Txt></View>}
      </Pressable>;
    })}
    {sets.length > 3 && <Pressable accessibilityRole="button" accessibilityLabel={all ? 'Show fewer sets' : `See all ${sets.length} sets`} aria-expanded={all} onPress={() => { tick(); setAll(value => !value); }} style={state => [s.setsToggle, pressFx(state)]}><Txt style={{ fontSize: 14, fontWeight: '700' }}>{all ? 'Show fewer sets' : `See all sets (${sets.length})`}</Txt><Icon name={all ? 'minus' : 'plus'} size={18} /></Pressable>}
  </View>;
}

const PAD = S.xl;
const s = StyleSheet.create({
  list: { padding: PAD, paddingBottom: 32 }, header: { gap: S.lg, marginBottom: S.lg },
  // Chip rows scroll edge to edge instead of stopping short at the screen padding.
  bleed: { marginHorizontal: -PAD }, bleedContent: { gap: S.sm, paddingHorizontal: PAD },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  counter: { alignItems: 'center', backgroundColor: '#DCE6CD', borderRadius: 11, paddingHorizontal: 12, paddingVertical: 8 },
  counterNumber: { fontFamily: mono, fontSize: 24, lineHeight: 29, fontWeight: '700' },
  adventure: { backgroundColor: '#E0E9D1', borderRadius: 19, minHeight: 219, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', padding: 18, borderWidth: 1, borderColor: '#CCD9BA' },
  adventureCopy: { flex: 1, paddingRight: 8, zIndex: 1 },
  // The device bleeds past the card padding so it reads as sitting on the edge.
  deviceArt: { width: '44%', height: 224, marginLeft: -25, marginRight: -26, marginVertical: -18, transform: [{ rotate: '8deg' }] },
  readout: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingVertical: 4 }, readoutDivider: { width: 1, height: 38, backgroundColor: '#C5D2B7' },
  // 2px gaps keep neighbouring type colors distinct in the stacked bar.
  types: { gap: 8 }, typeBar: { flexDirection: 'row', gap: 2, height: 10, borderRadius: 5, overflow: 'hidden' },
  pokemon: { backgroundColor: '#E6EDDB', borderRadius: 14, padding: 11, marginBottom: S.md, borderWidth: 1, borderColor: '#D8E1CD', overflow: 'hidden' },
  pokemonOwned: { backgroundColor: '#FCFDF9', borderColor: '#ADC79F' }, dexNumber: { fontFamily: mono, fontSize: 11, lineHeight: 18, color: '#7B8D73' },
  sprite: { width: '100%', height: 108, marginVertical: 4 }, ownedDot: { backgroundColor: '#679255', borderRadius: 10, padding: 3 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 38, gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: S.md },
  wishButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 14, borderRadius: R.md, backgroundColor: '#F7ECC8', borderWidth: 1, borderColor: '#E0C676' },
  addButton: { width: 50, height: 50, borderRadius: 14, backgroundColor: C.red, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 3, borderBottomColor: C.redDark },
  tools: { flexDirection: 'row', gap: S.sm, alignItems: 'center' },
  toolButton: { flex: 1, justifyContent: 'center', minHeight: 48, borderRadius: R.md, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: S.sm },
  toolText: { fontSize: 14, fontWeight: '700' },
  sortButton: { borderColor: '#C0CDB3', backgroundColor: '#F5F8EE' },
  needsButton: { borderColor: '#D5C6A7', backgroundColor: '#F2ECD9' },
  needsSelected: { backgroundColor: '#786037', borderColor: '#786037' },
  sortMenu: { borderRadius: R.md, padding: S.xs, gap: 2, backgroundColor: '#FAFCF6', borderWidth: 1, borderColor: '#C0CDB3' },
  sortOption: { minHeight: 48, paddingHorizontal: S.md, borderRadius: R.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sortOptionOn: { backgroundColor: '#E9EFE0' },
  quantity: { position: 'absolute', bottom: 8, right: 8, backgroundColor: C.ink, paddingHorizontal: 9, borderRadius: 7 },
  favorite: { position: 'absolute', top: 7, right: 7, backgroundColor: 'white', borderRadius: 20, padding: 6 },
  sets: { gap: 8, padding: 12, paddingBottom: 6, borderRadius: 16, backgroundColor: '#F5F8EE', borderWidth: 1, borderColor: C.line },
  setRow: { minHeight: 52, gap: 6, paddingVertical: 9, paddingHorizontal: 11, borderRadius: 11, backgroundColor: '#FCFDF9', borderWidth: 1, borderColor: '#DCE4D2', justifyContent: 'center' },
  setDone: { backgroundColor: '#F7ECCC', borderColor: '#DBC786' },
  setName: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  setLanguage: { fontFamily: mono, fontSize: 11, lineHeight: 16, paddingHorizontal: 5, borderRadius: 5, overflow: 'hidden', backgroundColor: '#DCE6D0', color: C.muted },
  setsToggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
});
