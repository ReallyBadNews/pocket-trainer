const { test } = require('node:test');

const assert = require('node:assert/strict');

const { parseCardPricing, quotePrice } = require('../.test-build/lib/pricing');

const { eur, printingFinishes, printingPrices, sourceDates } = require('../.test-build/lib/printing-prices');

const fixtures = require('./fixtures/prices.json');

const now = Date.parse('2026-09-06T19:00:00Z');

const fx = { rate: 1.1622, date: '2026-09-04', checkedAt: now };

const snapshot = (id, language = 'en') =>
  parseCardPricing(
    { id, language, name: 'Test card', localId: id.split('-').at(-1) },
    fixtures.find((f) => f.language === language && f.data.id === id).data,
    now,
  );

test('every printing joins catalog, provider and priced finishes in catalog order, never "Not sure yet"', () => {
  const stadium = snapshot('sm9-156');
  assert.deepEqual(printingFinishes(['reverse', 'unsure', 'holo'], stadium), ['normal', 'holo', 'reverse']);
  assert.deepEqual(printingFinishes(['normal', 'normal', 'unsure']), ['normal']);
  // A cached snapshot can price a printing its variant flags forgot.
  assert.deepEqual(
    printingFinishes([], {
      key: 'en:x',
      checkedAt: now,
      finishes: [],
      prices: [{ finish: 'wPromo', amount: 2, currency: 'USD', source: 'TCGplayer', updatedAt: '2026-09-06' }],
    }),
    ['wPromo'],
  );
  assert.deepEqual(printingFinishes(['unsure']), []);
});

test('each printing keeps TCGplayer and Cardmarket apart, and its estimate matches the binder quote', () => {
  const stadium = snapshot('sm9-156');
  const rows = printingPrices(['normal', 'holo', 'reverse', 'unsure'], stadium, fx);
  assert.deepEqual(
    rows.map((r) => r.finish),
    ['normal', 'holo', 'reverse'],
  );
  const [normal, holo, reverse] = rows;
  assert.equal(normal.tcgplayer.cents, 34);
  assert.equal(normal.cardmarket.euros, 0.23);
  assert.equal(normal.cardmarket.cents, Math.round(0.23 * 1.1622 * 100));
  assert.equal(normal.estimate, 34, 'TCGplayer leads, like the binder total');
  assert.equal(reverse.tcgplayer.cents, 63);
  assert.equal(reverse.cardmarket, undefined);
  assert.deepEqual(holo, { finish: 'holo' }, 'a printing with no price yet still gets a row');

  for (const row of rows) assert.equal(row.estimate ?? null, quotePrice(stadium, row.finish, fx, now)?.low ?? null);
});

test('euro-only printings convert once an exchange rate is known', () => {
  const jp = snapshot('SV5K-025', 'ja');
  const [waiting] = printingPrices([], jp);
  assert.equal(waiting.finish, 'holo');
  assert.equal(waiting.cardmarket.euros, 0.29);
  assert.equal(waiting.cardmarket.cents, undefined);
  assert.equal(waiting.estimate, undefined);
  const [converted] = printingPrices([], jp, fx);
  assert.equal(converted.estimate, quotePrice(jp, 'holo', fx, now).low);
  assert.equal(printingPrices(['normal']).length, 1);
});

test('source dates report the newest price from each provider', () => {
  const prices = [
    { finish: 'normal', amount: 1, currency: 'USD', source: 'TCGplayer', updatedAt: '2026-09-01T00:00:00Z' },
    { finish: 'reverse', amount: 2, currency: 'USD', source: 'TCGplayer', updatedAt: '2026-09-05T00:00:00Z' },
    { finish: 'normal', amount: 1, currency: 'EUR', source: 'Cardmarket', updatedAt: '2026-09-03T00:00:00Z' },
  ];

  assert.deepEqual(sourceDates({ key: 'en:x', checkedAt: now, finishes: [], prices }), [
    { source: 'TCGplayer', updatedAt: '2026-09-05T00:00:00Z' },
    { source: 'Cardmarket', updatedAt: '2026-09-03T00:00:00Z' },
  ]);
  assert.deepEqual(
    sourceDates(snapshot('SV1S-001', 'ja')).map((d) => d.source),
    ['Cardmarket'],
  );
  assert.deepEqual(sourceDates(undefined), []);
  assert.equal(eur(9.6), '€9.60');
});
