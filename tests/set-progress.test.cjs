const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setProgress, setChecklist, completedSetCount, canonicalNumber } = require('../.test-build/lib/set-progress');
const { catalogSet, allCards } = require('../.test-build/lib/catalog');
const { freshCollection, addCard, updateQuantity } = require('../.test-build/lib/model');

const empty = () => freshCollection().trainers[0];
// A saved card as fetchCard would build it from a catalog brief.
const saved = (brief, total, overrides = {}) => ({
  ...brief, set: { id: brief.id.slice(0, brief.id.lastIndexOf('-')), name: 'Saved name', total },
  dexIds: [], types: [], category: 'Pokemon', rarity: 'Common', finishes: ['normal', 'holo', 'reverse'], ...overrides,
});
const brief = (language, id) => {
  const found = allCards.find(c => c.language === language && c.id === id);
  assert.ok(found, `Missing catalog card ${language}:${id}`);
  return found;
};
const collect = (cards, trainer = empty()) => cards.reduce((t, card) => addCard(t, card, 'normal', 1), trainer);
const mew151 = n => saved(brief('en', `sv03.5-${String(n).padStart(3, '0')}`), 165);
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const only = (trainer, catalog) => {
  const sets = setProgress(trainer, catalog);
  assert.equal(sets.length, 1);
  return sets[0];
};

test('copies, finishes and repeated printings of one number count once', () => {
  let trainer = addCard(empty(), mew151(1), 'normal', 3);
  trainer = addCard(trainer, mew151(1), 'holo', 1);
  trainer = addCard(trainer, mew151(1), 'reverse', 2);
  // A manual entry of the same printed number, typed without the zero padding.
  trainer = addCard(trainer, saved({ id: 'manual-SV03.5-1-165', localId: '1', name: 'Bulbasaur', language: 'en' }, 165, { set: { id: 'SV03.5', name: '151', total: 165 } }), 'normal', 1);
  trainer = addCard(trainer, mew151(4), 'normal', 1);
  assert.deepEqual(only(trainer, catalogSet), { key: 'en:sv03.5', language: 'en', setId: 'sv03.5', name: '151', owned: 2, official: 165, bonus: 0, complete: false });
  assert.equal(canonicalNumber('001'), canonicalNumber('1'));
  assert.equal(canonicalNumber('TG01'), canonicalNumber('tg1'));
  assert.equal(canonicalNumber('17 07'), '17 7');
});

test('secret rares past the official size are bonus cards and never push progress past 100%', () => {
  const almost = collect([...range(1, 164), 170, 171].map(mew151));
  const progress = only(almost, catalogSet);
  assert.equal(progress.owned, 164);
  assert.equal(progress.official, 165);
  assert.equal(progress.bonus, 2);
  assert.equal(progress.complete, false, 'secret rares do not fill a missing number');
  const complete = only(collect([165, 170].map(mew151), almost), catalogSet);
  assert.deepEqual([complete.owned, complete.official, complete.bonus, complete.complete], [165, 165, 2, true]);
  assert.ok(complete.owned <= complete.official);
  assert.equal(completedSetCount(almost, catalogSet), 0);
  assert.equal(completedSetCount(collect([165].map(mew151), almost), catalogSet), 1);
  // Removing the last copy of a number reopens the set.
  const reopened = updateQuantity(collect([165].map(mew151), almost), 'en:sv03.5-012:normal', 0);
  assert.equal(only(reopened, catalogSet).owned, 164);
});

test('every language keeps its own sets, even with matching names or set ids', () => {
  const english = mew151(25);
  const japanese = saved(brief('ja', 'SV2a-025'), 165);
  const trainer = collect([english, japanese]);
  const sets = setProgress(trainer, catalogSet);
  assert.deepEqual(sets.map(s => s.key).sort(), ['en:sv03.5', 'ja:SV2a']);
  assert.ok(sets.every(s => s.owned === 1 && s.official === 165));
  assert.equal(sets.find(s => s.language === 'ja').name, 'ポケモンカード151');
  // Traditional Chinese and Japanese both use SV4a; they are different sets.
  const shared = collect([saved(brief('ja', 'SV4a-001'), 190), saved(brief('zh-tw', 'SV4a-001'), 190)]);
  assert.deepEqual(setProgress(shared, catalogSet).map(s => s.key).sort(), ['ja:SV4a', 'zh-tw:SV4a']);
  assert.equal(setChecklist(shared, 'ja', 'SV4a', catalogSet).filter(s => s.owned).length, 1);
});

test('an empty trainer has no set progress and an all-missing checklist', () => {
  assert.deepEqual(setProgress(empty(), catalogSet), []);
  assert.deepEqual(setProgress(empty()), []);
  assert.equal(completedSetCount(empty(), catalogSet), 0);
  const slots = setChecklist(empty(), 'en', 'sv03.5', catalogSet);
  assert.equal(slots.length, 207);
  assert.ok(slots.every(s => !s.owned));
});

test('the checklist lists the main run in order, then bonus cards, with owned flags', () => {
  const trainer = collect([3, 1, 170].map(mew151));
  const slots = setChecklist(trainer, 'en', 'sv03.5', catalogSet);
  const main = slots.filter(s => s.main);
  assert.equal(main.length, 165);
  assert.deepEqual(main.slice(0, 4).map(s => [s.localId, s.owned]), [['001', true], ['002', false], ['003', true], ['004', false]]);
  assert.equal(slots.findIndex(s => !s.main), 165, 'bonus cards follow the main run');
  assert.deepEqual(slots.filter(s => !s.main).slice(0, 2).map(s => s.localId), ['166', '167']);
  assert.ok(slots.find(s => s.localId === '170').owned);
  assert.equal(slots.find(s => s.localId === '001').entry.key, 'en:sv03.5-001:normal');
  assert.equal(new Set(slots.map(s => s.key)).size, slots.length);
});

test('prefixed galleries and promo runs count their shared prefix as the main run', () => {
  const gallery = collect([saved(brief('en', 'swsh9tg-TG05'), 30), saved(brief('en', 'swsh9tg-TG30'), 30)]);
  assert.deepEqual([only(gallery, catalogSet).owned, only(gallery, catalogSet).official], [2, 30]);
  const skyridge = collect([saved(brief('en', 'ecard3-1'), 144), saved(brief('en', 'ecard3-H01'), 144)]);
  assert.deepEqual([only(skyridge, catalogSet).owned, only(skyridge, catalogSet).bonus], [1, 1]);
});

test('missing catalog numbers become placeholders and uncatalogued owned cards still appear', () => {
  const tiny = { id: 'mini', name: 'Mini set', official: 4, cards: [
    { id: 'mini-001', localId: '001', name: 'One', language: 'ko' },
    { id: 'mini-003', localId: '003', name: 'Three', language: 'ko' },
    { id: 'mini-005', localId: '005', name: 'Secret', language: 'ko' },
  ] };
  const catalog = (language, setId) => language === 'ko' && setId.toLowerCase() === 'mini' ? tiny : undefined;
  const two = saved({ id: 'manual-MINI-2-4', localId: '2', name: 'Two', language: 'ko' }, 4, { set: { id: 'MINI', name: 'MINI', total: 4 } });
  const trainer = collect([saved(tiny.cards[0], 4), two]);
  assert.deepEqual(only(trainer, catalog), { key: 'ko:mini', language: 'ko', setId: 'mini', name: 'Mini set', owned: 2, official: 4, bonus: 0, complete: false });
  const slots = setChecklist(trainer, 'ko', 'mini', catalog);
  assert.deepEqual(slots.map(s => [s.localId, s.main, s.owned, !!s.card]), [
    ['001', true, true, true], ['2', true, true, true], ['003', true, false, true], ['004', true, false, false], ['005', false, false, true],
  ]);
});

test('without a catalog, progress uses the set size saved on each card', () => {
  const card = (n, total = 3) => saved({ id: `manual-GEM-${n}-${total}`, localId: String(n).padStart(2, '0'), name: `Card ${n}`, language: 'zh-cn' }, total, { set: { id: 'GEM', name: 'Gem pack', total } });
  const trainer = collect([card(1), card(2), card(3), card(4)]);
  assert.deepEqual(only(trainer), { key: 'zh-cn:GEM', language: 'zh-cn', setId: 'GEM', name: 'Gem pack', owned: 3, official: 3, bonus: 1, complete: true });
  // Open-ended sets without a printed size cannot be completed, so they are left out.
  assert.deepEqual(setProgress(collect([card(1, 0)])), []);
});

test('sets are sorted closest to complete first', () => {
  const tiny = n => saved({ id: `manual-TINY-${n}-2`, localId: String(n), name: 'Tiny', language: 'en' }, 2, { set: { id: 'TINY', name: 'Tiny', total: 2 } });
  const trainer = collect([...range(1, 100).map(mew151), tiny(1), saved(brief('en', 'swsh9tg-TG05'), 30)]);
  assert.deepEqual(setProgress(trainer, catalogSet).map(s => s.setId), ['sv03.5', 'TINY', 'swsh9tg']);
});
