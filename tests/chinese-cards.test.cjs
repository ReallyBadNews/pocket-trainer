const { test } = require('node:test');

const assert = require('node:assert/strict');

const {
  allCards,
  searchCards,
  scanCandidates,
  fetchCard,
  cardImage,
  recognitionWords,
} = require('../.test-build/lib/catalog');

const { fetchCardData } = require('../.test-build/lib/card-api');

const { scanTypeHint } = require('../.test-build/lib/card-kind');

const {
  freshCollection,
  addCard,
  parseCollection,
  portableBackup,
  discoveredIds,
  BADGES,
  badgeProgress,
} = require('../.test-build/lib/model');

const { makeManualCard } = require('../.test-build/lib/manual-card');

const { parsePriceCache, parseCardPricing, quotePrice } = require('../.test-build/lib/pricing');

const photo = require('./fixtures/scan-chinese-text.json');

const scan = (topText, bottomText) => ({ text: `${topText}\n${bottomText}`, topText, bottomText });

test('Chinese catalogs keep scripts separate and names work across languages', () => {
  assert.equal(searchCards('Deerling', 'zh-cn')[0].id, photo.expected);
  assert.equal(searchCards('CBB4C 17 07/07', 'zh-cn')[0].id, photo.expected);
  assert.ok(searchCards('四季鹿', 'zh-tw').some((c) => c.id === 'SV5M-073'));
  assert.ok(searchCards('Pikachu', 'zh-tw').some((c) => c.name.includes('皮卡丘')));
  assert.ok(searchCards('葉伊布', 'zh-cn').some((c) => c.name.includes('叶伊布')));
  assert.ok(searchCards('叶伊布', 'zh-tw').some((c) => c.name.includes('葉伊布')));
  assert.ok(searchCards('四季鹿', 'en').some((c) => c.name === 'Deerling'));
  assert.ok(recognitionWords('zh-cn').includes('四季鹿'));
  assert.ok(recognitionWords('zh-tw').includes('伊布'));
  assert.ok(allCards.filter((c) => c.language === 'zh-cn').every((c) => c.id.startsWith('C')));
  assert.equal(cardImage(searchCards('Deerling', 'zh-cn')[0]), undefined);
});

test('actual Chinese photo OCR identifies its exact Gem Pack printing', () => {
  const [best] = scanCandidates(photo.scan, photo.language);
  assert.equal(best.card.id, photo.expected);
  assert.equal(best.exactPrinting, true);

  for (const footer of ['CBB4C 17 07/07', 'CBB4C 1707/07', 'ＣＢＢ４Ｃ １７ ０７／０７']) {
    const [match] = scanCandidates(scan('四季鹿 HP70', footer), 'zh-cn');
    assert.equal(match.card.id, photo.expected);
    assert.equal(match.exactPrinting, true);
  }

  // Another foil variant must not receive exact-printing evidence.
  assert.equal(scanCandidates(scan('四季鹿', 'CBB4C 17 06/07'), 'zh-cn')[0].exactPrinting, false);
  assert.ok(
    scanCandidates(scan('', 'CBB4C 07/07'), 'zh-cn').every((c) => c.card.id !== photo.expected && !c.exactPrinting),
  );
});

test('two-character names, Traditional Chinese printings, and category headings match', () => {
  assert.ok(scanCandidates(scan('伊布 HP50', ''), 'zh-tw').some((c) => c.card.name === '伊布'));
  const [best] = scanCandidates(scan('四季鹿', 'SV5M 073/071'), 'zh-tw');
  assert.equal(best.card.id, 'SV5M-073');
  assert.equal(best.exactPrinting, true);

  for (const [heading, type] of [
    ['训练家', 'trainer'],
    ['訓練家', 'trainer'],
    ['物品', 'item'],
    ['竞技场', 'stadium'],
    ['競技場', 'stadium'],
    ['基本能量', 'energy'],
  ]) {
    assert.equal(scanTypeHint(heading), type);
  }

  assert.deepEqual(scanCandidates(scan('基本能量', ''), 'zh-tw'), []);
});

test('supplemental card opens offline, preserves the supplied photo, and has no invented price', async () => {
  const brief = searchCards('Deerling', 'zh-cn')[0];
  const originalFetch = global.fetch;
  global.fetch = () => {
    throw new Error('must work offline');
  };

  try {
    const card = await fetchCard({ ...brief, localImage: 'file:///card.jpg' });
    assert.equal(card.localId, '17 07');
    assert.equal(card.set.total, 7);
    assert.equal(card.hp, 70);
    assert.deepEqual(card.dexIds, [585]);
    assert.equal(card.localImage, 'file:///card.jpg');
    assert.equal(
      (await fetchCard({ ...brief, localImage: 'file:///new-card.jpg' })).localImage,
      'file:///new-card.jpg',
    );
    assert.equal((await fetchCard(brief)).localImage, undefined);
    assert.equal(quotePrice(parseCardPricing(brief, await fetchCardData(brief)), 'holo'), null);
  } finally {
    global.fetch = originalFetch;
  }
});

test('Chinese entries preserve language, photos, species, and manual variants through collection storage', () => {
  const base = {
    language: 'zh-cn',
    name: '四季鹿',
    setCode: 'CBB4C',
    number: '17 07/07',
    category: 'Pokemon',
    dexIds: [585],
    photoUri: 'file:///saved.jpg',
  };

  const collection = freshCollection();

  for (const fields of [{}, { language: 'zh-tw' }, { number: '17 06/07' }]) {
    collection.trainers[0] = addCard(collection.trainers[0], makeManualCard({ ...base, ...fields }), 'holo', 2);
  }

  const stored = parseCollection(JSON.stringify(collection));
  assert.equal(stored.trainers[0].entries.length, 3);
  assert.equal(stored.trainers[0].entries[0].card.localImage, 'file:///saved.jpg');
  const restored = parseCollection(portableBackup(collection));
  assert.deepEqual([...discoveredIds(restored.trainers[0])], [585]);
  assert.equal(restored.trainers[0].entries[0].card.localImage, undefined);
  assert.equal(
    badgeProgress(
      restored.trainers[0],
      BADGES.find((b) => b.id === 'world'),
    ),
    2,
  );
  const trainer = makeManualCard({ ...base, category: 'Trainer' });
  assert.deepEqual(trainer.dexIds, []);

  for (const fields of [
    { name: '' },
    { setCode: '../bad' },
    { number: '07/0' },
    { number: 'bad' },
    { category: 'wrong' },
  ]) {
    assert.throws(() => makeManualCard({ ...base, ...fields }));
  }
});

test('Chinese price-cache identities survive reloads without crossing languages; manual entries stay unpriced', async () => {
  const now = Date.now();

  const snapshots = ['zh-cn', 'zh-tw'].map((language) => ({
    key: `${language}:SV5M-073`,
    checkedAt: now,
    prices: [],
    finishes: ['holo'],
  }));

  const result = parsePriceCache(JSON.stringify({ version: 1, snapshots }), now);
  assert.deepEqual(Object.keys(result.snapshots), ['zh-cn:SV5M-073', 'zh-tw:SV5M-073']);

  const manual = makeManualCard({
    language: 'zh-cn',
    name: '四季鹿',
    setCode: 'CBB4C',
    number: '17 06/07',
    category: 'Pokemon',
    dexIds: [585],
  });

  const data = await fetchCardData(manual);
  assert.equal(quotePrice(parseCardPricing(manual, data), 'holo'), null);
});
