import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Page, PageFrame, goBack } from '@/components/page';
import { Button, C, CardArt, Icon, Progress, S, Segmented, Txt, mono, ui } from '@/components/pokedex-ui';
import { catalogSet } from '@/lib/catalog';
import { useCollection } from '@/lib/collection-context';
import { routeSet } from '@/lib/collection-filters';
import { LANGUAGES, LANGUAGE_LABELS, type Language } from '@/lib/languages';
import { usePokedexNav } from '@/lib/pokedex-nav';
import { setChecklist, type SetProgress, type SetSlot } from '@/lib/set-progress';
import englishSets from '@/data/sets-en.json';
import japaneseSets from '@/data/sets-ja.json';
import koreanSets from '@/data/sets-ko.json';
import simplifiedSets from '@/data/sets-zh-cn.json';
import traditionalSets from '@/data/sets-zh-tw.json';

type Filter = 'all' | 'missing' | 'owned';
// Same words as a badge's Pokémon checklist; the counts sit in the caption so each segment stays one short line.
const FILTERS: { id: Filter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'missing', label: 'To find' }, { id: 'owned', label: 'Collected' }];
type Row = { key: string; bonus?: true; slots: SetSlot[] };

// Web export pre-renders a checklist for every catalog set that has a size to finish (open-ended promo runs don't).
const CATALOG_SETS: Record<Language, readonly { id: string; cardCount: { official: number } }[]> = { en: englishSets, ja: japaneseSets, ko: koreanSets, 'zh-cn': simplifiedSets, 'zh-tw': traditionalSets };
export function generateStaticParams() {
  // The catalog can list a set twice (zh-cn CSV1C); one page each.
  return LANGUAGES.flatMap(language => [...new Set(CATALOG_SETS[language].filter(set => set.cardCount.official > 0).map(set => set.id))].map(id => ({ language, id })));
}

/** Every card in one set, so he can see what to hunt for. */
export function SetChecklistPage() {
  const { language, id } = useLocalSearchParams<'/sets/[language]/[id]'>();
  const { trainer } = useCollection();
  // Recomputed from the live collection, so a card added from this page ticks off right away.
  const set = useMemo(() => routeSet(trainer, language, id, catalogSet), [trainer, language, id]);
  if (!set) return <Page title="Set not found">
    <View style={c.empty}>
      <Image source={require('../../assets/crafted/pokeball.png')} style={{ width: 104, height: 104 }} contentFit="contain" />
      <Txt style={[ui.subtitle, { textAlign: 'center' }]}>We couldn’t find that set</Txt>
      <Txt muted style={{ textAlign: 'center', maxWidth: 300 }}>It may be a promo collection with no numbered list to finish, or a link that’s out of date.</Txt>
      <Button title="Go back" onPress={goBack} style={{ marginTop: S.sm }} />
    </View>
  </Page>;
  return <SetChecklist set={set} />;
}

/** Rows are virtualized: sets reach 250+ cards. */
function SetChecklist({ set }: { set: SetProgress }) {
  const { trainer } = useCollection();
  const nav = usePokedexNav();
  const { width, fontScale } = useWindowDimensions();
  const [listWidth, setListWidth] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const slots = useMemo(() => setChecklist(trainer, set.language, set.setId, catalogSet), [trainer, set.language, set.setId]);
  const gridWidth = ((listWidth || width) - S.xl * 2) / Math.min(fontScale, 1.4);
  const columns = gridWidth >= 640 ? 6 : gridWidth >= 480 ? 5 : gridWidth >= 300 ? 4 : 3;
  const rows = useMemo(() => {
    const visible = slots.filter(slot => filter === 'all' || (filter === 'owned') === slot.owned);
    const toRows = (items: SetSlot[], prefix: string): Row[] => Array.from({ length: Math.ceil(items.length / columns) }, (_, i) => ({ key: `${prefix}${i}`, slots: items.slice(i * columns, i * columns + columns) }));
    const bonus = visible.filter(slot => !slot.main);
    return [...toRows(visible.filter(slot => slot.main), 'main'), ...(bonus.length ? [{ key: 'bonus', bonus: true as const, slots: [] }, ...toRows(bonus, 'bonus')] : [])];
  }, [slots, filter, columns]);
  const left = set.official - set.owned;
  // Main-set counts match the status line; bonus cards get their own section further down.
  const bonus = slots.filter(slot => !slot.main).length;
  const counts = [`${left} to find`, `${set.owned} collected`, bonus > 0 && `${bonus} bonus ${bonus === 1 ? 'card' : 'cards'}`].filter(Boolean).join(' · ');
  const openSlot = (slot: SetSlot) => slot.entry ? nav.openEntry(slot.entry) : slot.card && nav.openCard(slot.card);

  return <PageFrame title={set.name}>{scroll => <Animated.FlatList {...scroll} onLayout={event => setListWidth(event.nativeEvent.layout.width)} data={rows} keyExtractor={row => row.key} contentContainerStyle={scroll.contentContainerStyle} showsVerticalScrollIndicator={false} initialNumToRender={5} maxToRenderPerBatch={6} windowSize={5}
    ListHeaderComponent={<View style={c.header}>
      <Txt muted variant="caption">{LANGUAGE_LABELS[set.language]}</Txt>
      <View style={c.status}><Txt variant="label" style={{ flex: 1, minWidth: 0, color: set.complete ? '#80611F' : C.ink }}>{set.complete ? 'You finished this set!' : `${left} ${left === 1 ? 'card' : 'cards'} to find`}</Txt><Txt variant="readout" style={{ fontWeight: '600' }}>{set.owned} / {set.official}</Txt></View>
      <Progress value={set.owned} total={set.official} color={set.complete ? '#A98428' : '#679255'} />
      <Txt muted variant="caption">Each number counts once, in any finish. Tap a card to see it up close.</Txt>
      <View style={c.filter}>
        <Segmented label="Show set cards" options={FILTERS} value={filter} onChange={setFilter} />
        <Txt muted variant="caption">{counts}</Txt>
      </View>
    </View>}
    ListEmptyComponent={<View style={c.empty}><Image source={require('../../assets/crafted/pokeball.png')} style={{ width: 80, height: 80 }} contentFit="contain" /><Txt muted style={{ textAlign: 'center' }}>{filter === 'missing' ? 'Nothing left to find here. Amazing!' : 'No cards from this set yet.'}</Txt></View>}
    renderItem={({ item }) => item.bonus
      ? <View style={c.bonus}><Txt accessibilityRole="header" variant="cardTitle">Bonus cards</Txt><Txt muted variant="caption">Cards beyond the main {set.official}, like secret rares. Fun to find, not needed to finish.</Txt></View>
      : <View style={c.row}>{Array.from({ length: columns }, (_, i) => item.slots[i] ? <Tile key={item.slots[i].key} slot={item.slots[i]} onPress={openSlot} /> : <View key={i} style={c.tile} />)}</View>} />}</PageFrame>;
}

function Tile({ slot, onPress }: { slot: SetSlot; onPress: (slot: SetSlot) => void }) {
  const body = <>
    <View>
      {slot.card ? <CardArt card={slot.card} style={!slot.owned && { opacity: .28 }} /> : <View style={[ui.cardArt, c.unknown]}><Image source={require('../../assets/crafted/pokeball.png')} style={{ width: '42%', aspectRatio: 1, opacity: .18 }} contentFit="contain" /></View>}
      {slot.owned && <View style={c.check}><Icon name="check" size={11} color="#fff" /></View>}
    </View>
    <Txt variant="readout" style={[c.number, !slot.owned && { color: C.muted, fontWeight: '400' }]}>{slot.localId}</Txt>
  </>;
  if (!slot.card) return <View accessible accessibilityLabel={`Number ${slot.localId}, still to find`} style={c.tile}>{body}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${slot.card.name}, number ${slot.localId}, ${slot.owned ? 'collected' : 'still to find'}`} onPress={() => onPress(slot)} style={({ pressed }) => [c.tile, pressed && { opacity: .6 }]}>{body}</Pressable>;
}

const c = StyleSheet.create({
  header: { paddingHorizontal: S.xl, paddingBottom: S.lg, gap: S.md },
  status: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  filter: { gap: S.xs },
  row: { flexDirection: 'row', gap: S.sm, paddingHorizontal: S.xl, marginBottom: S.md }, tile: { flex: 1, minWidth: 0 },
  unknown: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E6ECDD', borderWidth: 1, borderStyle: 'dashed', borderColor: '#C4D0B7' },
  check: { position: 'absolute', top: 4, right: 4, backgroundColor: '#679255', borderRadius: 10, padding: 3 },
  number: { fontFamily: mono, fontWeight: '600', textAlign: 'center', marginTop: S.xs },
  bonus: { marginHorizontal: S.xl, marginTop: S.sm, marginBottom: S.md, paddingTop: S.md, borderTopWidth: 1, borderTopColor: C.line, gap: S.xs },
  empty: { alignItems: 'center', gap: S.md, padding: S.xxl },
});
