const { test } = require('node:test');
const assert = require('node:assert/strict');
const { seededRandom, createChallenge, isGrownUpAnswer, answerChallenge, pressPadKey, ANSWER_MAX_DIGITS } = require('../.test-build/lib/grown-up');

const challenges = (seed, count) => { const rng = seededRandom(seed); return Array.from({ length: count }, () => createChallenge(rng)); };

test('the same seed asks the same questions', () => {
  assert.deepEqual(challenges(7, 20), challenges(7, 20));
  assert.notDeepEqual(challenges(7, 20), challenges(8, 20));
});
test('questions are two-digit × one-digit with a carry', () => {
  for (const c of challenges(1, 2000)) {
    assert.ok(c.left >= 13 && c.left <= 49 && c.left % 10 >= 3, `left ${c.left}`);
    assert.ok(c.right >= 6 && c.right <= 9, `right ${c.right}`);
    assert.equal(c.answer, c.left * c.right);
    assert.equal(c.prompt, `${c.left} × ${c.right}`);
    assert.equal(c.spoken, `What is ${c.left} times ${c.right}?`);
    assert.ok(String(c.answer).length <= ANSWER_MAX_DIGITS);
  }
});
test('answers are spread widely enough that repeating one guess rarely works', () => {
  const answers = challenges(42, 5000).map(c => c.answer);
  const counts = new Map();
  for (const a of answers) counts.set(a, (counts.get(a) ?? 0) + 1);
  assert.ok(counts.size >= 90, `only ${counts.size} different answers`);
  assert.ok(Math.max(...counts.values()) / answers.length < .04);
});
test('only the exact number passes', () => {
  const c = createChallenge(seededRandom(3));
  assert.ok(isGrownUpAnswer(c, String(c.answer)));
  assert.ok(isGrownUpAnswer(c, ` ${c.answer} `));
  for (const input of ['', ' ', String(c.answer + 1), String(c.answer - 1), `+${c.answer}`, `${c.answer}.0`, `0${c.answer}`, '1e2', 'abc', String(c.left), String(c.right)]) {
    assert.equal(isGrownUpAnswer(c, input), false, input);
  }
});
test('a wrong answer brings a new question with a different answer; a right one passes', () => {
  const rng = seededRandom(11);
  let c = createChallenge(rng);
  assert.deepEqual(answerChallenge(c, String(c.answer), rng), { passed: true });
  for (let i = 0; i < 500; i++) {
    const result = answerChallenge(c, '1', rng);
    assert.equal(result.passed, false);
    assert.notEqual(result.next.answer, c.answer);
    c = result.next;
  }
  // Even a broken random source can't hand back the question that was just missed.
  const stuck = () => 0;
  const first = createChallenge(stuck);
  const retry = answerChallenge(first, '', stuck);
  assert.equal(retry.passed, false); assert.notEqual(retry.next.answer, first.answer);
});
test('the number pad types digits, deletes, and stops at the longest answer', () => {
  let value = '';
  for (const key of ['0', '1', '6', '1', '9']) value = pressPadKey(value, key);
  assert.equal(value, '161');
  assert.equal(pressPadKey(value, 'back'), '16');
  assert.equal(pressPadKey('', 'back'), '');
  assert.equal(pressPadKey('1', 'x'), '1');
});
