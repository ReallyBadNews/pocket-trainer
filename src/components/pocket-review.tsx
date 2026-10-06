import Animated, { FadeIn } from 'react-native-reanimated';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Button, ButtonRow, C, CardArt, CardCaption, Icon, IconButton, pressFx, R, S, SearchBox, Txt, tick } from '@/components/pokedex-ui';
import { ZoomablePhoto } from '@/components/zoomable-photo';
import { setForCard } from '@/lib/catalog';
import { searchAnyLanguage } from '@/lib/language-detect';
import { nextToCheck, pageSummary, pocketReviewState, reviewProgress, type Pocket, type PocketReviewState } from '@/lib/page-scan';
import type { CardBrief } from '@/lib/model';

const READY = '#3E7A48';
const STATUS: Record<PocketReviewState, { title: string; detail?: string }> = {
  reading: { title: 'Reading this pocket…', detail: 'Its match shows up here in a moment.' },
  ready: { title: 'Ready to add' },
  check: { title: 'Is this your card?', detail: 'Check the picture and the number at the bottom.' },
  skipped: { title: 'Skipped', detail: "This card won't be added." },
  empty: { title: 'Looks empty', detail: 'If a card is in there, search for it below.' },
  unreadable: { title: 'No match', detail: "We can't read this one. Type its name below." },
};

/** One binder pocket at a time: the photo beside its match, ways to fix it, and paging through the rest of the page. */
export function PocketReview({ pockets, index, onIndex, slice, aspect, onChoose, onSkip, onClose }: {
  pockets: Pocket[]; index: number; onIndex: (index: number) => void;
  /** Draws this pocket's part of the page photo at any size. */
  slice: (index: number, width: number, height: number) => ReactNode; aspect: number;
  onChoose: (card: CardBrief) => void; onSkip: (skipped: boolean) => void; onClose: () => void;
}) {
  const scroller = useRef<ScrollView>(null);
  const { height: screenHeight, fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const [query, setQuery] = useState('');
  // Confirming or skipping jumps to the next pocket to check; this line says why the picture changed.
  const [moved, setMoved] = useState<string | null>(null);
  const pocket = pockets[index];
  const state = pocketReviewState(pocket);
  const { toCheck, reading } = pageSummary(pockets);
  const searching = !!query.trim();
  const results = useMemo(() => searching ? searchAnyLanguage(query, pocket.choice?.language ?? null, 12) : pocket.matches.slice(0, 6).map(m => m.card), [searching, query, pocket]);
  const showOptions = searching || results.length > 1;

  function go(next: number, note: string | null = null) {
    Keyboard.dismiss(); setQuery(''); setMoved(note); onIndex(next);
    scroller.current?.scrollTo({ y: 0, animated: false });
  }
  function settle(note: string) {
    const next = nextToCheck(pockets, index);
    if (next !== null) go(next, note);
    else scroller.current?.scrollTo({ y: 0, animated: true });
  }
  function confirm() { onChoose(pocket.choice!); settle(`Pocket ${index + 1} is ready to add.`); }
  function skip() {
    const skipping = !pocket.skipped;
    onSkip(skipping);
    if (skipping) settle(`Pocket ${index + 1} skipped.`);
  }
  // Picking stays on this pocket and scrolls up so the new match shows beside the photo.
  function pick(card: CardBrief) {
    tick(); Keyboard.dismiss(); onChoose(card);
    scroller.current?.scrollTo({ y: 0, animated: true });
  }

  const inner = Math.max(0, width - 2 * S.xl);
  // Pictures stay side by side at every text size; the words that grow sit full width underneath.
  const column = Math.min(240, Math.floor((inner - S.md) / 2));
  const columns = Math.max(2, Math.floor((inner + S.sm) / (104 * Math.min(fontScale, 1.4) + S.sm)));
  const tile = Math.floor((inner - S.sm * (columns - 1)) / columns);
  const status = STATUS[state];

  return <>
    <ScrollView ref={scroller} onLayout={e => setWidth(e.nativeEvent.layout.width)} style={[s.scroll, { height: screenHeight }]} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
      {moved && <View accessibilityLiveRegion="polite" style={s.moved}><Icon name="check" size={18} color={READY} /><Txt variant="caption" style={{ flex: 1, minWidth: 0 }}>{moved} Here's the next one to check.</Txt></View>}
      {width > 0 && <Animated.View key={index} entering={FadeIn.duration(180)} style={[s.compare, { gap: S.md }]}>
        <View style={[s.side, { width: column }]}>
          <Txt muted variant="caption">Your card</Txt>
          <ZoomablePhoto label={`Pocket ${index + 1} photo`} aspectRatio={aspect} renderPhoto={(w, h) => <View style={[s.slice, { width: w, height: h }]}>{slice(index, w, h)}</View>}>
            <View style={[s.slice, { width: column, height: column / aspect }]}>{slice(index, column, column / aspect)}</View>
          </ZoomablePhoto>
        </View>
        <View style={[s.side, { width: column }]}>
          <Txt muted variant="caption">{pocket.confirmed ? 'Your pick' : 'Our match'}</Txt>
          {pocket.choice ? <CardArt card={pocket.choice} high style={[{ width: column }, pocket.skipped && { opacity: .4 }]} />
            : <View style={[s.noMatch, { width: column }]}><Icon name="search" size={30} color={C.muted} /><Txt muted variant="caption" style={{ textAlign: 'center' }}>{state === 'reading' ? 'Reading…' : 'No match yet'}</Txt></View>}
        </View>
      </Animated.View>}
      {pocket.choice && <CardCaption name={pocket.choice.name} setName={setForCard(pocket.choice)?.name ?? pocket.choice.id} detail={`#${pocket.choice.localId}`} />}
      <View accessibilityLiveRegion="polite" style={s.status}>
        <StatusMark state={state} />
        <View style={{ flex: 1, minWidth: 0 }}><Txt variant="label" style={state === 'ready' && { color: READY }}>{status.title}</Txt>{status.detail && <Txt muted variant="caption">{status.detail}</Txt>}</View>
      </View>
      {state !== 'reading' && <ButtonRow>
        {state === 'check' && <Button title="Yes, that's it!" icon="check" onPress={confirm} />}
        {!toCheck && !reading && <Button title="Done" icon="check" onPress={onClose} />}
        <Button title={pocket.skipped ? 'Put it back' : 'Skip it'} secondary onPress={skip} />
      </ButtonRow>}
      {state !== 'reading' && <View style={s.find}>
        <Txt accessibilityRole="header" variant="subtitle">{pocket.choice && !pocket.skipped ? 'Not quite? Find your card' : 'Find your card'}</Txt>
        <SearchBox value={query} onChange={setQuery} placeholder="Type the Pokémon's name" />
        {showOptions && <Txt variant="label">{searching ? (results.length ? 'Search results' : 'No matching cards') : 'Is it one of these?'}</Txt>}
        {showOptions && tile > 0 && <View style={s.grid}>{results.map(card => {
          const current = pocket.choice?.id === card.id && pocket.choice.language === card.language && !pocket.skipped;
          return <Pressable key={`${card.language}:${card.id}`} accessibilityRole="button" accessibilityLabel={`Choose ${card.name} ${card.localId}`} accessibilityState={{ selected: current }} onPress={() => pick(card)} style={press => [s.option, { width: tile }, current && s.optionCurrent, pressFx(press)]}>
            <View><CardArt card={card} />{current && <View style={s.chosen}><Icon name="check" size={14} color="white" /></View>}</View>
            <CardCaption name={card.name} setName={setForCard(card)?.name ?? card.id} detail={`#${card.localId}`} />
          </Pressable>;
        })}</View>}
      </View>}
    </ScrollView>
    <View style={s.pager}>
      <IconButton round icon="back" label="Previous pocket" disabled={index === 0} onPress={() => go(index - 1)} />
      <Txt muted variant="caption" style={s.progress}>{reviewProgress(pockets)}</Txt>
      <View style={s.flip}><IconButton round icon="back" label="Next pocket" disabled={index === pockets.length - 1} onPress={() => go(index + 1)} /></View>
    </View>
  </>;
}

function StatusMark({ state }: { state: PocketReviewState }) {
  if (state === 'reading') return <View style={s.mark}><ActivityIndicator size="small" color={C.muted} /></View>;
  if (state === 'ready') return <View style={[s.mark, { backgroundColor: READY }]}><Icon name="check" size={18} color="white" /></View>;
  if (state === 'check') return <View style={[s.mark, { backgroundColor: C.gold }]}><Txt maxFontSizeMultiplier={1} style={{ fontWeight: '900', fontSize: 16, lineHeight: 20 }}>?</Txt></View>;
  return <View style={[s.mark, s.markQuiet]}><Icon name={state === 'skipped' ? 'minus' : 'search'} size={16} color={C.muted} /></View>;
}

const s = StyleSheet.create({
  // A full window height that shrinks to fit the sheet, so paging and searching don't resize it.
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { padding: S.xl, gap: S.lg },
  moved: { flexDirection: 'row', alignItems: 'center', gap: S.sm, padding: S.md, backgroundColor: '#DEE8D1', borderRadius: R.md },
  compare: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start' },
  side: { gap: S.xs },
  slice: { overflow: 'hidden', borderRadius: R.sm, backgroundColor: '#1F2F27' },
  noMatch: { aspectRatio: .716, alignItems: 'center', justifyContent: 'center', gap: S.xs, padding: S.sm, borderRadius: R.sm, borderWidth: 2, borderStyle: 'dashed', borderColor: C.line },
  status: { flexDirection: 'row', alignItems: 'flex-start', gap: S.md },
  mark: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  markQuiet: { borderWidth: 2, borderColor: C.line },
  find: { gap: S.sm, paddingTop: S.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  option: { padding: S.xs, borderRadius: R.md, borderWidth: 2, borderColor: 'transparent' },
  optionCurrent: { borderColor: C.ink },
  chosen: { position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: READY, borderWidth: 2, borderColor: 'white' },
  pager: { flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingHorizontal: S.lg, paddingVertical: S.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  progress: { flex: 1, minWidth: 0, textAlign: 'center' },
  flip: { transform: [{ rotate: '180deg' }] },
});
