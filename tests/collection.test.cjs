const { test } = require('node:test');
const assert = require('node:assert/strict');
const { freshCollection, addCard, entryKey, discoveredIds, totalCards, duplicateCards, updateQuantity, parseCollection, portableBackup, mergeBackup, BADGES, badgeProgress } = require('../.test-build/lib/model');
const { searchCards, rankScanCandidates, allCards } = require('../.test-build/lib/catalog');
const card = { id: 'base1-58', localId: '58', name: 'Pikachu', language: 'en', image: 'https://assets.tcgdex.net/en/base/base1/58', set: { id: 'base1', name: 'Base Set', total: 102 }, dexIds: [25], types: ['Lightning'], category: 'Pokemon', rarity: 'Common', finishes: ['normal', 'unsure'] };

test('duplicate copies preserve one species discovery and add quantities', () => {
  const original = freshCollection().trainers[0];
  const trainer = addCard(addCard(original, card, 'normal', 2), card, 'normal', 3);
  assert.equal(trainer.entries.length, 1); assert.equal(totalCards(trainer), 5);
  assert.equal(duplicateCards(trainer), 4); assert.deepEqual([...discoveredIds(trainer)], [25]);
  assert.equal(original.entries.length, 0);
});
test('languages and finishes remain separate identities', () => {
  let t = freshCollection().trainers[0];
  t = addCard(t, card, 'normal', 1);
  t = addCard(t, { ...card, language: 'ja' }, 'normal', 1);
  t = addCard(t, card, 'reverse', 1);
  assert.equal(t.entries.length, 3); assert.equal(discoveredIds(t).size, 1);
  assert.equal(badgeProgress(t, BADGES.find(b => b.id === 'world')), 2);
});
test('removing last species copy relocks entry; Trainer/Energy never unlock', () => {
  let t = addCard(freshCollection().trainers[0], card, 'normal', 1);
  t = addCard(t, { ...card, id: 'energy-1', dexIds: [], category: 'Energy' }, 'normal', 1);
  t = updateQuantity(t, entryKey(card, 'normal'), 0);
  assert.equal(discoveredIds(t).size, 0); assert.equal(totalCards(t), 1);
});
test('quantity limits reject invalid input', () => {
  const t = freshCollection().trainers[0];
  for (const n of [0, -1, 1.5, 1000, NaN]) assert.throws(() => addCard(t, card, 'normal', n));
  assert.throws(() => addCard(addCard(t, card, 'normal', 999), card, 'normal', 1));
});
test('backup round-trip preserves collection and excludes device-local paths', () => {
  const c = freshCollection(); c.trainers[0] = addCard(c.trainers[0], { ...card, localImage: 'file:///device/card.webp' }, 'normal', 600);
  const raw = portableBackup(c); const restored = parseCollection(raw);
  assert.equal(totalCards(restored.trainers[0]), 600); assert.ok(!raw.includes('file:///'));
  const merged = mergeBackup(c, restored, 'test');
  assert.equal(merged.trainers.length, 2); assert.equal(merged.activeId, c.activeId);
  assert.notEqual(merged.trainers[0].id, merged.trainers[1].id);
  assert.equal(totalCards(c.trainers[0]), 600);
});
test('malformed or future backups cannot be imported', () => {
  assert.throws(() => parseCollection('{')); assert.throws(() => parseCollection('{"version":2}'));
  const c = freshCollection(); c.trainers[0] = addCard(c.trainers[0], card, 'normal', 1);
  for (const mutate of [c => c.trainers[0].entries[0].quantity = -1, c => c.activeId = 'missing', c => c.trainers.push(c.trainers[0]), c => c.trainers[0].entries.push(c.trainers[0].entries[0]), c => c.trainers[0].entries[0].finish = '__proto__', c => c.trainers[0].entries[0].card.image = 'https://evil.example/image']) {
    const broken = structuredClone(c); mutate(broken); assert.throws(() => parseCollection(JSON.stringify(broken)));
  }
});
test('English names find Japanese printings and combined name/number searches work', () => {
  assert.ok(searchCards('Pikachu', 'ja').some(c => c.name.includes('ピカチュウ')));
  assert.ok(searchCards('Pikachu 58', 'en').some(c => c.id === 'base1-58'));
  assert.equal(searchCards('base1-58', 'en')[0].id, 'base1-58');
  assert.deepEqual(searchCards('', 'en'), []);
  assert.equal(searchCards('zzzz-no-card-ever', 'en').length, 0);
  assert.ok(allCards.every(c => !c.image?.toLowerCase().includes('/tcgp/')));
});
test('English OCR combines header name and collector fraction; noisy photos do not invent cards', () => {
  const results = rankScanCandidates({ text: 'Pikachu\n40 HP\n58/102', topText: 'Pikachu 40 HP', bottomText: '58/102' }, 'en');
  assert.equal(results[0].id, 'base1-58');
  assert.deepEqual(rankScanCandidates({ text: 'a wooden table', topText: '', bottomText: '' }, 'en'), []);
});
test('Japanese OCR handles full-width digits and exact set codes', () => {
  const results = rankScanCandidates({ text: 'サボネア\nHP60\nSV1S ００１／０７８', topText: 'サボネア', bottomText: 'SV1S ００１／０７８' }, 'ja');
  assert.equal(results[0].id, 'SV1S-001');
});

test('stylized Mega and ex names tolerate missing suffixes and OCR spelling errors', () => {
  const cases = [
    ['ja', 'ウミトリオ', '025/071', 'SV5K-025'],
    ['ja', 'ウミトリ才ex', 'SV5K O25/O71', 'SV5K-025'],
    ['en', 'MCharizard EX HP230', '69/106', 'xy2-69'],
    ['en', 'Charizard HP230', '69/106', 'xy2-69'],
    ['en', 'Pikacbu 40HP', '58/1O2', 'base1-58'],
  ];
  for (const [language, topText, bottomText, expected] of cases) {
    assert.equal(rankScanCandidates({ text: `${topText}\n${bottomText}`, topText, bottomText }, language)[0]?.id, expected);
  }
});
test('header and exact printing beat unrelated names in the card body or neighboring cards', () => {
  const results = rankScanCandidates({ text: 'Charizard\nZapdos\nPikachu\n58/102', topText: 'Pikachu 40HP', bottomText: '58/102' }, 'en');
  assert.equal(results[0].id, 'base1-58');
  assert.ok(results.every(c => c.name === 'Pikachu'));
  assert.deepEqual(rankScanCandidates({ text: '', topText: '', bottomText: '' }, 'ja'), []);
});
test('verified image overrides preserve exact card identities', () => {
  const { cardImage } = require('../.test-build/lib/catalog');
  assert.equal(cardImage(allCards.find(c => c.id === 'sm7.5-3' && c.language === 'en')), 'https://assets.tcgdex.net/en/sm/sm75/3/low.webp');
  assert.equal(cardImage({ id: '2024sv-1', language: 'en', localId: '1', name: 'Charizard' }), undefined);
});
test('artwork breaks close ties without overriding exact set and number evidence', () => {
  const { rerankByArtwork } = require('../.test-build/lib/catalog');
  const candidates = [
    { card: { id: 'a' }, score: 120, exactPrinting: false },
    { card: { id: 'b' }, score: 118, exactPrinting: false },
    { card: { id: 'c' }, score: 100, exactPrinting: false },
  ];
  assert.equal(rerankByArtwork(candidates, new Map([['a', 1.2], ['b', .7]]))[0].card.id, 'b');
  assert.equal(rerankByArtwork([{ ...candidates[0], exactPrinting: true }, candidates[1]], new Map([['a', 1.2], ['b', .7]]))[0].card.id, 'a');
  assert.deepEqual(rerankByArtwork(candidates, new Map([['a', -1], ['b', NaN]])), candidates);
  assert.deepEqual(rerankByArtwork(candidates, new Map([['a', 1], ['b', 1.01]])), candidates);
});
test('crop handles stay inside the photo and cannot invert the selected card', () => {
  const { resizeCrop } = require('../.test-build/lib/scan-types');
  for (let corner = 0; corner < 4; corner++) {
    for (const [dx, dy] of [[-3, -2], [3, 2], [.1, -.1]]) {
      const [x, y, w, h] = resizeCrop([.2, .2, .6, .6], corner, dx, dy);
      assert.ok(x >= 0 && y >= 0 && w >= .119 && h >= .119 && x + w <= 1.001 && y + h <= 1.001);
    }
  }
});
test('actual shared Apple Vision outputs rank the screenshot and Mega/ex reference printings first', () => {
  for (const fixture of require('./fixtures/scan-text.json')) {
    assert.equal(rankScanCandidates(fixture.scan, fixture.language)[0]?.id, fixture.expected, fixture.label);
  }
});
