const { test } = require('node:test');
const assert = require('node:assert/strict');
const { allCards, searchCards, scanCandidates, recognitionWords, species, ENERGY_SEARCHES } = require('../.test-build/lib/catalog');
const { scanTypeHint } = require('../.test-build/lib/card-kind');
const { freshCollection, addCard, parseCollection, portableBackup, discoveredIds, BADGES, badgeProgress } = require('../.test-build/lib/model');
const { makeManualCard } = require('../.test-build/lib/manual-card');
const { parsePriceCache } = require('../.test-build/lib/pricing');
const scan = (topText, bottomText) => ({ text: `${topText}\n${bottomText}`, topText, bottomText });

test('Korean catalog is searchable by Korean, English and other-language names', () => {
  assert.ok(allCards.filter(c => c.language === 'ko').length >= 200);
  assert.equal(species.find(s => s.id === 25).ko, '피카츄');
  assert.ok(searchCards('Pansage', 'ko').some(c => c.id === 'SV4K-001'));
  assert.ok(searchCards('야나프', 'ko').some(c => c.id === 'SV4K-001'));
  assert.ok(searchCards('야나프', 'en').some(c => c.name === 'Pansage'));
  assert.equal(searchCards('SV4K 001/066', 'ko')[0].id, 'SV4K-001');
  assert.ok(searchCards(ENERGY_SEARCHES.find(e => e.label === 'Metal').ko, 'ko', 80, 'energy').some(c => c.name === '기본 강철 에너지'));
  assert.ok(recognitionWords('ko').includes('딩루'));
  assert.ok(searchCards('Pansage', 'en').every(c => c.language === 'en'));
  // Search accepts the zero-padded total printed on the card.
  assert.equal(searchCards('SV8 001/106', 'ja')[0].id, 'SV8-001');
});

test('Korean OCR text finds exact printings, two-syllable names and category headings', () => {
  const [best] = scanCandidates(scan('기본\n야나프 HP60', 'SV4K 001/066'), 'ko');
  assert.equal(best.card.id, 'SV4K-001');
  assert.equal(best.exactPrinting, true);
  assert.ok(scanCandidates(scan('딩루 HP130', ''), 'ko').some(c => c.card.id === 'SV4K-043'));
  for (const [heading, type] of [['트레이너스\n서포트', 'trainer'], ['트레이너스\n굿즈', 'item'], ['트레이너스\n포켓몬의 도구', 'trainer'], ['스타디움', 'stadium'], ['기본 에너지', 'energy'], ['에너지', 'energy']]) {
    assert.equal(scanTypeHint(heading), type);
  }
  assert.deepEqual(scanCandidates(scan('기본 에너지', ''), 'ko'), []);
});

test('Korean manual entries keep language identity through storage, backups and price caches', () => {
  const base = { language: 'ko', name: '피카츄', setCode: 'SV8K', number: '033/106', category: 'Pokemon', dexIds: [25], photoUri: 'file:///pikachu.jpg' };
  const collection = freshCollection();
  collection.trainers[0] = addCard(collection.trainers[0], makeManualCard(base), 'normal', 1);
  collection.trainers[0] = addCard(collection.trainers[0], makeManualCard({ ...base, language: 'ja' }), 'normal', 1);
  const stored = parseCollection(JSON.stringify(collection));
  assert.equal(stored.trainers[0].entries.length, 2);
  assert.deepEqual(stored.trainers[0].entries.map(e => e.card.language).sort(), ['ja', 'ko']);
  const restored = parseCollection(portableBackup(collection));
  assert.deepEqual([...discoveredIds(restored.trainers[0])], [25]);
  assert.equal(badgeProgress(restored.trainers[0], BADGES.find(b => b.id === 'world')), 2);
  const now = Date.now();
  const snapshots = ['ko', 'ja'].map(language => ({ key: `${language}:SV5K-001`, checkedAt: now, prices: [], finishes: ['normal'] }));
  assert.deepEqual(Object.keys(parsePriceCache(JSON.stringify({ version: 1, snapshots }), now).snapshots), ['ko:SV5K-001', 'ja:SV5K-001']);
});
