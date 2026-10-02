import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Button, ButtonRow, C, Icon, Progress, R, S, Txt, mono, ui } from '@/components/pokedex-ui';
import { useCollection } from '@/lib/collection-context';
import { species, speciesById, speciesImage } from '@/lib/catalog';
import { discoveredIds, recordQuizScore } from '@/lib/model';
import { QUIZ_LENGTH, buildRound, quizPool, quizStars, type QuizRound } from '@/lib/quiz';
import { Sheet } from './collection-modals';

const UNIVERSE = species.map(s => s.id);
const SHADOW = '#172630';
const FALLBACK_NOTE = 'Discover more Pokémon to play with your own!';
// Session memory, so closing and reopening the game keeps drawing Pokémon that haven't had a turn yet.
const seenByTrainer = new Map<string, number[]>();
const nameOf = (id: number) => speciesById.get(id)?.en ?? `#${id}`;

function useReduceMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduced(value); });
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => { active = false; listener.remove(); };
  }, []);
  return reduced;
}

const TONES = { mystery: { base: '#2E83B5', ray: '#4AB0DC', glow: '#E4F9FF' }, win: { base: '#DC9F25', ray: '#F3CD5F', glow: '#FFF8DC' } };
const RAYS = Array.from({ length: 16 }, (_, i) => {
  const point = (turn: number) => `${(50 + 80 * Math.cos(turn * Math.PI * 2)).toFixed(2)} ${(50 + 80 * Math.sin(turn * Math.PI * 2)).toFixed(2)}`;
  return `M50 50L${point(i / 16)}L${point((i + .5) / 16)}Z`;
});
/** The anime's sunburst with a stepped spotlight; drawn larger than its frame so it can turn without showing corners. */
function Burst({ tone, style }: { tone: keyof typeof TONES; style?: StyleProp<ViewStyle> }) {
  const t = TONES[tone];
  return <Svg viewBox="0 0 100 100" style={style} accessible={false} pointerEvents="none">
    <Rect x={0} y={0} width={100} height={100} fill={t.base} />
    {RAYS.map(d => <Path key={d} d={d} fill={t.ray} />)}
    {[26, 19, 12].map((r, i) => <Circle key={r} cx={50} cy={50} r={r} fill={t.glow} opacity={.22 + i * .2} />)}
  </Svg>;
}

function Star({ on, size = 44 }: { on: boolean; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}><Path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z" fill={on ? C.gold : '#DCE4D2'} stroke={on ? '#A98428' : '#B5C2A9'} strokeWidth={1.4} strokeLinejoin="round" /></Svg>;
}

export function QuizInvite({ onPlay }: { onPlay: () => void }) {
  const { trainer } = useCollection();
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(0);
  const inviteWidth = width || Math.min(windowWidth, 1100) - S.xl * 2;
  const stack = inviteWidth < 280 || fontScale > 1.2;
  const teaserSize = stack ? 104 : Math.min(120, Math.max(84, inviteWidth * .29));
  const discovered = useMemo(() => discoveredIds(trainer), [trainer]);
  const own = useMemo(() => !quizPool(discovered, UNIVERSE).fallback, [discovered]);
  // One of their own Pokémon as the teaser shadow; Pikachu until they have some.
  const [teaser] = useState(() => { const ids = [...discovered].filter(id => speciesById.has(id)); return ids.length ? ids[Math.floor(Math.random() * ids.length)] : 25; });
  return <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={[q.invite, stack && q.inviteStack]}>
    <View style={[q.inviteCopy, stack && { flex: 0, alignSelf: 'stretch' }]}>
      <Txt accessibilityRole="header" variant="subtitle">Who’s That Pokémon?</Txt>
      <Txt muted variant="caption" style={{ marginTop: S.sm }}>{own ? 'Guess the shadow! 10 quick questions from your Pokédex.' : 'Guess the shadow! Play with the first 151 Pokémon.'}</Txt>
      {!!trainer.quizBest && <Txt variant="readout" style={q.inviteBest}>Best score: {trainer.quizBest}/{QUIZ_LENGTH}</Txt>}
      <Button size="medium" title="Play" onPress={onPlay} style={{ alignSelf: 'flex-start', marginTop: S.md }} />
    </View>
    <View accessible accessibilityRole="image" accessibilityLabel="A mystery Pokémon shadow" style={[q.teaser, { width: teaserSize, height: teaserSize }, stack && { alignSelf: 'flex-end' }]}>
      <View style={[q.teaserCircle, { borderRadius: teaserSize / 2 }]}><Burst tone="mystery" style={{ position: 'absolute', width: teaserSize * 1.5, height: teaserSize * 1.5, left: -teaserSize * .25, top: -teaserSize * .25 }} /><Image source={speciesImage(teaser)} tintColor={SHADOW} style={{ width: teaserSize * .76, height: teaserSize * .76 }} contentFit="contain" cachePolicy="memory-disk" /></View>
      <View style={q.teaserBadge}><Txt style={{ color: 'white', fontWeight: '900', fontSize: 20, lineHeight: 24 }}>?</Txt></View>
    </View>
  </View>;
}

export function QuizModal({ onClose }: { onClose: () => void }) {
  const [game, setGame] = useState(0);
  return <Sheet title="Who’s That Pokémon?" onClose={onClose} dismissible={false}><QuizGame key={game} onAgain={() => setGame(n => n + 1)} onDone={onClose} /></Sheet>;
}

function QuizGame({ onAgain, onDone }: { onAgain: () => void; onDone: () => void }) {
  const { trainer, updateTrainer } = useCollection();
  const reduced = useReduceMotion();
  const { width, height, fontScale } = useWindowDimensions();
  const [panelWidth, setPanelWidth] = useState(0);
  const choiceWidth = (panelWidth || Math.min(width - 24, 600)) - S.xl * 2;
  const singleColumn = choiceWidth < 300 || fontScale > 1.2;
  const [round] = useState<QuizRound>(() => buildRound(discoveredIds(trainer), { universe: UNIVERSE, seen: seenByTrainer.get(trainer.id) }));
  const [bestBefore] = useState(trainer.quizBest ?? 0);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [longest, setLongest] = useState(0);
  const [art, setArt] = useState<'loading' | 'ready' | 'error'>('loading');
  const [done, setDone] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const pop = useSharedValue(1), spin = useSharedValue(0), shade = useSharedValue(1), turn = useSharedValue(0);
  const artStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }, { rotate: `${spin.value}deg` }] }));
  const shadowStyle = useAnimatedStyle(() => ({ opacity: shade.value }));
  const colorStyle = useAnimatedStyle(() => ({ opacity: 1 - shade.value }));
  const burstStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  const question = round.questions[index];
  const answered = picked !== null;
  const correct = picked === question.answer;
  const stageHeight = Math.round(Math.min(300, Math.max(210, height * .32)));
  const artSize = Math.min(stageHeight - 34, 250);

  useEffect(() => {
    seenByTrainer.set(trainer.id, round.seen);
    Image.prefetch(round.questions.map(item => speciesImage(item.answer)), 'memory-disk').catch(() => {});
  }, [round, trainer.id]);
  useEffect(() => () => { cancelAnimation(pop); cancelAnimation(spin); cancelAnimation(shade); cancelAnimation(turn); }, [pop, spin, shade, turn]);
  useEffect(() => {
    if (answered) requestAnimationFrame(() => scroll.current?.scrollToEnd({ animated: !reduced }));
  }, [answered, reduced]);

  function choose(id: number) {
    if (answered) return;
    const right = id === question.answer;
    const nextStreak = right ? streak + 1 : 0;
    setPicked(id); setStreak(nextStreak); setLongest(n => Math.max(n, nextStreak));
    if (right) setScore(n => n + 1);
    Haptics.notificationAsync(right ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
    AccessibilityInfo.announceForAccessibility(`${right ? 'Correct!' : 'Not quite.'} It’s ${nameOf(question.answer)}!`);
    if (reduced) { shade.value = 0; return; }
    shade.value = withTiming(0, { duration: 280 });
    pop.value = withSequence(withTiming(.72, { duration: 110 }), withSpring(1, { duration: 560, dampingRatio: .42 }));
    spin.value = right ? withTiming(360, { duration: 700, easing: Easing.out(Easing.cubic) }) : withSequence(withTiming(-10, { duration: 110 }), withSpring(0, { duration: 500, dampingRatio: .3 }));
    turn.value = withTiming(turn.value + (right ? 60 : 22.5), { duration: 900, easing: Easing.out(Easing.quad) });
  }
  function next() {
    if (index + 1 >= round.questions.length) {
      setDone(true);
      if (score > bestBefore) updateTrainer(t => recordQuizScore(t, score)).catch(() => {});
      AccessibilityInfo.announceForAccessibility(`You got ${score} out of ${round.questions.length}!`);
      return;
    }
    [pop, spin, shade].forEach(cancelAnimation);
    pop.value = 1; spin.value = 0; shade.value = 1;
    setIndex(i => i + 1); setPicked(null); setArt('loading');
    scroll.current?.scrollTo({ y: 0, animated: false });
  }

  if (done) {
    const stars = quizStars(score, round.questions.length);
    const perfect = score === round.questions.length;
    const cheer = perfect ? ['Perfect round!', 'You named every single Pokémon. Amazing eyes!']
      : stars === 3 ? ['Pokémon expert!', 'You spotted almost every shadow.']
      : stars === 2 ? ['Great guessing!', 'Your Pokédex smarts are growing.']
      : ['Nice try, trainer!', 'Every round helps you learn more Pokémon.'];
    return <ScrollView contentContainerStyle={[q.content, { alignItems: 'center' }]}>
      <View style={q.endStage}>
        <Burst tone="win" style={q.burst} />
        <View accessible accessibilityRole="image" accessibilityLabel={`${stars} of 3 stars`} style={q.stars}>{[1, 2, 3].map(n => <View key={n} style={n === 2 && { marginTop: -18 }}><Star on={n <= stars} size={n === 2 ? 64 : 50} /></View>)}</View>
      </View>
      <Txt style={q.score}>{score}<Txt style={q.scoreOf}> / {round.questions.length}</Txt></Txt>
      <Txt accessibilityRole="header" variant="title" style={{ textAlign: 'center' }}>{cheer[0]}</Txt>
      <Txt muted style={{ textAlign: 'center', maxWidth: 320 }}>{cheer[1]}</Txt>
      <View style={[ui.row, { flexWrap: 'wrap', justifyContent: 'center' }]}>
        {score > bestBefore && <View style={[q.pill, q.pillGold]}><Txt style={q.pillText}>New best score!</Txt></View>}
        {score <= bestBefore && bestBefore > 0 && <View style={q.pill}><Txt style={q.pillText}>Your best: {bestBefore}/{QUIZ_LENGTH}</Txt></View>}
        {longest >= 3 && <View style={q.pill}><Txt style={q.pillText}>Longest streak: {longest} in a row</Txt></View>}
      </View>
      {round.fallback && <Txt muted style={q.note}>{FALLBACK_NOTE}</Txt>}
      <ButtonRow style={{ alignSelf: 'stretch', marginTop: S.xs }}><Button title="Play again" onPress={onAgain} /><Button title="Done" secondary onPress={onDone} /></ButtonRow>
    </ScrollView>;
  }

  const name = nameOf(question.answer);
  const uri = speciesImage(question.answer);
  return <ScrollView ref={scroll} onLayout={event => setPanelWidth(event.nativeEvent.layout.width)} contentContainerStyle={q.content}>
    {round.fallback && index === 0 && <Txt muted style={q.note}>{FALLBACK_NOTE}</Txt>}
    <View style={ui.row}>
      <Txt variant="readout" style={q.count}>{index + 1}/{round.questions.length}</Txt>
      <View style={{ flex: 1 }}><Progress value={index + (answered ? 1 : 0)} total={round.questions.length} /></View>
      <View accessible accessibilityLabel={`Score: ${score}`} style={q.scoreChip}><Star on size={18} /><Txt variant="readout" style={{ fontWeight: '600' }}>{score}</Txt></View>
    </View>
    <View accessible accessibilityRole="image" accessibilityLabel={answered ? `It’s ${name}!` : 'A mystery Pokémon shadow. Which Pokémon is it?'} style={[q.stage, { height: stageHeight }]}>
      <Animated.View style={[q.burst, burstStyle]}><Burst tone={answered && correct ? 'win' : 'mystery'} style={StyleSheet.absoluteFill} /></Animated.View>
      {art !== 'ready' && <Txt style={q.mystery}>?</Txt>}
      <Animated.View key={`${index}:${question.answer}`} style={[{ width: artSize, height: artSize }, artStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, colorStyle]}><Image source={uri} style={q.fill} contentFit="contain" cachePolicy="memory-disk" /></Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, shadowStyle]}><Image source={uri} tintColor={SHADOW} style={q.fill} contentFit="contain" cachePolicy="memory-disk" onLoad={() => setArt('ready')} onError={() => setArt('error')} /></Animated.View>
      </Animated.View>
      {answered && <View style={[q.reveal, correct && q.revealWin]}><Txt variant="subtitle" style={{ textAlign: 'center' }}>It’s {name}!</Txt></View>}
    </View>
    {art === 'error' && !answered && <Txt muted style={q.note}>The picture can’t load right now. Take your best guess!</Txt>}
    <View style={[ui.row, { justifyContent: 'center', flexWrap: 'wrap', minHeight: 32 }]}>
      <Txt variant="subtitle" style={{ textAlign: 'center' }}>{!answered ? 'Who’s that Pokémon?' : correct ? 'You got it!' : 'Good try! Now you know this one.'}</Txt>
      {answered && correct && streak >= 2 && <View style={[q.pill, q.pillGold]}><Txt style={q.pillText}>{streak} in a row!</Txt></View>}
    </View>
    <View style={q.choices}>{question.choices.map(id => {
      const option = nameOf(id);
      const state = !answered ? 'idle' : id === question.answer ? 'right' : id === picked ? 'wrong' : 'dim';
      return <Pressable key={id} accessibilityRole="button" accessibilityLabel={state === 'right' ? `${option}, the right answer` : state === 'wrong' ? `${option}, your guess` : option} accessibilityState={{ disabled: answered, selected: id === picked }} disabled={answered} onPress={() => choose(id)} style={({ pressed }) => [q.choice, { flexBasis: singleColumn ? '100%' : '46%' }, state === 'right' && q.right, state === 'wrong' && q.wrong, state === 'dim' && { opacity: .45 }, pressed && { opacity: .75, transform: [{ translateY: 2 }] }]}>
        <Txt variant="control" style={[q.choiceText, (state === 'right' || state === 'wrong') && { color: 'white' }]}>{option}</Txt>
        <View style={q.choiceMark}>{(state === 'right' || state === 'wrong') && <Icon name={state === 'right' ? 'check' : 'close'} color="white" size={16} />}</View>
      </Pressable>;
    })}</View>
    {answered && <Button title={index + 1 < round.questions.length ? 'Next Pokémon' : 'See my score'} onPress={next} />}
  </ScrollView>;
}

const q = StyleSheet.create({
  content: { padding: S.xl, paddingBottom: 26, gap: S.lg }, fill: { width: '100%', height: '100%' },
  note: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
  count: { fontWeight: '600', minWidth: 44 },
  scoreChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minHeight: 32, borderRadius: 16, backgroundColor: '#F7ECCC' },
  stage: { borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#23658C' },
  burst: { position: 'absolute', width: 820, height: 820, left: '50%', top: '50%', marginLeft: -410, marginTop: -410 },
  mystery: { position: 'absolute', fontSize: 96, lineHeight: 110, fontWeight: '900', color: '#FFFFFFB0' },
  reveal: { position: 'absolute', bottom: 10, left: 12, right: 12, alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#FFFFFFE6' },
  revealWin: { backgroundColor: '#FFF8DCF2' },
  pill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: '#DCE6D0' }, pillGold: { backgroundColor: '#F3DB8E' },
  pillText: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: S.sm },
  choice: { flexGrow: 1, maxWidth: '100%', minWidth: 0, minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: S.md, paddingVertical: S.md, gap: S.xs, borderRadius: R.lg, borderWidth: 2, borderBottomWidth: 4, borderColor: '#B8C6AC', backgroundColor: '#FCFDF9' },
  right: { backgroundColor: '#4E9444', borderColor: '#356E2E' }, wrong: { backgroundColor: C.red, borderColor: C.redDark },
  choiceText: { flex: 1, minWidth: 0, fontWeight: '700', textAlign: 'center' },
  // Every choice reserves the same mark space before and after the reveal.
  choiceMark: { width: 16 },
  endStage: { width: '100%', height: 150, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#B98A22' },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  score: { fontFamily: mono, fontSize: 44, lineHeight: 52, fontWeight: '800' }, scoreOf: { fontFamily: mono, fontSize: 22, color: C.muted },
  invite: { backgroundColor: '#D8EAF1', borderRadius: R.lg, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: S.md, padding: S.lg, borderWidth: 1, borderColor: '#B7D3E0' },
  inviteStack: { flexDirection: 'column', alignItems: 'flex-start' },
  inviteCopy: { flex: 1, minWidth: 0 },
  inviteBest: { fontWeight: '600', marginTop: S.sm },
  teaser: { flexShrink: 0 },
  teaserCircle: { flex: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#23658C' },
  teaserBadge: { position: 'absolute', right: 0, top: 4, width: 30, height: 30, borderRadius: 15, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'white' },
});
