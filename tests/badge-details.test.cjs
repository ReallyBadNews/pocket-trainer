const { test } = require('node:test');
const assert = require('node:assert/strict');
const { findBadge, badgeStatus, badgeMeter, speciesGoals, filterGoals, goalCounts, languageCards, speciesColumns } = require('../.test-build/lib/badge-details');
const { freshCollection, addCard, discoveredIds } = require('../.test-build/lib/model');

const empty = () => freshCollection().trainers[0];
const card = (id, overrides = {}) => ({
  id: `test-${id}`, localId: String(id), name: 'Test card', language: 'en', set: { id: 'test', name: 'Test set', total: 1025 },
  dexIds: [id], types: [], category: 'Pokemon', rarity: 'Common', finishes: ['normal', 'holo'], ...overrides,
});
const collect = (ids, trainer = empty()) => ids.reduce((t, id) => addCard(t, card(id), 'normal', 1), trainer);
const status = (trainer, id, sets = []) => badgeStatus(trainer, findBadge(id), discoveredIds(trainer), sets);
const set = (owned, official, extra = {}) => ({ key: `en:s${official}`, language: 'en', setId: `s${official}`, name: `Set ${official}`, owned, official, bonus: 0, complete: owned >= official, ...extra });

test('findBadge resolves known ids and rejects anything else', () => {
  assert.equal(findBadge('eevee-family').name, 'The Eevee family');
  assert.equal(findBadge('not-a-badge'), undefined);
  assert.equal(findBadge(undefined), undefined);
  assert.equal(findBadge(['eevee-family']), undefined);
});

test('species-set badges list their Pokémon in order with collected flags and filter counts', () => {
  const trainer = collect([144, 146]);
  const goals = speciesGoals(findBadge('legendary-birds'), discoveredIds(trainer));
  assert.deepEqual(goals, [{ id: 144, owned: true }, { id: 145, owned: false }, { id: 146, owned: true }]);
  assert.deepEqual(goalCounts(goals), { all: 3, todo: 1, owned: 2 });
  assert.deepEqual(filterGoals(goals, 'todo').map(g => g.id), [145]);
  assert.deepEqual(filterGoals(goals, 'owned').map(g => g.id), [144, 146]);
  assert.equal(filterGoals(goals, 'all').length, 3);
  assert.deepEqual(speciesGoals(findBadge('first'), discoveredIds(trainer)), []);
});

test('meters describe progress and what is left for each kind of badge', () => {
  const trainer = collect([144, 146]);
  const birds = status(trainer, 'legendary-birds');
  assert.deepEqual(birds, { progress: 2, earned: false, closest: undefined });
  assert.deepEqual(badgeMeter(findBadge('legendary-birds'), birds), { value: 2, total: 3, label: '2 of 3 Pokémon', left: '1 more Pokémon to find' });
  assert.equal(badgeMeter(findBadge('ten'), status(trainer, 'ten')).left, '8 more Pokémon to discover');
  assert.equal(badgeMeter(findBadge('hundred'), status(trainer, 'hundred')).left, '98 more cards to collect');
  assert.equal(badgeMeter(findBadge('world'), status(trainer, 'world')).left, 'Find cards in 1 more language');
  const first = badgeMeter(findBadge('first'), status(trainer, 'first'));
  assert.deepEqual(first, { value: 1, total: 1, label: '1 of 1 Pokémon' });
});

test('Set master follows the closest unfinished set until one is finished', () => {
  const trainer = empty();
  const none = status(trainer, 'set-master');
  assert.equal(none.earned, false);
  assert.deepEqual(badgeMeter(findBadge('set-master'), none), { value: 0, total: 1, label: 'Add a card to start your first set' });

  const sets = [set(90, 100), set(10, 165)];
  const close = status(trainer, 'set-master', sets);
  assert.equal(close.closest, sets[0]);
  assert.deepEqual(badgeMeter(findBadge('set-master'), close), { value: 90, total: 100, label: 'Set 100: 90 of 100', left: '10 more cards to finish it' });

  const done = status(trainer, 'set-master', [set(102, 102), set(1, 64)]);
  assert.deepEqual(done, { progress: 1, earned: true, closest: undefined });
  assert.equal(badgeMeter(findBadge('set-master'), done).left, undefined);
});

test('languageCards counts copies per language and lists languages not collected yet', () => {
  let trainer = addCard(empty(), card(25), 'normal', 3);
  trainer = addCard(trainer, card(25, { id: 'jp-25', language: 'ja' }), 'holo', 1);
  const counts = Object.fromEntries(languageCards(trainer).map(l => [l.language, l.cards]));
  assert.deepEqual(counts, { en: 3, ja: 1, ko: 0, 'zh-cn': 0, 'zh-tw': 0 });
  assert.equal(status(trainer, 'world').earned, true);
});

test('species grid fits three on a phone and two at large text sizes', () => {
  assert.equal(speciesColumns(310, 1), 3);
  assert.equal(speciesColumns(310, 1.2), 2);
  assert.equal(speciesColumns(310, 3), 2);
  assert.equal(speciesColumns(700, 1), 5);
  assert.equal(speciesColumns(560, 1), 4);
});
