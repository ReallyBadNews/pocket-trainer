import Animated from 'react-native-reanimated';
import { useChromeScroll } from '@/components/scroll-chrome';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { C, CardArt, Chip, Icon, Progress, SearchBox, Txt, TypePill, Button, mono, ui } from '@/components/pokedex-ui';
import { useCollection } from '@/lib/collection-context';
import { species, speciesById, speciesImage, normalize } from '@/lib/catalog';
import { CARD_FILTERS, matchesCardFilter, cardKindLabel, type CardFilter } from '@/lib/card-kind';
import { LANGUAGES, LANGUAGE_CODES, LANGUAGE_LABELS } from '@/lib/languages';
import { collectorNumber, discoveredIds, duplicateCards, totalCards, type Entry } from '@/lib/model';
import { CardPriceTag, CollectionValue } from '@/components/card-values';
import { HoloShine } from '@/components/celebration';
import { isShiny } from '@/lib/shine';
import { BINDER_SORTS, needsPrinting, sortBinderEntries, type BinderSort } from '@/lib/binder-order';
import { usePricing } from '@/lib/use-pricing';
import { speciesTypes, typeCounts, typeLabel, TYPE_COLORS, type PokemonType } from '@/lib/species-details';

export function DexScreen({ onScan, onSpecies, onNeedsPrinting }: { onScan: () => void; onSpecies: (id: number) => void; onNeedsPrinting: () => void }) {
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
  return <Animated.FlatList {...scroll} key={columns} data={visible} numColumns={columns} keyExtractor={s => String(s.id)} showsVerticalScrollIndicator={false} contentContainerStyle={[s.list, scroll.contentContainerStyle]} columnWrapperStyle={{ gap: 10 }} initialNumToRender={15} maxToRenderPerBatch={20}
    ListHeaderComponent={<View style={s.header}>
      <View style={ui.between}><View><Txt style={ui.title}>Your Pokédex</Txt><Txt muted>Every card starts a discovery.</Txt></View><View style={s.counter}><Txt style={s.counterNumber}>{String(discovered.size).padStart(3, '0')}</Txt><Txt muted style={{ fontSize: 10, lineHeight: 16 }}>discovered</Txt></View></View>
      <View style={s.adventure}>
        <View style={s.adventureCopy}><Txt style={{ fontSize: 22, fontWeight: '900', lineHeight: 28, letterSpacing: -.5 }}>{discovered.size ? 'Who will you\ndiscover next?' : 'Your adventure\nstarts here.'}</Txt><Txt muted style={{ fontSize: 13, lineHeight: 19, marginTop: 7, maxWidth: 250 }}>{discovered.size ? 'A new card. A new story for your Pokédex.' : 'Turn the cards you love into a world to explore.'}</Txt><Button title={discovered.size ? 'Scan a card' : 'Add your first card'} onPress={onScan} icon="scan" style={{ alignSelf: 'flex-start', marginTop: 16, paddingHorizontal: 13 }} /></View>
        <Image source={require('../../assets/crafted/device.png')} style={s.deviceArt} contentFit="contain" accessibilityLabel="Custom red Pokédex device" />
      </View>
      <View style={s.readout}><View style={{ flex: 1 }}><View style={ui.between}><Txt style={{ fontWeight: '700', fontSize: 13 }}>Pokémon discovered</Txt><Txt style={{ fontFamily: mono, fontSize: 12 }}>{discovered.size} / {species.length.toLocaleString()}</Txt></View><View style={{ marginTop: 8 }}><Progress value={discovered.size} total={species.length} /></View></View><View style={s.readoutDivider} /><View><Txt style={{ fontSize: 23, lineHeight: 27, fontWeight: '900' }}>{totalCards(trainer)}</Txt><Txt muted style={{ fontSize: 11 }}>cards in binder</Txt></View></View>
      <CollectionValue entries={trainer.entries} compact onNeedsPrinting={onNeedsPrinting} />
      <SearchBox value={query} onChange={setQuery} placeholder="Find a Pokémon by name or number" />
      <View style={ui.row}>{['All Pokémon', 'Discovered', 'Kanto'].map(label => <Chip key={label} label={label} selected={filter === label} onPress={() => setFilter(label)} />)}</View>
      {types.length > 0 && <View style={s.types}>
        <View style={ui.between}><Txt style={{ fontWeight: '700', fontSize: 13 }}>Your types</Txt><Txt muted style={{ fontSize: 11, lineHeight: 16 }}>{activeType ? `Showing ${typeLabel(activeType)} Pokémon` : 'Tap a type to explore'}</Txt></View>
        <View style={s.typeBar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{types.map(t => <View key={t.type} style={{ flex: t.count, backgroundColor: TYPE_COLORS[t.type], opacity: activeType && activeType !== t.type ? .3 : 1 }} />)}</View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{types.map(t => <TypePill key={t.type} type={t.type} count={t.count} selected={activeType === t.type} onPress={() => setTypeFilter(activeType === t.type ? null : t.type)} />)}</ScrollView>
      </View>}
    </View>}
    ListEmptyComponent={<View style={s.empty}><Txt style={ui.subtitle}>{query || activeType ? 'No Pokémon found' : 'Your first discovery is waiting'}</Txt><Txt muted style={{ textAlign: 'center' }}>{query ? 'Try an English, Japanese, Korean or Chinese name, or a Pokédex number.' : activeType ? `No ${typeLabel(activeType)} Pokémon here. Try another type or filter.` : 'Add a Pokémon card to bring its entry to life.'}</Txt></View>}
    renderItem={({ item }) => {
      const owned = discovered.has(item.id);
      return <Pressable accessibilityRole="button" accessibilityLabel={`${item.en}, number ${item.id}, ${owned ? 'discovered' : 'not yet discovered'}`} onPress={() => onSpecies(item.id)} style={({ pressed }) => [s.pokemon, { flex: 1 / columns }, owned && s.pokemonOwned, pressed && { opacity: .7 }]}>
        <View style={ui.between}><Txt style={s.dexNumber}>#{String(item.id).padStart(3, '0')}</Txt>{owned ? <View style={s.ownedDot}><Icon name="check" size={11} color="#fff" /></View> : <Icon name="lock" color="#A7B59C" size={13} />}</View>
        <Image source={speciesImage(item.id)} style={[s.sprite, !owned && { opacity: .25 }]} tintColor={owned ? undefined : '#526B50'} contentFit="contain" cachePolicy="memory-disk" />
        <Txt numberOfLines={1} style={{ textAlign: 'center', fontWeight: '800', fontSize: 14 }}>{item.en}</Txt>
        <Txt muted style={{ fontSize: 10, textAlign: 'center', lineHeight: 17 }}>{owned ? 'Discovered!' : 'Waiting to be discovered'}</Txt>
      </Pressable>;
    }} />;
}

export function BinderScreen({ onScan, onEntry, onlyNeedsPrinting, onNeedsPrintingChange }: {
  onScan: () => void; onEntry: (entry: Entry) => void; onlyNeedsPrinting: boolean; onNeedsPrintingChange: (value: boolean) => void;
}) {
  const scroll = useChromeScroll();
  const { trainer } = useCollection();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All cards');
  const [typeFilter, setTypeFilter] = useState<CardFilter>('all');
  const [sort, setSort] = useState<BinderSort>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const { width } = useWindowDimensions();
  const columns = width >= 900 ? 5 : width >= 650 ? 4 : 2;
  const client = usePricing(trainer.entries.map(e => e.card), 20);
  const confirmationCount = trainer.entries.filter(needsPrinting).length;
  const filtered = trainer.entries.filter(e => (!onlyNeedsPrinting || needsPrinting(e)) && matchesCardFilter(e.card, typeFilter) && (!query || query.trim().split(/\s+/).every(term => normalize(`${e.card.name} ${e.card.set.name} ${e.card.localId} ${e.card.dexIds.map(id => speciesById.get(id)?.en ?? '').join(' ')}`).includes(normalize(term)))) && (filter !== 'Favorites' || e.favorite) && (filter !== 'Duplicates' || e.quantity > 1) && (filter !== 'Japanese' || e.card.language === 'ja') && (filter !== 'Korean' || e.card.language === 'ko') && (filter !== 'Chinese' || e.card.language.startsWith('zh-')));
  const entries = sortBinderEntries(filtered, sort, client.snapshots, client.fx);
  const priceSort = sort === 'priceHigh' || sort === 'priceLow';
  function clearFilters() { setQuery(''); setFilter('All cards'); setTypeFilter('all'); onNeedsPrintingChange(false); }
  return <Animated.FlatList {...scroll} data={entries} key={columns} numColumns={columns} keyExtractor={e => e.key} columnWrapperStyle={{ gap: 14 }} contentContainerStyle={[s.list, scroll.contentContainerStyle]} showsVerticalScrollIndicator={false}
    ListHeaderComponent={<View style={s.header}>
      <View style={ui.between}><View><Txt style={ui.title}>Your card binder</Txt><Txt muted>{totalCards(trainer)} cards · {trainer.entries.length} printings · {duplicateCards(trainer)} {duplicateCards(trainer) === 1 ? 'extra' : 'extras'}</Txt></View><Pressable accessibilityRole="button" accessibilityLabel="Add a card" onPress={onScan} style={s.addButton}><Icon name="plus" color="white" /></Pressable></View>
      <CollectionValue entries={trainer.entries} onNeedsPrinting={() => { setQuery(''); setFilter('All cards'); setTypeFilter('all'); onNeedsPrintingChange(true); }} />
      <SearchBox value={query} onChange={setQuery} placeholder="Search your cards" />
      <View style={{ gap: 8 }}>
        <View style={s.tools}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Sort binder: ${BINDER_SORTS.find(option => option.id === sort)!.label}`} aria-expanded={sortOpen} onPress={() => setSortOpen(open => !open)} style={[s.sortButton, sortOpen && { borderColor: C.ink }]}>
            <Txt style={{ fontSize: 12, fontWeight: '600' }}>Sort: {BINDER_SORTS.find(option => option.id === sort)!.label}</Txt><View style={{ transform: [{ rotate: sortOpen ? '90deg' : '-90deg' }] }}><Icon name="back" size={14} /></View>
          </Pressable>
          <Pressable accessibilityRole="checkbox" accessibilityLabel="Needs printing" aria-checked={onlyNeedsPrinting} onPress={() => onNeedsPrintingChange(!onlyNeedsPrinting)} style={[s.needsButton, onlyNeedsPrinting && s.needsSelected]}>
            <Txt style={{ fontSize: 12, fontWeight: '600', color: onlyNeedsPrinting ? '#FFF9E9' : '#786037' }}>Needs printing{confirmationCount ? ` (${confirmationCount})` : ''}</Txt>
          </Pressable>
        </View>
        {sortOpen && <View accessibilityRole="radiogroup" accessibilityLabel="Binder sort order" style={s.sortMenu}>{BINDER_SORTS.map(option => <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={option.label} aria-checked={sort === option.id} onPress={() => { setSort(option.id); setSortOpen(false); }} style={s.sortOption}><Txt style={{ fontSize: 13, fontWeight: sort === option.id ? '600' : '400' }}>{option.label}</Txt>{sort === option.id && <Icon name="check" size={17} />}</Pressable>)}</View>}
        {priceSort && <Txt muted style={{ fontSize: 11, lineHeight: 17 }}>Uses the lower estimate in each range. Unpriced cards appear last.</Txt>}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{['All cards', 'Favorites', 'Duplicates', 'Japanese', 'Korean', 'Chinese'].map(label => <Chip key={label} label={label} selected={label === filter} onPress={() => setFilter(label)} />)}</ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{CARD_FILTERS.map(f => <Chip key={f.id} label={f.id === 'all' ? 'Every type' : f.label} selected={typeFilter === f.id} onPress={() => setTypeFilter(f.id)} />)}</ScrollView>
      {(onlyNeedsPrinting || query || filter !== 'All cards' || typeFilter !== 'all') && <View style={ui.between}><Txt muted style={{ fontSize: 12 }}>{entries.length} {entries.length === 1 ? 'printing' : 'printings'}{onlyNeedsPrinting ? ' to confirm' : ' shown'}</Txt><Pressable accessibilityRole="button" accessibilityLabel="Clear binder filters" onPress={clearFilters} style={{ minHeight: 40, justifyContent: 'center' }}><Txt style={{ fontSize: 12, textDecorationLine: 'underline' }}>Clear filters</Txt></Pressable></View>}
    </View>}
    ListEmptyComponent={<View style={s.empty}><Image source={require('../../assets/crafted/pokeball.png')} style={{ width: 150, height: 150 }} contentFit="contain" /><Txt style={ui.subtitle}>{onlyNeedsPrinting && !confirmationCount ? 'All printings confirmed' : trainer.entries.length ? 'No cards match these filters' : 'A home for every card'}</Txt><Txt muted style={{ textAlign: 'center', maxWidth: 280 }}>{onlyNeedsPrinting && !confirmationCount ? 'Your saved cards each have a printing selected.' : trainer.entries.length ? 'Try a different search or clear your filters.' : 'Add your English, Japanese, Korean and Chinese cards. Your favorites and extra copies will be easy to find.'}</Txt><Button title={trainer.entries.length ? 'Show all cards' : 'Add a card'} onPress={trainer.entries.length ? clearFilters : onScan} style={{ marginTop: 10 }} /></View>}
    renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.card.name}, ${item.quantity} ${item.quantity === 1 ? 'copy' : 'copies'}, ${LANGUAGE_LABELS[item.card.language]}`} onPress={() => onEntry(item)} style={({ pressed }) => [{ flex: 1 / columns, marginBottom: 20 }, pressed && { opacity: .7 }]}>
      <View>{isShiny(item.card, item.finish) ? <HoloShine><CardArt card={item.card} /></HoloShine> : <CardArt card={item.card} />}<View style={s.quantity}><Txt style={{ color: 'white', fontWeight: '800', fontSize: 12 }}>×{item.quantity}</Txt></View>{item.favorite && <View style={s.favorite}><Icon name="heart" size={15} color={C.red} filled /></View>}</View>
      <Txt style={{ fontWeight: '800', fontSize: 14, marginTop: 8 }} numberOfLines={1}>{item.card.name}</Txt><Txt muted style={{ fontSize: 11, lineHeight: 17 }} numberOfLines={1}>{item.card.set.name}</Txt><Txt muted style={{ fontSize: 10, lineHeight: 16 }}>{cardKindLabel(item.card)}</Txt><Txt muted style={{ fontFamily: mono, fontSize: 10 }}>{LANGUAGE_CODES[item.card.language]} · {collectorNumber(item.card)}</Txt>
      <CardPriceTag card={item.card} finish={item.finish} />
    </Pressable>} />;
}

const s = StyleSheet.create({
  list: { padding: 20, paddingBottom: 32 }, header: { gap: 17, marginBottom: 18 },
  counter: { alignItems: 'center', backgroundColor: '#DCE6CD', borderRadius: 11, paddingHorizontal: 12, paddingVertical: 8 },
  counterNumber: { fontFamily: mono, fontSize: 24, lineHeight: 29, fontWeight: '700' },
  adventure: { backgroundColor: '#E0E9D1', borderRadius: 19, minHeight: 219, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#CCD9BA' },
  adventureCopy: { flex: 1, paddingVertical: 20, paddingLeft: 18, zIndex: 1 },
  deviceArt: { width: '44%', height: 224, marginLeft: -25, marginRight: -8, transform: [{ rotate: '8deg' }] },
  readout: { flexDirection: 'row', alignItems: 'center', gap: 18, paddingVertical: 4 }, readoutDivider: { width: 1, height: 38, backgroundColor: '#C5D2B7' },
  // 2px gaps keep neighbouring type colors distinct in the stacked bar.
  types: { gap: 8 }, typeBar: { flexDirection: 'row', gap: 2, height: 10, borderRadius: 5, overflow: 'hidden' },
  pokemon: { backgroundColor: '#E6EDDB', borderRadius: 14, padding: 11, marginBottom: 10, borderWidth: 1, borderColor: '#D8E1CD', overflow: 'hidden' },
  pokemonOwned: { backgroundColor: '#FCFDF9', borderColor: '#ADC79F' }, dexNumber: { fontFamily: mono, fontSize: 11, lineHeight: 18, color: '#7B8D73' },
  sprite: { width: '100%', height: 108, marginVertical: 4 }, ownedDot: { backgroundColor: '#679255', borderRadius: 10, padding: 3 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 38, gap: 12 },
  addButton: { width: 46, height: 46, borderRadius: 14, backgroundColor: C.red, justifyContent: 'center', alignItems: 'center' },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  sortButton: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: '#C0CDB3', borderRadius: 10, paddingHorizontal: 11, minHeight: 42, backgroundColor: '#F5F8EE' },
  needsButton: { borderWidth: 1, borderColor: '#D5C6A7', borderRadius: 10, paddingHorizontal: 11, minHeight: 42, justifyContent: 'center', backgroundColor: '#F2ECD9' },
  needsSelected: { backgroundColor: '#786037', borderColor: '#786037' },
  sortMenu: { borderRadius: 12, padding: 5, backgroundColor: '#FAFCF6', borderWidth: 1, borderColor: '#C0CDB3' },
  sortOption: { minHeight: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quantity: { position: 'absolute', bottom: 8, right: 8, backgroundColor: C.ink, paddingHorizontal: 9, borderRadius: 7 },
  favorite: { position: 'absolute', top: 7, right: 7, backgroundColor: 'white', borderRadius: 20, padding: 6 },
});
