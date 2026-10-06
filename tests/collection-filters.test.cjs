const { test } = require('node:test');

const assert = require('node:assert/strict');

const {
  BINDER_SHOWS,
  DEFAULT_BINDER_FILTERS,
  activeBinderFilters,
  binderFilterCounts,
  browseSets,
  defaultSetShow,
  matchesBinderFilters,
  matchesBinderQuery,
  routeSet,
} = require('../.test-build/lib/collection-filters');

const { CARD_FILTERS } = require('../.test-build/lib/card-kind');

const { catalogSet, allCards } = require('../.test-build/lib/catalog');

const { freshCollection, addCard } = require('../.test-build/lib/model');

const card = (id, name, overrides = {}) => ({
  id,
  localId: id.split('-').pop(),
  name,
  language: 'en',
  set: { id: id.slice(0, id.lastIndexOf('-')), name: 'Test Set', total: 100 },
  dexIds: [],
  types: [],
  category: 'Pokemon',
  rarity: 'Common',
  finishes: ['normal', 'holo'],
  ...overrides,
});

const pikachu = card('t1-25', 'Pikachu', { dexIds: [25] });

const pikachuJa = card('t1-26', 'Pikachu', { language: 'ja', dexIds: [25] });

const potion = card('t1-80', 'Potion', { category: 'Trainer', trainerType: 'Item' });

const stadium = card('t1-81', 'Pokémon Center', { category: 'Trainer', trainerType: 'Stadium', language: 'ko' });

const energy = card('t1-90', 'Lightning Energy', { category: 'Energy' });

const tagTeam = card('t1-50', 'Pikachu & Zekrom-GX', { tagTeam: true, dexIds: [25, 644] });

function binder() {
  let t = freshCollection().trainers[0];
  t = addCard(t, pikachu, 'unsure', 2);
  t = addCard(t, pikachu, 'holo', 1);
  t = addCard(t, pikachuJa, 'normal', 1);
  t = addCard(t, potion, 'unsure', 1);
  t = addCard(t, stadium, 'normal', 3);
  t = addCard(t, energy, 'normal', 1);
  t = addCard(t, tagTeam, 'unsure', 1);

  // Favorite the holo Pikachu and the Stadium.
  return {
    ...t,
    entries: t.entries.map((e) => ({ ...e, favorite: e.key.includes('holo') || e.card.id === stadium.id })),
  };
}

// The Binder's own filter, used as the reference for every count.
const shown = (entries, filters, query) =>
  entries.filter((e) => matchesBinderFilters(e, filters) && matchesBinderQuery(e, query)).length;

test('with no filters each choice counts the entries it would show', () => {
  const { entries } = binder();
  const counts = binderFilterCounts(entries, DEFAULT_BINDER_FILTERS);
  assert.equal(counts.total, 7);
  assert.deepEqual(counts.show, { 'All cards': 7, Favorites: 2, Doubles: 2, Japanese: 1, Korean: 1, Chinese: 0 });
  assert.deepEqual(counts.kind, { all: 7, pokemon: 4, trainer: 2, item: 1, energy: 1, tagteam: 1, stadium: 1 });
  assert.deepEqual(counts.printing, { all: 7, needs: 3 });
});

test('each section holds the other filters and the search constant', () => {
  const { entries } = binder();
  const counts = binderFilterCounts(entries, { show: 'All cards', kind: 'pokemon', needsPrinting: true }, 'pika');
  // Only Pokémon cards that need a printing and match "pika": the unsure Pikachu and the TAG TEAM.
  assert.equal(counts.total, 2);
  assert.equal(counts.show.Doubles, 1);
  assert.equal(counts.show.Japanese, 0);
  // Card kinds keep "needs printing" and the search: the Potion is unsure but isn't a Pikachu.
  assert.equal(counts.kind.all, 2);
  assert.equal(counts.kind.trainer, 0);
  assert.equal(counts.kind.tagteam, 1);
  // Printing keeps the kind and search, but not its own choice.
  assert.deepEqual(counts.printing, { all: 4, needs: 2 });
});

test('every count agrees with what the Binder would show for that choice', () => {
  const { entries } = binder();

  for (const query of ['', 'pika', 'center', 'nothing here'])
    for (const show of BINDER_SHOWS)
      for (const { id: kind } of CARD_FILTERS)
        for (const needsPrinting of [false, true]) {
          const filters = { show, kind, needsPrinting };
          const counts = binderFilterCounts(entries, filters, query);
          assert.equal(counts.total, shown(entries, filters, query));

          for (const option of BINDER_SHOWS)
            assert.equal(
              counts.show[option],
              shown(entries, { ...filters, show: option }, query),
              `${option} under ${JSON.stringify(filters)} "${query}"`,
            );

          for (const { id } of CARD_FILTERS)
            assert.equal(counts.kind[id], shown(entries, { ...filters, kind: id }, query));
          assert.equal(counts.printing.all, shown(entries, { ...filters, needsPrinting: false }, query));
          assert.equal(counts.printing.needs, shown(entries, { ...filters, needsPrinting: true }, query));
        }

  assert.equal(activeBinderFilters({ show: 'Doubles', kind: 'energy', needsPrinting: true }), 3);
});

const set = (name, owned, official, overrides = {}) => ({
  key: `en:${name}`,
  language: 'en',
  setId: name.toLowerCase().replace(/\s+/g, ''),
  name,
  owned,
  official,
  bonus: 0,
  complete: owned >= official,
  ...overrides,
});

// Closest to finishing first, as setProgress returns them.
const sets = [
  set('Jungle', 64, 64),
  set('Fossil', 60, 62),
  set('Base Set', 50, 102),
  set('Team Rocket', 3, 83),
  set('Pokémon Card 151', 3, 165, { key: 'ja:SV2a', language: 'ja', setId: 'SV2a' }),
];

test('sets filter by progress, search by name, code or language, and sort with stable ties', () => {
  const names = (list) => list.map((s) => s.name);
  assert.deepEqual(names(browseSets(sets, { show: 'progress', sort: 'closest', query: '' })), [
    'Fossil',
    'Base Set',
    'Team Rocket',
    'Pokémon Card 151',
  ]);
  assert.deepEqual(names(browseSets(sets, { show: 'complete', sort: 'closest', query: '' })), ['Jungle']);
  assert.deepEqual(names(browseSets(sets, { show: 'all', sort: 'name', query: '' })), [
    'Base Set',
    'Fossil',
    'Jungle',
    'Pokémon Card 151',
    'Team Rocket',
  ]);
  // Team Rocket and 151 tie on 3 cards; the closer set stays first.
  assert.deepEqual(names(browseSets(sets, { show: 'all', sort: 'collected', query: '' })), [
    'Jungle',
    'Fossil',
    'Base Set',
    'Team Rocket',
    'Pokémon Card 151',
  ]);
  assert.deepEqual(names(browseSets(sets, { show: 'all', sort: 'closest', query: 'japanese' })), ['Pokémon Card 151']);
  assert.deepEqual(names(browseSets(sets, { show: 'all', sort: 'closest', query: 'sv2a' })), ['Pokémon Card 151']);
  assert.deepEqual(names(browseSets(sets, { show: 'all', sort: 'closest', query: 'pokemon 151' })), [
    'Pokémon Card 151',
  ]);
  assert.deepEqual(names(browseSets(sets, { show: 'all', sort: 'closest', query: 'team  rock' })), ['Team Rocket']);
  assert.equal(browseSets(sets, { show: 'all', sort: 'closest', query: 'zzz' }).length, 0);
  assert.equal(sets[0].name, 'Jungle', 'the input order is untouched');
  assert.equal(defaultSetShow(sets), 'progress');
  assert.equal(defaultSetShow([sets[0]]), 'all');
  assert.equal(defaultSetShow([]), 'all');
});

const brief = (language, id) => allCards.find((c) => c.language === language && c.id === id);

const saved = (b, total) => ({
  ...b,
  set: { id: b.id.slice(0, b.id.lastIndexOf('-')), name: 'Saved name', total },
  dexIds: [],
  types: [],
  category: 'Pokemon',
  rarity: 'Common',
  finishes: ['normal'],
});

test('set links find started sets, empty catalog sets, and nothing else', () => {
  let trainer = freshCollection().trainers[0];
  trainer = addCard(trainer, saved(brief('en', 'sv03.5-001'), 165), 'normal', 1);
  trainer = addCard(trainer, saved(brief('en', 'sv03.5-004'), 165), 'normal', 1);
  assert.deepEqual(routeSet(trainer, 'en', 'sv03.5', catalogSet), {
    key: 'en:sv03.5',
    language: 'en',
    setId: 'sv03.5',
    name: '151',
    owned: 2,
    official: 165,
    bonus: 0,
    complete: false,
  });
  // Manual set codes are upper case; they still reach the catalog set.
  assert.equal(routeSet(trainer, 'en', 'SV03.5', catalogSet)?.owned, 2);
  const base = routeSet(trainer, 'en', 'base1', catalogSet);
  assert.deepEqual(base, {
    key: 'en:base1',
    language: 'en',
    setId: 'base1',
    name: 'Base Set',
    owned: 0,
    official: 102,
    bonus: 0,
    complete: false,
  });
  assert.equal(routeSet(trainer, 'en', 'no-such-set', catalogSet), undefined);
  assert.equal(routeSet(trainer, 'xx', 'base1', catalogSet), undefined);
  assert.equal(routeSet(trainer, 'en', undefined, catalogSet), undefined);
  // Open-ended promo runs have no size to finish.
  assert.equal(routeSet(trainer, 'en', 'P-A', catalogSet), undefined);
});
