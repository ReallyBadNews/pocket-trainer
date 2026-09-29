export const QUIZ_LENGTH = 10;
export const QUIZ_CHOICES = 4;
export const KANTO_IDS: readonly number[] = Array.from({ length: 151 }, (_, i) => i + 1);
/** First Pokédex number of each generation, Kanto through Paldea. */
export const GENERATION_STARTS = [1, 152, 252, 387, 494, 650, 722, 810, 906] as const;
// Distractors this close in number (and in the same generation) usually share a region, era and art style.
const NEARBY = 40;

export type Rng = () => number;
export type QuizQuestion = { answer: number; choices: number[] };
/** `seen` holds answers asked since the pool was last used up; pass it to the next round. */
export type QuizRound = { questions: QuizQuestion[]; fallback: boolean; seen: number[] };

export const generationOf = (id: number) => GENERATION_STARTS.filter(start => id >= start).length;

/** mulberry32: tiny, fast and good enough for shuffling. The same seed always gives the same round. */
export function seededRandom(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const validIds = (ids: Iterable<number>) => [...new Set([...ids].filter(id => Number.isInteger(id) && id > 0))];

/** Nearby same-generation names first, then the rest of that generation, then the closest numbers anywhere. */
export function pickDistractors(answer: number, universe: Iterable<number>, rng: Rng, count = QUIZ_CHOICES - 1): number[] {
  const others = validIds(universe).filter(id => id !== answer);
  const generation = generationOf(answer);
  const sameGeneration = others.filter(id => generationOf(id) === generation);
  const tiers = [
    shuffle(sameGeneration.filter(id => Math.abs(id - answer) <= NEARBY), rng),
    shuffle(sameGeneration, rng),
    others.sort((a, b) => Math.abs(a - answer) - Math.abs(b - answer) || a - b),
  ];
  const picked: number[] = [];
  for (const tier of tiers) for (const id of tier) if (picked.length < count && !picked.includes(id)) picked.push(id);
  return picked;
}

/** A trainer's own Pokémon when there are enough for four different choices; otherwise the original 151. */
export function quizPool(discovered: Iterable<number>, universe: Iterable<number>): { ids: number[]; fallback: boolean } {
  const known = new Set(validIds(universe));
  const own = validIds(discovered).filter(id => known.has(id));
  return own.length >= QUIZ_CHOICES ? { ids: own, fallback: false } : { ids: KANTO_IDS.filter(id => known.has(id)), fallback: true };
}

/** Answers are drawn like cards from a bag: none repeats, across rounds too, until every Pokémon in the pool has had a turn. */
export function buildRound(discovered: Iterable<number>, { universe, rng = Math.random, seen = [], length = QUIZ_LENGTH }: { universe: Iterable<number>; rng?: Rng; seen?: Iterable<number>; length?: number }): QuizRound {
  const known = validIds(universe);
  const { ids, fallback } = quizPool(discovered, known);
  if (known.length < QUIZ_CHOICES || !ids.length) throw new Error('Not enough Pokémon to play.');
  const asked = new Set([...seen].filter(id => ids.includes(id)));
  let bag = shuffle(ids.filter(id => !asked.has(id)), rng);
  const questions: QuizQuestion[] = [];
  while (questions.length < length) {
    if (!bag.length) {
      asked.clear();
      // The new cycle starts with Pokémon this round hasn't shown, and never with the one just shown.
      const shown = new Set(questions.map(item => item.answer));
      bag = [...shuffle(ids.filter(id => !shown.has(id)), rng), ...shuffle(ids.filter(id => shown.has(id)), rng)];
      if (bag.length > 1 && bag[0] === questions.at(-1)?.answer) bag.push(bag.shift()!);
    }
    const answer = bag.shift()!;
    asked.add(answer);
    questions.push({ answer, choices: shuffle([answer, ...pickDistractors(answer, known, rng)], rng) });
  }
  return { questions, fallback, seen: [...asked] };
}

/** Always at least one star: every finished round deserves one. */
export const quizStars = (score: number, total = QUIZ_LENGTH) => score >= total * .8 ? 3 : score >= total * .5 ? 2 : 1;
