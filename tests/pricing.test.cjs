const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DAY, HOUR, priceKey, parseCardPricing, parseExchangeRate, quotePrice, quoteLabel, collectionValue, mostValuable, rankByValue, valueByGroup, newestPriceDate, missingPriceReason, needsRefresh, parsePriceCache } = require('../.test-build/lib/pricing');
const { PriceClient } = require('../.test-build/lib/price-client');
const { fetchCardData } = require('../.test-build/lib/card-api');
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

test('the most valuable printing ranks by its low estimate and skips unpriced cards', () => {
  const make = (id, finish, quantity = 1) => ({ key: id + finish, card: { ...card, ...brief(id) }, finish, quantity });
  const data = Object.fromEntries(['base1-58', 'sm12-221', 'sm9-156'].map(id => [priceKey(brief(id)), snapshot(id)]));
  // Quantity never promotes a cheap card: ten Stadiums are still worth less each than one TAG TEAM.
  const top = mostValuable([make('sm9-156', 'unsure', 10), make('missing', 'normal'), make('sm12-221', 'holo'), make('base1-58', 'normal', 3)], data, fx, now);
  assert.equal(top.entry.card.id, 'sm12-221'); assert.equal(top.quote.low, 56804);
  assert.equal(mostValuable([make('missing', 'normal')], data, fx, now), undefined);
});

test('ranking lists every priced printing by per-copy value, keeping collection order for ties', () => {
  const make = (id, finish, quantity = 1, key = id + finish) => ({ key, card: { ...card, ...brief(id) }, finish, quantity });
  const data = Object.fromEntries(['base1-58', 'sm12-221', 'sm9-156'].map(id => [priceKey(brief(id)), snapshot(id)]));
  const ranked = rankByValue([make('sm9-156', 'unsure', 10), make('missing', 'normal'), make('base1-58', 'normal', 3, 'first'), make('sm12-221', 'holo'), make('sm9-156', 'reverse'), make('base1-58', 'normal', 1, 'second')], data, fx, now);
  assert.deepEqual(ranked.map(r => r.entry.key), ['sm12-221holo', 'first', 'second', 'sm9-156reverse', 'sm9-156unsure']);
  assert.deepEqual(ranked.map(r => r.quote.low), [56804, 1610, 1610, 63, 34]);
  assert.equal(ranked.at(-1).quote.high, 63);
  assert.deepEqual(rankByValue([], data, fx, now), []);
});

test('value groups add up to the collection total and put the most valuable group first', () => {
  const make = (id, finish, quantity) => ({ key: id + finish, card: { ...card, ...brief(id) }, finish, quantity });
  const entries = [make('base1-58', 'normal', 2), make('sm9-156', 'unsure', 3), make('missing-1', 'normal', 4), make('sm12-221', 'holo', 1), make('nothing-1', 'normal', 1)];
  const data = Object.fromEntries(['base1-58', 'sm12-221', 'sm9-156'].map(id => [priceKey(brief(id)), snapshot(id)]));
  const groups = valueByGroup(entries, data, fx, e => e.card.id.split('-')[0], now);
  assert.deepEqual(groups.map(g => [g.key, g.low, g.high, g.copies, g.priced, g.missing]), [
    ['sm12', 56804, 56804, 1, 1, 0], ['base1', 3220, 3220, 2, 2, 0], ['sm9', 102, 189, 3, 3, 0],
    // Unpriced groups follow, larger first.
    ['missing', 0, 0, 4, 0, 4], ['nothing', 0, 0, 1, 0, 1],
  ]);
  assert.equal(groups.find(g => g.key === 'sm9').unconfirmed, 3);
  assert.deepEqual(groups[1].entries, [entries[0]]);
  const total = collectionValue(entries, data, fx, now);
  assert.equal(groups.reduce((sum, g) => sum + g.low, 0), total.low);
  assert.equal(groups.reduce((sum, g) => sum + g.high, 0), total.high);
  assert.equal(groups.reduce((sum, g) => sum + g.copies, 0), total.priced + total.missing);
  assert.deepEqual(valueByGroup([], data, fx, e => e.card.language, now), []);
});

test('the newest price date comes from the latest provider update among priced cards', () => {
  const at = updatedAt => ({ quote: { updatedAt } });
  assert.equal(newestPriceDate([at('2026-09-01T22:54:00.000Z'), at('2026-10-02T22:54:00.000Z'), at('2026-09-30T00:00:00Z')]), '2026-10-02T22:54:00.000Z');
  assert.equal(newestPriceDate([]), undefined);
});

test('missing prices explain themselves: loading, failed, exchange rate, wrong printing or not listed', () => {
  const idle = { pending: false, failed: false };
  assert.equal(missingPriceReason(snapshot('base1-58'), 'normal', fx, { pending: true, failed: false }), 'loading');
  assert.equal(missingPriceReason(undefined, 'normal', fx, idle), 'loading');
  assert.equal(missingPriceReason(undefined, 'normal', fx, { pending: false, failed: true }), 'failed');
  const jp = snapshot('SV5K-025', 'ja');
  assert.equal(missingPriceReason(jp, 'holo', undefined, idle), 'exchange');
  assert.equal(missingPriceReason(jp, 'unsure', undefined, idle), 'exchange');
  // A Holo saved for a card that only has Regular and Reverse prices.
  assert.equal(missingPriceReason(snapshot('sm9-156'), 'holo', fx, idle), 'printing');
  assert.equal(missingPriceReason(snapshot('sm12-221'), 'normal', fx, idle), 'printing');
  const empty = { key: 'en:x', checkedAt: now, finishes: [], prices: [] };
  assert.equal(missingPriceReason(empty, 'normal', fx, idle), 'unlisted');
  assert.equal(missingPriceReason(empty, 'unsure', fx, { pending: false, failed: true }), 'unlisted');
});

test('prices refresh when the provider’s next daily update is due, without hourly retries for stalled listings', () => {
  const published = Date.parse('2026-10-01T22:54:00Z');
  const at = (checkedAt, updatedAt = published) => ({ key: 'en:x', checkedAt, finishes: ['normal'], prices: [{ finish: 'normal', amount: 1, currency: 'USD', source: 'TCGplayer', updatedAt: new Date(updatedAt).toISOString() }] });
  // Fetched the afternoon after a publish: wait for the next publish (plus slack), not a full day after fetching.
  const afternoon = at(published + 20 * HOUR);
  assert.equal(needsRefresh(afternoon, published + 24 * HOUR), false);
  assert.equal(needsRefresh(afternoon, published + DAY + HOUR), true);
  // The same check right after fetching never repeats within the hour.
  assert.equal(needsRefresh(at(published + DAY + 30 * 60_000), published + DAY + HOUR + 1), false);
  // Prices that were already a day old when fetched (the provider was late, or the card stopped trading) wait a full day.
  const late = at(published + DAY + 2 * HOUR);
  assert.equal(needsRefresh(late, published + DAY + 5 * HOUR), false);
  assert.equal(needsRefresh(late, published + 2 * DAY + 2 * HOUR), true);
  // Cards with no price at all keep the daily check.
  const empty = { key: 'en:x', checkedAt: now, finishes: [], prices: [] };
  assert.equal(needsRefresh(empty, now + DAY - 1), false); assert.equal(needsRefresh(empty, now + DAY), true);
});

test('an early refresh skips a shared card response older than the snapshot it replaces', async () => {
  const s = snapshot('base1-58'), published = Date.parse(s.prices[0].updatedAt);
  let clock = published + 20 * HOUR; const calls = [];
  const cached = { ...s, checkedAt: clock };
  const client = new PriceClient({ now: () => clock, read: async () => JSON.stringify({ version: 1, snapshots: [cached], fx }), write: async () => {}, exchange: async () => ({}),
    card: async (c, force, after) => { calls.push({ force, after }); return sample('base1-58'); } });
  await client.ensure([brief()]); assert.equal(calls.length, 0);
  clock = published + DAY + 2 * HOUR; await client.ensure([brief()]); await until(() => !client.pending.size);
  assert.deepEqual(calls, [{ force: false, after: cached.checkedAt }]);
  assert.equal(client.snapshots[s.key].checkedAt, clock);

  const originalFetch = global.fetch; let requests = 0;
  global.fetch = async () => { requests++; return { ok: true, json: async () => ({ id: 'shared-1' }) }; };
  try {
    const shared = brief('shared-1');
    await fetchCardData(shared); await fetchCardData(shared); assert.equal(requests, 1);
    await fetchCardData(shared, false, Date.now() + 1); assert.equal(requests, 2);
  } finally { global.fetch = originalFetch; }
});

test('a burst of settled prices repaints listeners once with a fresh state, and waking notifies screens to re-check', async () => {
  const pending = [];
  const client = new PriceClient({ now: () => now, read: async () => null, write: async () => {}, exchange: async () => ({}),
    card: c => new Promise(resolve => pending.push(() => resolve({ id: c.id }))) });
  let repaints = 0; client.subscribe(() => repaints++);
  // Screens are memoized by the React Compiler, so they read an immutable state that is replaced on every change.
  const initial = client.getState();
  assert.equal(client.getState(), initial); assert.equal(initial.ready, false);
  await client.ensure(Array.from({ length: 3 }, (_, i) => brief(`burst-${i}`)));
  const loading = client.getState();
  assert.notEqual(loading, initial); assert.equal(loading.ready, true); assert.equal(loading.pending.size, 3);
  await new Promise(resolve => setTimeout(resolve, 80)); repaints = 0;
  const before = client.revision;
  pending.forEach(resolve => resolve()); await until(() => !client.pending.size);
  assert.ok(client.revision - before >= 3);
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(repaints, 1);
  assert.equal(client.getState().pending.size, 0); assert.equal(loading.pending.size, 3);
  assert.equal(Object.keys(client.getState().snapshots).length, 3);
  client.wake(); assert.equal(client.getState().wakes, 1);
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(repaints, 2);
});
