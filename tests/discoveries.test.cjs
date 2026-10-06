const { test } = require('node:test');

const assert = require('node:assert/strict');

const { recentDiscoveries, discoveredOn, regionProgress, regionRange } = require('../.test-build/lib/discoveries');

const { REGIONS } = require('../.test-build/lib/collection-filters');

// Local calendar times, so the day labels hold in any time zone.
const at = (day, hour = 12, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();

let serial = 0;

const entry = (dexIds, addedAt, category = 'Pokemon') => {
  serial += 1;

  return {
    key: `en:card-${serial}:normal`,
    addedAt,
    finish: 'normal',
    quantity: 1,
    favorite: false,
    card: {
      id: `card-${serial}`,
      localId: String(serial),
      name: `Card ${serial}`,
      language: 'en',
      category,
      dexIds,
      types: [],
      rarity: 'Common',
      finishes: ['normal'],
      set: { id: 'set', name: 'Set', total: 100 },
    },
  };
};

const ids = (list) => list.map((d) => d.id);

test('recent discoveries are ordered by when each Pokémon was first found', () => {
  // Saved newest first, like addCard does.
  const entries = [entry([25], at(5, 9)), entry([4], at(4)), entry([1], at(3)), entry([25], at(2))];
  assert.deepEqual(recentDiscoveries(entries), [
    { id: 4, at: at(4) },
    { id: 1, at: at(3) },
    { id: 25, at: at(2) },
  ]);
});

test('trainer and energy cards are not discoveries, and repeated species count once', () => {
  const entries = [entry([150], at(5), 'Trainer'), entry([], at(5), 'Energy'), entry([7, 7], at(4)), entry([7], at(3))];
  assert.deepEqual(ids(recentDiscoveries(entries)), [7]);
  assert.deepEqual(recentDiscoveries([]), []);
});

test('the list stops at the limit, newest first', () => {
  const entries = Array.from({ length: 12 }, (_, i) => entry([i + 1], at(1, i + 1))).reverse();
  assert.deepEqual(ids(recentDiscoveries(entries)), [12, 11, 10, 9, 8, 7, 6, 5]);
  assert.deepEqual(ids(recentDiscoveries(entries, 3)), [12, 11, 10]);
  assert.deepEqual(recentDiscoveries(entries, 0), []);
});

test('cards saved in the same moment keep the order they were added, and a card with two Pokémon keeps its order', () => {
  const same = at(5, 10);
  // A page scan saves several cards at once: the first entry is the newest.
  const entries = [entry([6], same), entry([25, 644], same), entry([3], same)];
  assert.deepEqual(ids(recentDiscoveries(entries)), [6, 25, 644, 3]);
});

test('an unreadable date sorts as the oldest', () => {
  const entries = [entry([1], 'not a date'), entry([2], at(1))];
  assert.deepEqual(ids(recentDiscoveries(entries)), [2, 1]);
});

test('discovery dates read as today, yesterday or a short date', () => {
  const now = new Date(2026, 9, 5, 8, 30);
  assert.equal(discoveredOn(at(5, 0, 5), now), 'Today');
  assert.equal(discoveredOn(at(5, 23), now), 'Today', 'a clock that is a little behind still says today');
  assert.equal(discoveredOn(at(4, 23, 59), now), 'Yesterday');
  assert.equal(discoveredOn(at(3, 1), now), 'Oct 3');
  assert.equal(discoveredOn(new Date(2025, 11, 31, 12).toISOString(), now), 'Dec 31, 2025');
  assert.equal(discoveredOn('nope', now), '');
});

test('region progress counts discovered Pokémon by National Pokédex number', () => {
  const regions = regionProgress([1, 151, 152, 25, 25, 1025, 0, 2000]);
  assert.deepEqual(
    regions.map((r) => r.id),
    REGIONS.map((r) => r.id),
  );

  const kanto = regions[0],
    johto = regions[1],
    paldea = regions[8];

  assert.deepEqual([kanto.discovered, kanto.total, kanto.complete], [3, 151, false]);
  assert.deepEqual([johto.discovered, johto.total], [1, 100]);
  assert.deepEqual([paldea.discovered, paldea.total], [1, 120]);
  assert.equal(
    regions.reduce((n, r) => n + r.total, 0),
    1025,
  );
  assert.ok(regions.every((r) => !r.active));
});

test('a region with every Pokémon found is complete, and the shown region is active', () => {
  const johto = Array.from({ length: 100 }, (_, i) => 152 + i);
  const regions = regionProgress(new Set(johto), 'johto');
  assert.deepEqual(
    regions.filter((r) => r.complete).map((r) => r.id),
    ['johto'],
  );
  assert.deepEqual(
    regions.filter((r) => r.active).map((r) => r.id),
    ['johto'],
  );
  assert.ok(regionProgress(johto, 'discovered').every((r) => !r.active));
});

test('region ranges use three digit Pokédex numbers', () => {
  assert.equal(regionRange(REGIONS[0]), '#001–#151');
  assert.equal(regionRange(REGIONS[8]), '#906–#1025');
});
