import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { C, CardArt, Chip, Icon, Progress, Txt, mono, ui } from '@/components/pokedex-ui';
import { catalogSet } from '@/lib/catalog';
import { useCollection } from '@/lib/collection-context';
import { LANGUAGE_LABELS } from '@/lib/languages';
import type { CardBrief, Entry } from '@/lib/model';
import { setChecklist, setProgress, type SetProgress, type SetSlot } from '@/lib/set-progress';
import { Sheet } from './collection-modals';

type Filter = 'all' | 'missing' | 'owned';
const FILTERS: { id: Filter; label: string }[] = [{ id: 'all', label: 'Every card' }, { id: 'missing', label: 'Still to find' }, { id: 'owned', label: 'Collected' }];
type Row = { key: string; bonus?: true; slots: SetSlot[] };

/** Every card in one set, so he can see what to hunt for. Rows are virtualized: sets reach 250+ cards. */
export function SetChecklistModal({ set, onClose, onEntry, onCard }: { set: SetProgress; onClose: () => void; onEntry: (entry: Entry) => void; onCard: (card: CardBrief) => void }) {
  const { trainer } = useCollection();
  const { width, height } = useWindowDimensions();
  const [filter, setFilter] = useState<Filter>('all');
  // Recomputed from the live collection, so a card added from this sheet ticks off right away.
  const live = useMemo(() => setProgress(trainer, catalogSet).find(s => s.key === set.key) ?? { ...set, owned: 0, bonus: 0, complete: false }, [trainer, set]);
  const slots = useMemo(() => setChecklist(trainer, set.language, set.setId, catalogSet), [trainer, set.language, set.setId]);
  const columns = Math.min(600, width - 24) >= 480 ? 5 : 4;
  const rows = useMemo(() => {
    const visible = slots.filter(slot => filter === 'all' || (filter === 'owned') === slot.owned);
    const toRows = (items: SetSlot[], prefix: string): Row[] => Array.from({ length: Math.ceil(items.length / columns) }, (_, i) => ({ key: `${prefix}${i}`, slots: items.slice(i * columns, i * columns + columns) }));
    const bonus = visible.filter(slot => !slot.main);
    return [...toRows(visible.filter(slot => slot.main), 'main'), ...(bonus.length ? [{ key: 'bonus', bonus: true as const, slots: [] }, ...toRows(bonus, 'bonus')] : [])];
  }, [slots, filter, columns]);
  const left = live.official - live.owned;

  return <Sheet title="Set checklist" onClose={onClose}>
    <FlatList data={rows} keyExtractor={row => row.key} style={[c.list, { height }]} contentContainerStyle={c.content} initialNumToRender={5} maxToRenderPerBatch={6} windowSize={5}
      ListHeaderComponent={<View style={c.header}>
        <View><Txt style={ui.subtitle}>{live.name}</Txt><Txt muted style={{ fontSize: 12, lineHeight: 18 }}>{LANGUAGE_LABELS[live.language]}</Txt></View>
        <View style={ui.between}><Txt style={{ fontWeight: '800', fontSize: 14, color: live.complete ? '#80611F' : C.ink }}>{live.complete ? 'You finished this set!' : `${left} ${left === 1 ? 'card' : 'cards'} to find`}</Txt><Txt style={{ fontFamily: mono, fontSize: 12, fontWeight: '700' }}>{live.owned} / {live.official}</Txt></View>
        <Progress value={live.owned} total={live.official} color={live.complete ? '#A98428' : '#679255'} />
        <Txt muted style={{ fontSize: 12, lineHeight: 18 }}>Each number counts once, in any finish. Tap a card to see it up close.</Txt>
        <View style={c.filters}>{FILTERS.map(option => <Chip key={option.id} label={option.label} selected={filter === option.id} onPress={() => setFilter(option.id)} />)}</View>
      </View>}
      ListEmptyComponent={<View style={c.empty}><Image source={require('../../assets/crafted/pokeball.png')} style={{ width: 80, height: 80 }} contentFit="contain" /><Txt muted style={{ textAlign: 'center' }}>{filter === 'missing' ? 'Nothing left to find here. Amazing!' : 'No cards from this set yet.'}</Txt></View>}
      renderItem={({ item }) => item.bonus
        ? <View style={c.bonus}><Txt accessibilityRole="header" style={{ fontWeight: '800' }}>Bonus cards</Txt><Txt muted style={{ fontSize: 12, lineHeight: 18 }}>Cards beyond the main {live.official}, like secret rares. Fun to find, not needed to finish.</Txt></View>
        : <View style={c.row}>{Array.from({ length: columns }, (_, i) => item.slots[i] ? <Tile key={item.slots[i].key} slot={item.slots[i]} onEntry={onEntry} onCard={onCard} /> : <View key={i} style={c.tile} />)}</View>} />
  </Sheet>;
}

function Tile({ slot, onEntry, onCard }: { slot: SetSlot; onEntry: (entry: Entry) => void; onCard: (card: CardBrief) => void }) {
  const body = <>
    <View>
      {slot.card ? <CardArt card={slot.card} style={!slot.owned && { opacity: .28 }} /> : <View style={[ui.cardArt, c.unknown]}><Image source={require('../../assets/crafted/pokeball.png')} style={{ width: '42%', aspectRatio: 1, opacity: .18 }} contentFit="contain" /></View>}
      {slot.owned && <View style={c.check}><Icon name="check" size={11} color="#fff" /></View>}
    </View>
    <Txt numberOfLines={1} style={[c.number, !slot.owned && { color: C.muted, fontWeight: '400' }]}>{slot.localId}</Txt>
  </>;
  if (!slot.card) return <View accessible accessibilityLabel={`Number ${slot.localId}, still to find`} style={c.tile}>{body}</View>;
  const card = slot.card;
  return <Pressable accessibilityRole="button" accessibilityLabel={`${card.name}, number ${slot.localId}, ${slot.owned ? 'collected' : 'still to find'}`} onPress={() => slot.entry ? onEntry(slot.entry) : onCard(card)} style={({ pressed }) => [c.tile, pressed && { opacity: .6 }]}>{body}</Pressable>;
}

const c = StyleSheet.create({
  list: { flexGrow: 0, flexShrink: 1 }, content: { paddingBottom: 26 },
  header: { padding: 20, paddingBottom: 14, gap: 10 }, filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  row: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 12 }, tile: { flex: 1, minWidth: 0 },
  unknown: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E6ECDD', borderWidth: 1, borderStyle: 'dashed', borderColor: '#C4D0B7' },
  check: { position: 'absolute', top: 4, right: 4, backgroundColor: '#679255', borderRadius: 10, padding: 3 },
  number: { fontFamily: mono, fontSize: 11, lineHeight: 17, fontWeight: '700', textAlign: 'center', marginTop: 3 },
  bonus: { marginHorizontal: 16, marginTop: 6, marginBottom: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line, gap: 2 },
  empty: { alignItems: 'center', gap: 10, padding: 30 },
});
