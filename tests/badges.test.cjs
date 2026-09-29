const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BADGES, badgeProgress, freshCollection, addCard, updateQuantity, portableBackup, parseCollection } = require('../.test-build/lib/model');
const species = require('../src/data/species.json');

const badge = id => {
  const found = BADGES.find(b => b.id === id);
  assert.ok(found, `Missing badge: ${id}`);
  return found;
};
const card = (id, overrides = {}) => ({
  id: `test-${id}`, localId: String(id), name: species.find(s => s.id === id)?.en ?? 'Test card',
  language: 'en', set: { id: 'test', name: 'Test set', total: 1025 },
  dexIds: [id], types: [], category: 'Pokemon', rarity: 'Common', finishes: ['normal', 'holo'], ...overrides,
});
const collect = ids => ids.reduce((trainer, id) => addCard(trainer, card(id), 'normal', 1), freshCollection().trainers[0]);
const regions = [
  ['kanto', 1], ['johto', 152], ['hoenn', 252], ['sinnoh', 387], ['unova', 495],
  ['kalos', 650], ['alola', 722], ['galar', 810], ['paldea', 906],
];

test('badge requirements contain unique, known species and reachable targets', () => {
  const known = new Set(species.map(s => s.id));
  assert.equal(new Set(BADGES.map(b => b.id)).size, BADGES.length);
  for (const b of BADGES) {
    assert.ok(b.target > 0);
    assert.equal(badgeProgress(freshCollection().trainers[0], b), 0);
    if (b.kind !== 'species-set') continue;
    assert.equal(b.target, new Set(b.speciesIds).size, b.id);
    assert.ok(b.speciesIds.every(id => known.has(id)), b.id);
  }
});

for (const [region, start] of regions) {
  test(`${region} starter squad requires all nine species, including every middle evolution`, () => {
    const b = badge(`starters-${region}`);
    const expected = Array.from({ length: 9 }, (_, i) => start + i);
    assert.deepEqual(b.speciesIds, expected);
    assert.equal(badgeProgress(collect([start, start + 3, start + 6]), b), 3);
    for (const missing of expected) {
      assert.equal(badgeProgress(collect(expected.filter(id => id !== missing)), b), 8);
    }
    assert.equal(badgeProgress(collect(expected), b), 9);
  });
}

test('First partners and Starter master distinguish base starters from full families', () => {
  const bases = regions.flatMap(([, start]) => [start, start + 3, start + 6]);
  const families = regions.flatMap(([, start]) => Array.from({ length: 9 }, (_, i) => start + i));
  assert.equal(badge('first-partners').target, 27);
  assert.equal(badge('starter-master').target, 81);
  assert.equal(badgeProgress(collect(bases), badge('first-partners')), 27);
  assert.equal(badgeProgress(collect(bases), badge('starter-master')), 27);
  assert.equal(badgeProgress(collect(families.slice(0, -1)), badge('starter-master')), 80);
  assert.equal(badgeProgress(collect(families), badge('starter-master')), 81);
  assert.equal(badgeProgress(collect([25, 133, 151]), badge('starter-master')), 0);
});

test('copies, printings, languages and forms count only once per required species', () => {
  let trainer = collect([1]);
  trainer = addCard(trainer, card(1), 'normal', 99);
  trainer = addCard(trainer, card(1), 'holo', 1);
  trainer = addCard(trainer, card(1, { language: 'ja', name: 'フシギダネ' }), 'normal', 1);
  trainer = addCard(trainer, card(1, { id: 'alternate-1' }), 'normal', 1);
  trainer = addCard(trainer, card(2, { language: 'ko' }), 'normal', 1);
  assert.equal(badgeProgress(trainer, badge('starters-kanto')), 2);
  assert.equal(badgeProgress(trainer, badge('first-partners')), 1);
});

test('TAG TEAM partners count individually while non-Pokémon cards never unlock species', () => {
  let trainer = addCard(freshCollection().trainers[0], card(1, { dexIds: [1, 1, 4], tagTeam: true }), 'normal', 1);
  trainer = addCard(trainer, card(7, { category: 'Trainer' }), 'normal', 1);
  trainer = addCard(trainer, card(8, { category: 'Energy' }), 'normal', 1);
  trainer = addCard(trainer, card(25), 'normal', 1);
  assert.equal(badgeProgress(trainer, badge('starters-kanto')), 2);
  assert.equal(badgeProgress(trainer, badge('hundred')), 4);
});

test('themed challenges require their exact species rather than an equal discovery count', () => {
  const requirements = [
    ['eevee-family', [133, 134, 135, 136, 196, 197, 470, 471, 700]],
    ['legendary-birds', [144, 145, 146]],
    ['kanto-fossils', [138, 139, 140, 141, 142]],
    ['kanto-complete', Array.from({ length: 151 }, (_, i) => i + 1)],
  ];
  for (const [id, ids] of requirements) {
    const b = badge(id);
    assert.deepEqual(b.speciesIds, ids);
    assert.equal(badgeProgress(collect(ids), b), ids.length);
    assert.equal(badgeProgress(collect([...ids.slice(0, -1), 1025]), b), ids.length - 1);
  }
});

test('progress survives backups, stays trainer-specific and updates when the last copy is removed', () => {
  const collection = freshCollection();
  collection.trainers[0] = collect(Array.from({ length: 9 }, (_, i) => i + 1));
  const b = badge('starters-kanto');
  let trainer = parseCollection(portableBackup(collection)).trainers[0];
  assert.equal(badgeProgress(trainer, b), 9);
  assert.equal(badgeProgress(freshCollection().trainers[0], b), 0);
  trainer = addCard(trainer, card(1), 'holo', 1);
  trainer = updateQuantity(trainer, 'en:test-1:normal', 0);
  assert.equal(badgeProgress(trainer, b), 9);
  trainer = updateQuantity(trainer, 'en:test-1:holo', 0);
  assert.equal(badgeProgress(trainer, b), 8);
});

test('discovery milestones count species, card milestones count copies and all progress is capped', () => {
  const trainer = addCard(collect(Array.from({ length: 101 }, (_, i) => i + 1)), card(1), 'normal', 700);
  for (const [id, target] of [['first', 1], ['ten', 10], ['fifty', 50], ['hundred-species', 100], ['hundred', 100], ['sixhundred', 600]]) {
    assert.equal(badgeProgress(trainer, badge(id)), target);
  }
  const multilingual = ['ja', 'ko', 'zh-cn'].reduce((t, language) => addCard(t, card(1, { language }), 'normal', 1), trainer);
  assert.equal(badgeProgress(multilingual, badge('world')), 2);
});

test('Set master needs every numbered card in one set; copies, other languages and secret rares do not fill gaps', () => {
  const b = badge('set-master');
  assert.equal(b.group, 'Collection milestones');
  const setCard = (n, overrides = {}) => card(25, { id: `mini-${n}`, localId: String(n).padStart(3, '0'), set: { id: 'mini', name: 'Mini set', total: 3 }, ...overrides });
  let trainer = addCard(freshCollection().trainers[0], setCard(1), 'normal', 5);
  trainer = addCard(trainer, setCard(1), 'holo', 1);
  trainer = addCard(trainer, setCard(2), 'normal', 1);
  trainer = addCard(trainer, setCard(4), 'normal', 1); // A secret rare: 004/003.
  assert.equal(badgeProgress(trainer, b), 0);
  assert.equal(badgeProgress(addCard(trainer, setCard(3, { language: 'ja' }), 'normal', 1), b), 0);
  trainer = addCard(trainer, setCard(3), 'reverse', 1);
  assert.equal(badgeProgress(trainer, b), 1);
  assert.equal(badgeProgress(parseCollection(portableBackup({ ...freshCollection(), trainers: [trainer] })).trainers[0], b), 1);
  // Screens pass the catalog-aware count; progress stays capped at the target.
  assert.equal(badgeProgress(trainer, b, undefined, 0), 0);
  assert.equal(badgeProgress(trainer, b, undefined, 4), 1);
  trainer = updateQuantity(trainer, 'en:mini-3:reverse', 0);
  assert.equal(badgeProgress(trainer, b), 0);
});
