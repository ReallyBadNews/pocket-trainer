/**
 * Grown-up check: a multiplication an adult can do in their head, typed on a number pad.
 * Two-digit × one-digit with carrying is past what most 8–9 year olds do mentally, and a typed
 * answer (about 100 possible values) can't be won by tapping one of four choices at random.
 * Number words ("forty-seven") were skipped because a confident reader can type them straight back.
 */
export type Rng = () => number;

export type GrownUpChallenge = { left: number; right: number; answer: number; prompt: string; spoken: string };

export type PadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'back';

export type GrownUpResult = { passed: true } | { passed: false; next: GrownUpChallenge };

/** Tens 1–4 and ones 3–9 force a carry; × 6–9 keeps the easy 2× and 5× tables out. */
export const GROWN_UP_RANGE = { tens: [1, 4], ones: [3, 9], right: [6, 9] } as const;

export const ANSWER_MAX_DIGITS = String(
  (GROWN_UP_RANGE.tens[1] * 10 + GROWN_UP_RANGE.ones[1]) * GROWN_UP_RANGE.right[1],
).length;

/** mulberry32: tiny, seedable and good enough to pick quiz numbers. */
export function seededRandom(seed: number): Rng {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng: Rng, [min, max]: readonly [number, number]) =>
  Math.min(max, min + Math.floor(Math.max(0, rng()) * (max - min + 1)));

const challenge = (left: number, right: number): GrownUpChallenge => ({
  left,
  right,
  answer: left * right,
  prompt: `${left} × ${right}`,
  spoken: `What is ${left} times ${right}?`,
});

/** A retry never repeats the previous answer, so guessing it again can't slip through. */
export function createChallenge(rng: Rng = Math.random, previous?: GrownUpChallenge): GrownUpChallenge {
  const left = pick(rng, GROWN_UP_RANGE.tens) * 10 + pick(rng, GROWN_UP_RANGE.ones);
  let right = pick(rng, GROWN_UP_RANGE.right);

  if (previous && left * right === previous.answer)
    right = right === GROWN_UP_RANGE.right[1] ? GROWN_UP_RANGE.right[0] : right + 1;

  return challenge(left, right);
}

/** Digits only: "1e2", "+161" and "161.0" are not answers. */
export function isGrownUpAnswer(current: GrownUpChallenge, input: string): boolean {
  const text = input.trim();

  return new RegExp(`^\\d{1,${ANSWER_MAX_DIGITS}}$`).test(text) && Number(text) === current.answer;
}

export function answerChallenge(current: GrownUpChallenge, input: string, rng: Rng = Math.random): GrownUpResult {
  return isGrownUpAnswer(current, input) ? { passed: true } : { passed: false, next: createChallenge(rng, current) };
}

export function pressPadKey(value: string, key: PadKey): string {
  if (key === 'back') return value.slice(0, -1);

  if (!/^\d$/.test(key) || value.length >= ANSWER_MAX_DIGITS || (!value && key === '0')) return value;

  return value + key;
}
