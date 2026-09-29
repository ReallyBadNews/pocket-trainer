const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildRound, pickDistractors, quizPool, quizStars, seededRandom, generationOf, shuffle, QUIZ_LENGTH } = require('../.test-build/lib/quiz');
const { freshCollection, parseCollection, portableBackup, mergeBackup, recordQuizScore } = require('../.test-build/lib/model');
const universe = require('../src/data/species.json').map(s => s.id);
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const answers = round => round.questions.map(q => q.answer);

test('the same seed always builds the same round; different seeds shuffle differently', () => {
  const pool = range(1, 60);
  assert.deepEqual(buildRound(pool, { universe, rng: seededRandom(7) }), buildRound(pool, { universe, rng: seededRandom(7) }));
  assert.notDeepEqual(answers(buildRound(pool, { universe, rng: seededRandom(7) })), answers(buildRound(pool, { universe, rng: seededRandom(8) })));
  const rng = seededRandom(1);
  for (let i = 0; i < 1000; i++) { const n = rng(); assert.ok(n >= 0 && n < 1); }
  assert.deepEqual(shuffle([1, 2, 3, 4, 5], seededRandom(3)).sort(), [1, 2, 3, 4, 5]);
});

test('every question has ten answers with four different choices, one of them correct', () => {
  for (let seed = 0; seed < 50; seed++) {
    const round = buildRound([25, 4, 7, 1, 133, 152, 700, 906, 1025], { universe, rng: seededRandom(seed) });
    assert.equal(round.questions.length, QUIZ_LENGTH);
    for (const { answer, choices } of round.questions) {
      assert.equal(choices.length, 4);
      assert.equal(new Set(choices).size, 4);
      assert.equal(choices.filter(id => id === answer).length, 1);
      assert.ok(choices.every(id => universe.includes(id)));
    }
  }
});

test('distractors come from the same generation and a nearby Pokédex range', () => {
  for (let seed = 0; seed < 30; seed++) {
    const rng = seededRandom(seed);
    for (const answer of [1, 25, 151, 152, 251, 494, 906, 1025]) {
      const picks = pickDistractors(answer, universe, rng);
      assert.equal(picks.length, 3);
      assert.ok(!picks.includes(answer));
      assert.ok(picks.every(id => generationOf(id) === generationOf(answer)), `${answer}: ${picks}`);
      assert.ok(picks.every(id => Math.abs(id - answer) <= 40), `${answer}: ${picks}`);
    }
  }
  assert.equal(generationOf(151), 1); assert.equal(generationOf(152), 2); assert.equal(generationOf(1025), 9);
});

test('small or odd catalogs still give three unique distractors, preferring the nearest numbers', () => {
  const picks = pickDistractors(1, [1, 1, 2, 2, 152, 153, 400, 0, -3, 1.5], seededRandom(2));
  assert.deepEqual(picks.slice().sort((a, b) => a - b), [2, 152, 153]);
  assert.equal(picks[0], 2);
});

test('fewer than four discovered Pokémon falls back to the original 151', () => {
  for (const discovered of [[], [25], [25, 133, 700]]) {
    const round = buildRound(discovered, { universe, rng: seededRandom(4) });
    assert.equal(round.fallback, true);
    assert.ok(answers(round).every(id => id >= 1 && id <= 151));
  }
  const own = buildRound([25, 133, 700, 906], { universe, rng: seededRandom(4) });
  assert.equal(own.fallback, false);
  assert.ok(answers(own).every(id => [25, 133, 700, 906].includes(id)));
  // Unknown species numbers never become questions.
  assert.deepEqual(quizPool([25, 133, 700, 9999, 0, -1, 2.5], universe), { ids: range(1, 151), fallback: true });
});

test('answers do not repeat until the pool is used up, across rounds too', () => {
  const pool = range(200, 224);
  const rng = seededRandom(11);
  const first = buildRound(pool, { universe, rng });
  const second = buildRound(pool, { universe, rng, seen: first.seen });
  const third = buildRound(pool, { universe, rng, seen: second.seen });
  const all = [...answers(first), ...answers(second), ...answers(third)];
  assert.equal(new Set(all.slice(0, 25)).size, 25);
  // The pool runs out mid-round; the new cycle still avoids Pokémon already shown in this round.
  assert.equal(new Set(answers(third)).size, 10);
  assert.equal(third.seen.length, 5);
  // Seen answers from other pools are ignored.
  assert.equal(buildRound(pool, { universe, rng, seen: [1, 2, 3] }).questions.length, 10);
});

test('a tiny pool cycles through every Pokémon before repeating, never twice in a row', () => {
  for (let seed = 0; seed < 40; seed++) {
    const round = answers(buildRound([10, 20, 30, 40], { universe, rng: seededRandom(seed) }));
    assert.equal(new Set(round.slice(0, 4)).size, 4);
    assert.equal(new Set(round.slice(4, 8)).size, 4);
    for (let i = 1; i < round.length; i++) assert.notEqual(round[i], round[i - 1]);
  }
});

test('stars reward every finished round', () => {
  assert.deepEqual([0, 4, 5, 7, 8, 10].map(n => quizStars(n)), [1, 1, 2, 2, 3, 3]);
});

test('each trainer keeps a best quiz score that survives backups and ignores bad values', () => {
  let trainer = freshCollection().trainers[0];
  assert.equal(recordQuizScore(trainer, 0), trainer);
  trainer = recordQuizScore(trainer, 7);
  assert.equal(recordQuizScore(trainer, 5).quizBest, 7);
  assert.equal(recordQuizScore(trainer, 9).quizBest, 9);
  for (const bad of [-1, 11, 2.5, NaN]) assert.throws(() => recordQuizScore(trainer, bad));
  const collection = { ...freshCollection(), trainers: [trainer] };
  const restored = parseCollection(portableBackup(collection));
  assert.equal(restored.trainers[0].quizBest, 7);
  assert.equal(mergeBackup(collection, restored, 'test').trainers[1].quizBest, 7);
  assert.equal(parseCollection(JSON.stringify(freshCollection())).trainers[0].quizBest, undefined);
  for (const bad of [99, -2, 3.5, '8', null]) {
    const raw = JSON.stringify({ ...collection, trainers: [{ ...trainer, quizBest: bad }] });
    assert.equal(parseCollection(raw).trainers[0].quizBest, undefined);
  }
});
