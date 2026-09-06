const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DAY, priceKey, parseCardPricing, parseExchangeRate, quotePrice, quoteLabel, collectionValue, parsePriceCache } = require('../.test-build/lib/pricing');
const { PriceClient } = require('../.test-build/lib/price-client');
const { changePrinting, entryKey, freshCollection, addCard } = require('../.test-build/lib/model');
const fixtures = require('./fixtures/prices.json');
const now = Date.parse('2026-09-06T19:00:00Z');
const fx = { rate: 1.1622, date: '2026-09-04', checkedAt: now };
const brief = (id = 'base1-58', language = 'en') => ({ id, language, name: 'Test card', localId: id.split('-').at(-1) });
const sample = (id, language = 'en') => fixtures.find(f => f.language === language && f.data.id === id).data;
const snapshot = (id, language = 'en') => parseCardPricing(brief(id, language), sample(id, language), now);
const card = { ...brief(), set: { id: 'base1', name: 'Base Set', total: 102 }, dexIds: [25], types: [], category: 'Pokemon', rarity: 'Common', finishes: ['normal', 'unsure'] };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) { for (let i = 0; i < 500; i++) { if (predicate()) return; await tick(); } assert.fail('Async price work did not settle'); }

test('live USD variants select market price, not listing highs, and expose reverse/holo choices', () => {
  const pikachu = snapshot('base1-58');
  assert.equal(quotePrice(pikachu, 'normal', fx, now).low, 1610);
  const stadium = snapshot('sm9-156');
  assert.equal(quotePrice(stadium, 'normal', fx, now).low, 34);
  assert.equal(quotePrice(stadium, 'reverse', fx, now).low, 63);
  assert.ok(stadium.finishes.includes('reverse'));
  const tag = snapshot('sm12-221');
  assert.equal(quotePrice(tag, 'holo', fx, now).low, 56804);
  assert.ok(tag.finishes.includes('holo'));
  // The provider mislabels this GX as Regular. Never invent a Regular price from its Holo price.
  assert.equal(quotePrice(tag, 'normal', fx, now), null);
});

test('Japanese prices retain language and EUR provenance and require an exchange rate', () => {
  const jp = snapshot('SV5K-025', 'ja');
  assert.equal(jp.key, 'ja:SV5K-025');
  assert.equal(quotePrice(jp, 'holo', undefined, now), null);
  const quote = quotePrice(jp, 'holo', fx, now);
  assert.equal(quote.low, Math.round(sample('SV5K-025', 'ja').pricing.cardmarket.trend * 1.1622 * 100));
  assert.equal(quote.converted, true); assert.deepEqual(quote.sources, ['Cardmarket']);
  assert.equal(quotePrice(jp, 'reverse', fx, now), null);
  assert.throws(() => parseExchangeRate({ base: 'USD', quote: 'EUR', date: fx.date, rate: 1.1622 }, now));
});

test('unknown printing shows a range; special and first-edition finishes never borrow regular prices', () => {
  const s = snapshot('sm9-156');
  const q = quotePrice(s, 'unsure', fx, now);
  assert.equal(quoteLabel(q), '$0.34–$0.63'); assert.equal(q.unconfirmed, true);
  for (const finish of ['firstEdition', 'firstEditionHolo', 'firstEditionReverse', 'wPromo']) assert.equal(quotePrice(s, finish, fx, now), null);
  const data = { id: 'test-1', pricing: { tcgplayer: { unit: 'USD', updated: new Date(now).toISOString(), '1st-edition-holofoil': { marketPrice: 12.34 } } } };
  const edition = parseCardPricing(brief('test-1'), data, now);
  assert.equal(quotePrice(edition, 'firstEditionHolo', fx, now).low, 1234);
  assert.equal(quotePrice(edition, 'holo', fx, now), null);
});

test('missing, zero, malformed and wrong-currency prices remain unavailable', () => {
  for (const marketPrice of [null, undefined, 0, -1, NaN, Infinity, '500', 1e20]) {
    const s = parseCardPricing(brief(), { id: card.id, pricing: { tcgplayer: { unit: 'USD', updated: new Date(now).toISOString(), normal: { marketPrice } } } }, now);
    assert.equal(quotePrice(s, 'normal', fx, now), null);
  }
  const wrong = structuredClone(sample('base1-58')); wrong.pricing.tcgplayer.unit = 'JPY'; wrong.pricing.cardmarket = null;
  assert.equal(quotePrice(parseCardPricing(brief(), wrong, now), 'normal', fx, now), null);
  assert.throws(() => parseCardPricing(brief('different'), sample('base1-58'), now));
});

test('collection totals count physical copies once, include Trainer/Energy and show partial coverage', () => {
  const make = (id, finish, quantity, extras = {}) => ({ key: id + finish, card: { ...card, ...brief(id), ...extras }, finish, quantity });
  const entries = [make('base1-58', 'normal', 2), make('sm12-221', 'holo', 1, { dexIds: [483, 484, 493] }), make('sm9-156', 'unsure', 3, { category: 'Trainer', dexIds: [] }), make('missing-energy', 'normal', 4, { category: 'Energy' })];
  const data = Object.fromEntries(['base1-58', 'sm12-221', 'sm9-156'].map(id => [priceKey(brief(id)), snapshot(id)]));
  assert.deepEqual(collectionValue(entries, data, fx, now), { low: 60126, high: 60213, priced: 6, missing: 4, unconfirmed: 3, stale: 0 });
  assert.equal(collectionValue(entries, data, fx, now + 2 * DAY).stale, 6);
  assert.deepEqual(collectionValue([], data, fx, now), { low: 0, high: 0, priced: 0, missing: 0, unconfirmed: 0, stale: 0 });
});

test('correcting a saved printing merges copies without losing favorites or changing discovery', () => {
  let trainer = addCard(freshCollection().trainers[0], card, 'unsure', 2);
  trainer = addCard(trainer, card, 'normal', 3);
  trainer.entries[0].favorite = true;
  const result = changePrinting(trainer, entryKey(card, 'unsure'), 'normal');
  assert.equal(result.entries.length, 1); assert.equal(result.entries[0].quantity, 5); assert.equal(result.entries[0].favorite, true);
  assert.equal(result.entries[0].key, entryKey(card, 'normal'));
  assert.equal(trainer.entries.length, 2);
  const many = addCard(addCard(freshCollection().trainers[0], card, 'unsure', 999), card, 'normal', 1);
  assert.throws(() => changePrinting(many, entryKey(card, 'unsure'), 'normal'));
});

test('price cache tolerates corruption and preserves source dates for offline estimates', () => {
  const s = snapshot('base1-58');
  const restored = parsePriceCache(JSON.stringify({ version: 1, snapshots: [s], fx }), now);
  assert.equal(restored.snapshots[s.key].prices[0].updatedAt, s.prices[0].updatedAt);
  assert.equal(quotePrice(restored.snapshots[s.key], 'normal', fx, now + DAY * 2).stale, true);
  for (const raw of ['{', '{}', JSON.stringify({ version: 2, snapshots: [s] })]) assert.deepEqual(parsePriceCache(raw, now).snapshots, {});
  const bad = { ...s, key: '__proto__', prices: [{ amount: -9 }] };
  assert.deepEqual(parsePriceCache(JSON.stringify({ version: 1, snapshots: [bad] }), now).snapshots, {});
  const { allCards } = require('../.test-build/lib/catalog');
  const catalogSnapshots = Object.values(allCards).flat().map(card => ({ ...s, key: priceKey(card) }));
  for (let i = 0; i < catalogSnapshots.length; i += 4000) {
    const batch = catalogSnapshots.slice(i, i + 4000);
    assert.equal(Object.keys(parsePriceCache(JSON.stringify({ version: 1, snapshots: batch }), now).snapshots).length, batch.length);
  }
});

test('price requests coalesce, stay within three active calls, and cancel queued work after leaving', async () => {
  const pending = [], calls = [];
  let live = true;
  const client = new PriceClient({ now: () => now, read: async () => null, write: async () => {}, exchange: async () => ({}),
    card: c => new Promise(resolve => { calls.push(c.id); pending.push(() => resolve({ id: c.id })); }) });
  const cards = Array.from({ length: 8 }, (_, i) => brief(`test-${i}`));
  await client.ensure(cards, () => live); await client.ensure([cards[0]], () => true);
  assert.equal(calls.length, 3); assert.equal(calls.filter(id => id === cards[0].id).length, 1);
  live = false; pending.forEach(resolve => resolve());
  await until(() => !client.pending.size);
  assert.equal(calls.length, 3);
});

test('cached prices skip requests for a day; failed refresh keeps previous data and backs off', async () => {
  let clock = now, calls = 0, stored;
  const s = snapshot('base1-58');
  const client = new PriceClient({ now: () => clock, read: async () => JSON.stringify({ version: 1, snapshots: [s], fx }), write: async raw => { stored = raw; },
    card: async () => { calls++; throw new Error('offline'); }, exchange: async () => { throw new Error('offline'); } });
  await client.ensure([brief()]); assert.equal(calls, 0);
  clock += 2 * DAY; await client.ensure([brief()]); await until(() => !client.pending.size);
  assert.equal(calls, 1); assert.ok(client.errors.has(priceKey(brief())));
  assert.equal(quotePrice(client.snapshots[s.key], 'normal', client.fx, clock).low, 1610);
  await client.ensure([brief()]); assert.equal(calls, 1); assert.equal(stored, undefined);
});

test('FX failure never labels EUR as USD and successful snapshots persist separately', async () => {
  let writes = 0;
  const client = new PriceClient({ now: () => now, read: async () => null, write: async () => { writes++; }, card: async () => sample('SV5K-025', 'ja'), exchange: async () => { throw new Error('offline'); } });
  const jp = brief('SV5K-025', 'ja'); await client.ensure([jp]); await until(() => !client.pending.size); await client.flush();
  assert.equal(quotePrice(client.snapshots[priceKey(jp)], 'holo', client.fx, now), null);
  assert.ok(client.errors.has('fx')); assert.equal(writes, 1);
});
