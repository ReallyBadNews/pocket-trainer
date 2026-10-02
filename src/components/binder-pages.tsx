import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, FlatList, Pressable, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { C, CardArt, IconButton, Progress, S, Txt, tick } from '@/components/pokedex-ui';
import { LANGUAGE_LABELS } from '@/lib/languages';
import type { Entry } from '@/lib/model';

export type BinderView = 'grid' | 'pages';
export const BINDER_VIEWS: { id: BinderView; label: string; icon: 'grid' | 'binder' }[] = [{ id: 'grid', label: 'Grid', icon: 'grid' }, { id: 'pages', label: 'Pages', icon: 'binder' }];
// Equal insets on every side keep the page square with the content column; the spine side is only tinted.
const POCKETS = 9, GAP = 6, INSET = 14, BORDER = 1, HOLE = 8, SPREAD_GAP = 14;
const chunk = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));

/** Nine-pocket pages like his real binder: one page per swipe on phones, a two-page spread on iPad. */
export function BinderPages({ entries, onEntry }: { entries: Entry[]; onEntry: (entry: Entry) => void }) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const list = useRef<FlatList<Entry[][]>>(null);
  const settled = useRef(0);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const perSpread = windowWidth >= 700 ? 2 : 1;
  const pages = chunk(entries, POCKETS);
  const spreads = chunk(pages, perSpread);
  const current = Math.min(index, spreads.length - 1);
  // Size pockets from the width, but keep a whole page on screen on wide, short iPads.
  const pageWidth = (width - SPREAD_GAP * (perSpread - 1)) / perSpread;
  const fromWidth = (pageWidth - BORDER * 2 - INSET * 2 - GAP * 2) / 3;
  const fromHeight = ((windowHeight * .62 - BORDER * 2 - INSET * 2 - GAP * 2) / 3 - 8) * .716 + 8;
  const pocket = Math.max(60, Math.floor(Math.min(fromWidth, fromHeight)));
  // A phone page fills the column exactly so its edges line up with the buttons above; iPad pages hug their pockets.
  const pageSize = perSpread === 1 ? pageWidth : pocket * 3 + GAP * 2 + INSET * 2 + BORDER * 2;
  const first = current * perSpread + 1, last = Math.min(pages.length, first + perSpread - 1);
  const label = first === last ? `Page ${first} of ${pages.length}` : `Pages ${first}–${last} of ${pages.length}`;
  useEffect(() => { if (width) list.current?.scrollToOffset({ offset: current * width, animated: false }); }, [width, perSpread]);
  function go(next: number) {
    const target = Math.max(0, Math.min(spreads.length - 1, next));
    settled.current = target;
    list.current?.scrollToOffset({ offset: target * width, animated: !reduceMotion });
    setIndex(target);
    const page = target * perSpread + 1;
    AccessibilityInfo.announceForAccessibility(`Page ${page} of ${pages.length}`);
  }
  const pageAt = (event: NativeSyntheticEvent<NativeScrollEvent>) => Math.round(event.nativeEvent.contentOffset.x / Math.max(1, width));
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = pageAt(event);
    if (next !== index) setIndex(next);
  };
  // A swipe that lands on a new page clicks like turning a real one.
  const onSettle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = pageAt(event);
    if (next !== settled.current) { settled.current = next; tick(); }
  };
  return <View style={s.wrap} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    {width > 0 && <FlatList ref={list} key={perSpread} data={spreads} horizontal pagingEnabled showsHorizontalScrollIndicator={false} keyExtractor={(_, i) => String(i)} onScroll={onScroll} onMomentumScrollEnd={onSettle} scrollEventThrottle={32}
      initialNumToRender={1} maxToRenderPerBatch={2} windowSize={3} getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
      renderItem={({ item, index: spread }) => <View style={[s.spread, { width }]}>
        {Array.from({ length: perSpread }, (_, side) => <BinderPage key={side} entries={item[side] ?? []} page={spread * perSpread + side + 1} pocket={pocket} width={pageSize} spine={perSpread === 2 && side === 0 ? 'right' : 'left'} onEntry={onEntry} />)}
      </View>} />}
    <View style={s.pager}>
      <PageButton label="Previous page" disabled={current <= 0} flip={false} onPress={() => go(current - 1)} />
      <View style={s.pageInfo}>
        <Txt accessibilityLiveRegion="polite" variant="readout" style={s.pageLabel}>{label}</Txt>
        {spreads.length > 1 && <Progress value={current + 1} total={spreads.length} />}
      </View>
      <PageButton label="Next page" disabled={current >= spreads.length - 1} flip onPress={() => go(current + 1)} />
    </View>
    {spreads.length > 1 && current === 0 && <Txt muted variant="caption" style={s.hint}>Swipe to turn the page</Txt>}
  </View>;
}

function PageButton({ label, disabled, flip, onPress }: { label: string; disabled: boolean; flip: boolean; onPress: () => void }) {
  return <View style={flip && { transform: [{ rotate: '180deg' }] }}><IconButton round icon="back" label={label} onPress={onPress} disabled={disabled} /></View>;
}

function BinderPage({ entries, page, pocket, width, spine, onEntry }: { entries: Entry[]; page: number; pocket: number; width: number; spine: 'left' | 'right'; onEntry: (entry: Entry) => void }) {
  const art = pocket - 8, row = art / .716 + 8;
  return <View style={[s.page, { width }]}>
    <View style={[s.rings, spine === 'left' ? s.ringsLeft : s.ringsRight]}>{[0, 1, 2].map(n => <View key={n} style={[s.hole, { top: INSET + n * (row + GAP) + row / 2 - HOLE / 2 }]} />)}</View>
    <View style={[s.pockets, { width: pocket * 3 + GAP * 2 }]}>{Array.from({ length: POCKETS }, (_, slot) => {
      const entry = entries[slot];
      if (!entry) return <View key={slot} accessible={false} style={[s.sleeve, { width: pocket }]}><View style={[s.empty, { width: art, height: art / .716 }]}><Image source={require('../../assets/crafted/pokeball.png')} style={{ width: art * .42, height: art * .42, opacity: .16 }} contentFit="contain" /></View></View>;
      return <Pressable key={entry.key} accessibilityRole="button" accessibilityLabel={`${entry.card.name}, ${entry.quantity} ${entry.quantity === 1 ? 'copy' : 'copies'}, ${LANGUAGE_LABELS[entry.card.language]}. Page ${page}, pocket ${slot + 1}`} onPress={() => onEntry(entry)} style={({ pressed }) => [s.sleeve, { width: pocket }, pressed && { opacity: .7 }]}>
        <CardArt card={entry.card} style={{ width: art, borderRadius: 5 }} />
        <View style={s.shine} pointerEvents="none" />
        {entry.quantity > 1 && <View style={s.quantity}><Txt maxFontSizeMultiplier={1} style={s.quantityText}>×{entry.quantity}</Txt></View>}
      </Pressable>;
    })}</View>
  </View>;
}

const s = StyleSheet.create({
  wrap: { gap: 14 },
  spread: { flexDirection: 'row', justifyContent: 'center', gap: SPREAD_GAP },
  page: { padding: INSET, alignItems: 'center', backgroundColor: '#F6F8F0', borderWidth: BORDER, borderColor: '#C9D5BC', borderRadius: 14, shadowColor: '#25382F', shadowOpacity: .12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  // The ring strip fills the inset on the spine side, so it never pushes the pockets off centre.
  rings: { position: 'absolute', top: 0, bottom: 0, width: INSET, backgroundColor: '#E9EFE0' },
  ringsLeft: { left: 0, borderTopLeftRadius: 13, borderBottomLeftRadius: 13 },
  ringsRight: { right: 0, borderTopRightRadius: 13, borderBottomRightRadius: 13 },
  hole: { position: 'absolute', left: (INSET - HOLE) / 2, width: HOLE, height: HOLE, borderRadius: HOLE / 2, backgroundColor: '#C9D5BC' },
  pockets: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  sleeve: { padding: 3, borderRadius: 7, backgroundColor: '#E4EBDA', borderWidth: 1, borderColor: '#D1DBC4', alignItems: 'center' },
  // A faint top lip reads as the opening of a plastic sleeve.
  shine: { position: 'absolute', top: 3, left: 5, right: 5, height: 3, borderRadius: 2, backgroundColor: '#FFFFFF8C' },
  empty: { borderRadius: 5, borderWidth: 1, borderStyle: 'dashed', borderColor: '#C4D0B7', alignItems: 'center', justifyContent: 'center' },
  quantity: { position: 'absolute', bottom: 7, right: 7, backgroundColor: C.ink, paddingHorizontal: 6, borderRadius: 6 },
  quantityText: { color: 'white', fontWeight: '800', fontSize: 13, lineHeight: 19 },
  pager: { flexDirection: 'row', alignItems: 'center', gap: S.md },
  pageInfo: { flex: 1, minWidth: 0, gap: S.sm },
  pageLabel: { fontWeight: '600', textAlign: 'center' },
  hint: { textAlign: 'center' },
});
