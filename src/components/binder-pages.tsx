import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, FlatList, Pressable, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { C, CardArt, Icon, Txt, mono } from '@/components/pokedex-ui';
import { LANGUAGE_LABELS } from '@/lib/languages';
import type { Entry } from '@/lib/model';

export type BinderView = 'grid' | 'pages';
export const BINDER_VIEWS: { id: BinderView; label: string; icon: 'grid' | 'binder' }[] = [{ id: 'grid', label: 'Grid', icon: 'grid' }, { id: 'pages', label: 'Pages', icon: 'binder' }];
const POCKETS = 9, GAP = 6, SPINE = 20, EDGE = 8, BORDERS = 4, PAD_Y = 10, SPREAD_GAP = 14;
const chunk = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

/** Nine-pocket pages like his real binder: one page per swipe on phones, a two-page spread on iPad. */
export function BinderPages({ entries, onEntry }: { entries: Entry[]; onEntry: (entry: Entry) => void }) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const list = useRef<FlatList<Entry[][]>>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const perSpread = windowWidth >= 700 ? 2 : 1;
  const pages = chunk(entries, POCKETS);
  const spreads = chunk(pages, perSpread);
  const current = Math.min(index, spreads.length - 1);
  // Size pockets from the width, but keep a whole page on screen on wide, short iPads.
  const fromWidth = ((width - SPREAD_GAP * (perSpread - 1)) / perSpread - SPINE - EDGE - BORDERS - GAP * 2) / 3;
  const fromHeight = ((windowHeight * .62 - PAD_Y * 2 - GAP * 2) / 3 - 8) * .716 + 8;
  const pocket = Math.max(60, Math.floor(Math.min(fromWidth, fromHeight)));
  const first = current * perSpread + 1, last = Math.min(pages.length, first + perSpread - 1);
  const label = first === last ? `Page ${first} of ${pages.length}` : `Pages ${first}–${last} of ${pages.length}`;
  useEffect(() => { if (width) list.current?.scrollToOffset({ offset: current * width, animated: false }); }, [width, perSpread]);
  function go(next: number) {
    const target = Math.max(0, Math.min(spreads.length - 1, next));
    list.current?.scrollToOffset({ offset: target * width, animated: !reduceMotion });
    setIndex(target);
    const page = target * perSpread + 1;
    AccessibilityInfo.announceForAccessibility(`Page ${page} of ${pages.length}`);
  }
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / Math.max(1, width));
    if (next !== index) setIndex(next);
  };
  return <View style={s.wrap} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    {width > 0 && <FlatList ref={list} key={perSpread} data={spreads} horizontal pagingEnabled showsHorizontalScrollIndicator={false} keyExtractor={(_, i) => String(i)} onScroll={onScroll} scrollEventThrottle={32}
      initialNumToRender={1} maxToRenderPerBatch={2} windowSize={3} getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
      renderItem={({ item, index: spread }) => <View style={[s.spread, { width }]}>
        {Array.from({ length: perSpread }, (_, side) => <BinderPage key={side} entries={item[side] ?? []} page={spread * perSpread + side + 1} pocket={pocket} spine={perSpread === 2 && side === 0 ? 'right' : 'left'} onEntry={onEntry} />)}
      </View>} />}
    <View style={s.pager}>
      <PageButton label="Previous page" disabled={current <= 0} flip={false} onPress={() => go(current - 1)} />
      <Txt accessibilityLiveRegion="polite" style={s.pageLabel}>{label}</Txt>
      <PageButton label="Next page" disabled={current >= spreads.length - 1} flip onPress={() => go(current + 1)} />
    </View>
  </View>;
}

function PageButton({ label, disabled, flip, onPress }: { label: string; disabled: boolean; flip: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.pageButton, disabled && { opacity: .35 }, pressed && { opacity: .6 }]}>
    <View style={flip && { transform: [{ rotate: '180deg' }] }}><Icon name="back" size={20} /></View>
  </Pressable>;
}

function BinderPage({ entries, page, pocket, spine, onEntry }: { entries: Entry[]; page: number; pocket: number; spine: 'left' | 'right'; onEntry: (entry: Entry) => void }) {
  const art = pocket - 8;
  return <View style={[s.page, spine === 'left' ? s.spineLeft : s.spineRight]}>
    <View style={[s.rings, spine === 'left' ? { left: 0 } : { right: 0 }]}>{[0, 1, 2].map(n => <View key={n} style={s.hole} />)}</View>
    <View style={[s.pockets, { width: pocket * 3 + GAP * 2 }]}>{Array.from({ length: POCKETS }, (_, slot) => {
      const entry = entries[slot];
      if (!entry) return <View key={slot} accessible={false} style={[s.sleeve, { width: pocket }]}><View style={[s.empty, { width: art, height: art / .716 }]}><Image source={require('../../assets/crafted/pokeball.png')} style={{ width: art * .42, height: art * .42, opacity: .16 }} contentFit="contain" /></View></View>;
      return <Pressable key={entry.key} accessibilityRole="button" accessibilityLabel={`${entry.card.name}, ${entry.quantity} ${entry.quantity === 1 ? 'copy' : 'copies'}, ${LANGUAGE_LABELS[entry.card.language]}. Page ${page}, pocket ${slot + 1}`} onPress={() => onEntry(entry)} style={({ pressed }) => [s.sleeve, { width: pocket }, pressed && { opacity: .7 }]}>
        <CardArt card={entry.card} style={{ width: art, borderRadius: 5 }} />
        <View style={s.shine} pointerEvents="none" />
        {entry.quantity > 1 && <View style={s.quantity}><Txt style={s.quantityText}>×{entry.quantity}</Txt></View>}
      </Pressable>;
    })}</View>
  </View>;
}

const s = StyleSheet.create({
  wrap: { gap: 10 },
  spread: { flexDirection: 'row', justifyContent: 'center', gap: SPREAD_GAP },
  page: { paddingVertical: PAD_Y, backgroundColor: '#F6F8F0', borderWidth: 1, borderColor: '#C9D5BC', borderRadius: 14, shadowColor: '#25382F', shadowOpacity: .12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  spineLeft: { paddingLeft: SPINE, paddingRight: EDGE, borderTopLeftRadius: 5, borderBottomLeftRadius: 5, borderLeftWidth: 3, borderLeftColor: '#B7C6A8' },
  spineRight: { paddingRight: SPINE, paddingLeft: EDGE, borderTopRightRadius: 5, borderBottomRightRadius: 5, borderRightWidth: 3, borderRightColor: '#B7C6A8' },
  rings: { position: 'absolute', top: 0, bottom: 0, width: SPINE, alignItems: 'center', justifyContent: 'space-evenly' },
  hole: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.screen, borderWidth: 1, borderColor: '#AFBFA0' },
  pockets: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  sleeve: { padding: 3, borderRadius: 7, backgroundColor: '#E4EBDA', borderWidth: 1, borderColor: '#D1DBC4', alignItems: 'center' },
  // A faint top lip reads as the opening of a plastic sleeve.
  shine: { position: 'absolute', top: 3, left: 5, right: 5, height: 3, borderRadius: 2, backgroundColor: '#FFFFFF8C' },
  empty: { borderRadius: 5, borderWidth: 1, borderStyle: 'dashed', borderColor: '#C4D0B7', alignItems: 'center', justifyContent: 'center' },
  quantity: { position: 'absolute', bottom: 7, right: 7, backgroundColor: C.ink, paddingHorizontal: 6, borderRadius: 6 },
  quantityText: { color: 'white', fontWeight: '800', fontSize: 11, lineHeight: 17 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  pageButton: { width: 48, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E3EAD9', borderBottomWidth: 2, borderBottomColor: '#C7D2BB' },
  pageLabel: { fontFamily: mono, fontSize: 13, fontWeight: '700', minWidth: 150, textAlign: 'center' },
});
