import Animated from 'react-native-reanimated';
import { useChromeScroll } from '@/components/scroll-chrome';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { C, CardArt, CardCaption, ChoiceMenu, Icon, IconButton, S, SearchBox, ToolbarAction, Txt, Button, mono, ui } from '@/components/pokedex-ui';
import { useCollection } from '@/lib/collection-context';
import { catalogSet, species, speciesImage, normalize } from '@/lib/catalog';
import { LANGUAGES, LANGUAGE_CODES, LANGUAGE_LABELS } from '@/lib/languages';
import { collectorNumber, discoveredIds, duplicateCards, FINISH_LABELS, totalCards } from '@/lib/model';
import { CardPriceTag, CollectionValue } from '@/components/card-values';
import { HoloShine } from '@/components/celebration';
import { isShiny } from '@/lib/shine';
import { BINDER_SORTS, needsPrinting, sortBinderEntries } from '@/lib/binder-order';
import { usePricing } from '@/lib/use-pricing';
import { speciesTypes, typeCounts, typeLabel, type PokemonType } from '@/lib/species-details';
import { QuizInvite } from './quiz-screen';
import { setProgress } from '@/lib/set-progress';
import { BINDER_VIEWS, BinderPages } from '@/components/binder-pages';
import { wishesOf } from '@/lib/wishlist';
import { DEFAULT_BINDER_BROWSE, DEFAULT_DEX_BROWSE, useBinderBrowse, useBinderView, useDexBrowse, type DexShow } from '@/lib/browse-state';
import { activeBinderFilters, matchesBinderFilters, matchesBinderQuery, REGIONS } from '@/lib/collection-filters';
import { usePokedexNav } from '@/lib/pokedex-nav';

const DEX_SHOWS: { id: DexShow; label: string }[] = [{ id: 'all', label: 'All Pokémon' }, { id: 'discovered', label: 'Discovered' }, ...REGIONS.map(region => ({ id: region.id, label: region.name }))];

export function DexScreen() {
  const scroll = useChromeScroll();
  const { trainer } = useCollection();
  const nav = usePokedexNav();
  const [browse, setBrowse] = useDexBrowse();
  const { query, show } = browse;
  const { width, fontScale } = useWindowDimensions();
  const [listWidth, setListWidth] = useState(0);
  const contentWidth = (listWidth || Math.min(width, 1100)) - S.xl * 2;
  const gridWidth = contentWidth / Math.min(fontScale, 1.4);
  const columns = gridWidth >= 850 ? 5 : gridWidth >= 600 ? 4 : gridWidth >= 450 ? 3 : 2;
  const discovered = useMemo(() => discoveredIds(trainer), [trainer]);
  const types = useMemo(() => typeCounts(discovered), [discovered]);
  // A type disappears from the readout if its last card is deleted; stop filtering by it too.
  const activeType = types.some(t => t.type === browse.type) ? browse.type : null;
  const region = REGIONS.find(r => r.id === show);
  const visible = useMemo(() => species.filter(s => (show !== 'discovered' || discovered.has(s.id)) && (!region || (s.id >= region.first && s.id <= region.last)) && (!activeType || speciesTypes(s.id).includes(activeType)) && (!query || normalize(`${LANGUAGES.map(lang => s[lang] ?? '').join('')}${s.id}`).includes(normalize(query)))), [query, show, region, discovered, activeType]);
  return <Animated.FlatList {...scroll} onLayout={event => setListWidth(event.nativeEvent.layout.width)} key={columns} data={visible} numColumns={columns} keyExtractor={s => String(s.id)} showsVerticalScrollIndicator={false} contentContainerStyle={[s.list, scroll.contentContainerStyle]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" columnWrapperStyle={{ gap: S.md }} initialNumToRender={15} maxToRenderPerBatch={20}
    ListHeaderComponent={<View style={s.header}>
      <View><Txt accessibilityRole="header" variant="title">Your Pokédex</Txt><View style={s.summaryRow}><Txt muted variant="caption" style={s.summaryCopy}>{discovered.size} discovered</Txt><QuizInvite onPlay={nav.openQuiz} /><ToolbarAction title="Overview" onPress={() => router.push('/discoveries')} /></View></View>
      {trainer.entries.length > 0 && <CollectionValue entries={trainer.entries} onPress={() => router.push('/collection-value')} />}
      <SearchBox value={query} onChange={value => setBrowse({ query: value })} placeholder="Find a Pokémon by name or number" />
      <View style={s.toolbar}>
        <ChoiceMenu<DexShow> compact label="Show Pokémon" options={DEX_SHOWS} value={show} onChange={value => setBrowse({ show: value })} style={s.menu} />
        {types.length > 0 && <ChoiceMenu<PokemonType | 'all'> compact label="Pokémon type" options={[{ id: 'all', label: 'Every type' }, ...types.map(t => ({ id: t.type, label: `${typeLabel(t.type)} (${t.count})` }))]} value={activeType ?? 'all'} onChange={value => setBrowse({ type: value === 'all' ? null : value })} style={s.menu} />}
      </View>
      {!discovered.size && show !== 'discovered' && !query && !activeType && <View style={s.section}>
        <Txt accessibilityRole="header" variant="subtitle">Your first discovery is waiting</Txt><Txt muted variant="caption">Add a Pokémon card to bring its entry to life.</Txt><Button size="medium" title="Scan a card" icon="scan" onPress={() => nav.openScan()} style={{ alignSelf: 'flex-start' }} />
      </View>}
      {(query || activeType || show !== 'all') && <View style={s.sectionHeading}><Txt muted variant="caption">{visible.length} Pokémon shown</Txt><ToolbarAction title="Clear" onPress={() => setBrowse(() => DEFAULT_DEX_BROWSE)} /></View>}
    </View>}
    ListEmptyComponent={<View style={s.empty}>{!discovered.size && !query && <Image source={require('../../assets/crafted/pokeball.png')} style={{ width: 104, height: 104 }} contentFit="contain" />}<Txt style={ui.subtitle}>{query || activeType ? 'No Pokémon found' : 'Your first discovery is waiting'}</Txt><Txt muted style={{ textAlign: 'center', maxWidth: 280 }}>{query ? 'Try another name, or a number like 25.' : activeType ? `No ${typeLabel(activeType)} Pokémon here. Try another type or filter.` : 'Add a Pokémon card to bring its entry to life.'}</Txt>{!discovered.size && !query && <Button title="Scan a card" icon="scan" onPress={() => nav.openScan()} style={{ marginTop: 10 }} />}</View>}
    renderItem={({ item }) => {
      const owned = discovered.has(item.id);
      return <Pressable accessibilityRole="button" accessibilityLabel={`${item.en}, number ${item.id}, ${owned ? 'discovered' : 'not yet discovered'}`} onPress={() => nav.openSpecies(item.id)} style={({ pressed }) => [s.pokemon, { flex: 1 / columns }, pressed && { opacity: .7 }]}>
        <View style={ui.between}><Txt style={s.dexNumber}>#{String(item.id).padStart(3, '0')}</Txt>{owned ? <View style={s.ownedDot}><Icon name="check" size={11} color="#fff" /></View> : <Icon name="lock" color="#A7B59C" size={13} />}</View>
        <Image source={speciesImage(item.id)} style={[s.sprite, !owned && { opacity: .25 }]} tintColor={owned ? undefined : '#526B50'} contentFit="contain" cachePolicy="memory-disk" />
        <Txt variant="cardTitle" style={{ textAlign: 'center' }}>{item.en}</Txt>
      </Pressable>;
    }} />;
}

export function BinderScreen() {
  const scroll = useChromeScroll();
  const { trainer } = useCollection();
  const nav = usePokedexNav();
  const [browse, setBrowse] = useBinderBrowse();
  const [view, setView] = useBinderView();
  const { query, sort } = browse;
  const wishCount = wishesOf(trainer).length;
  const { width, fontScale } = useWindowDimensions();
  const [listWidth, setListWidth] = useState(0);
  const contentWidth = (listWidth || Math.min(width, 1100)) - S.xl * 2;
  const gridWidth = contentWidth / Math.min(fontScale, 1.4);
  const columns = gridWidth >= 850 ? 5 : gridWidth >= 600 ? 4 : gridWidth >= 450 ? 3 : 2;
  const client = usePricing(trainer.entries.map(e => e.card), 20);
  const confirmationCount = trainer.entries.filter(needsPrinting).length;
  const filtered = trainer.entries.filter(e => matchesBinderFilters(e, browse) && matchesBinderQuery(e, query));
  const entries = sortBinderEntries(filtered, sort, client.snapshots, client.fx);
  const priceSort = sort === 'priceHigh' || sort === 'priceLow';
  const hasSets = useMemo(() => setProgress(trainer, catalogSet).length > 0, [trainer]);
  const pages = view === 'pages';
  const activeFilters = activeBinderFilters(browse);
  const clearFilters = () => setBrowse({ ...DEFAULT_BINDER_BROWSE, sort });
  // Pages keep this vertical list, so the app chrome still collapses; the carousel lives in the header.
  return <Animated.FlatList {...scroll} onLayout={event => setListWidth(event.nativeEvent.layout.width)} data={pages ? [] : entries} key={columns} numColumns={columns} keyExtractor={e => e.key} columnWrapperStyle={{ gap: S.md }} contentContainerStyle={[s.list, scroll.contentContainerStyle]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
    ListHeaderComponent={<View style={s.header}>
      <View><View style={s.collectionTitle}><Txt accessibilityRole="header" variant="title" style={{ flex: 1 }}>Binder</Txt><IconButton icon="plus" label="Add card" color={C.redDark} onPress={() => nav.openScan()} /><IconButton icon="star" label={`Wishlist (${wishCount})`} onPress={nav.openWishlist} /></View><Txt muted variant="caption">{totalCards(trainer)} {totalCards(trainer) === 1 ? 'card' : 'cards'}{duplicateCards(trainer) ? ` · ${duplicateCards(trainer)} ${duplicateCards(trainer) === 1 ? 'double' : 'doubles'}` : ''}</Txt></View>
      {trainer.entries.length > 0 && <CollectionValue entries={trainer.entries} onPress={() => router.push('/collection-value')} />}
      <SearchBox value={query} onChange={value => setBrowse({ query: value })} placeholder="Search your cards" />
      <View style={s.toolbar}>
        <ChoiceMenu compact triggerTitle="View" label="Binder view" options={BINDER_VIEWS} value={view} onChange={setView} style={[s.tool, { flexBasis: 74 * Math.min(fontScale, 1.4) }]} />
        <ChoiceMenu compact triggerTitle="Sort" label="Sort cards" options={BINDER_SORTS} value={sort} onChange={value => setBrowse({ sort: value })} style={[s.tool, { flexBasis: 74 * Math.min(fontScale, 1.4) }]} />
        <ToolbarAction title={activeFilters ? `Filter (${activeFilters})` : 'Filter'} onPress={() => router.push('/binder-filters')} style={[s.tool, { flexBasis: (activeFilters ? 96 : 74) * Math.min(fontScale, 1.4) }]} />
        {hasSets && <ToolbarAction title="Sets" onPress={() => router.push('/sets')} style={[s.tool, { flexBasis: 74 * Math.min(fontScale, 1.4) }]} />}
      </View>
      {priceSort && <Txt muted variant="caption">Uses the lower estimate in each range. Unpriced cards appear last.</Txt>}
      {(activeFilters > 0 || query) && <View style={s.sectionHeading}><Txt muted variant="caption" style={{ flexShrink: 1 }}>{entries.length} {entries.length === 1 ? 'card' : 'cards'}{browse.needsPrinting ? ' to confirm' : ' shown'}</Txt><ToolbarAction title="Clear filters" onPress={clearFilters} /></View>}
      {pages && entries.length > 0 && <BinderPages entries={entries} onEntry={nav.openEntry} />}
    </View>}
    ListEmptyComponent={pages && entries.length > 0 ? null : <View style={s.empty}><Image source={require('../../assets/crafted/pokeball.png')} style={{ width: 150, height: 150 }} contentFit="contain" /><Txt style={ui.subtitle}>{browse.needsPrinting && !confirmationCount ? 'All printings confirmed' : trainer.entries.length ? 'No cards match these filters' : 'A home for every card'}</Txt><Txt muted style={{ textAlign: 'center', maxWidth: 280 }}>{browse.needsPrinting && !confirmationCount ? 'Your saved cards each have a printing selected.' : trainer.entries.length ? 'Try a different search or clear your filters.' : 'Add your English, Japanese, Korean and Chinese cards. Your favorites and extra copies will be easy to find.'}</Txt><Button title={trainer.entries.length ? 'Show all cards' : 'Add a card'} onPress={trainer.entries.length ? clearFilters : () => nav.openScan()} style={{ marginTop: 10 }} /></View>}
    renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.card.name}, ${item.card.set.name}, ${collectorNumber(item.card)}, ${LANGUAGE_LABELS[item.card.language]}, ${FINISH_LABELS[item.finish]}, ${item.quantity} ${item.quantity === 1 ? 'copy' : 'copies'}${item.favorite ? ', favorite' : ''}`} onPress={() => nav.openEntry(item)} style={({ pressed }) => [{ flex: 1 / columns, marginBottom: 20 }, pressed && { opacity: .7 }]}>
      <View>{isShiny(item.card, item.finish) ? <HoloShine><CardArt card={item.card} /></HoloShine> : <CardArt card={item.card} />}{item.quantity > 1 && <View style={s.quantity}><Txt maxFontSizeMultiplier={1} style={{ color: 'white', fontWeight: '800', fontSize: 13 }}>×{item.quantity}</Txt></View>}{item.favorite && <View style={s.favorite}><Icon name="heart" size={15} color={C.red} filled /></View>}</View>
      <CardCaption name={item.card.name} setName={item.card.set.name} detail={`${item.card.language !== 'en' ? `${LANGUAGE_CODES[item.card.language]} · ` : ''}${collectorNumber(item.card)}`} />
      <CardPriceTag card={item.card} finish={item.finish} />
    </Pressable>} />;
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
  section: { gap: S.sm },
  pokemon: { paddingVertical: S.sm, paddingHorizontal: S.xs, marginBottom: S.md },
  dexNumber: { fontFamily: mono, fontSize: 12, lineHeight: 18, color: C.muted },
  sprite: { width: '100%', height: 108, marginVertical: S.xs }, ownedDot: { backgroundColor: '#679255', borderRadius: 10, padding: 3 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 38, gap: 12 },
  quantity: { position: 'absolute', bottom: 8, right: 8, backgroundColor: C.ink, paddingHorizontal: 9, borderRadius: 7 },
  favorite: { position: 'absolute', top: 7, right: 7, backgroundColor: 'white', borderRadius: 20, padding: 6 },
});
