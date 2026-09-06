const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sortBinderEntries, needsPrinting } = require('../.test-build/lib/binder-order');
const { collectionValue } = require('../.test-build/lib/pricing');
const { changePrinting, freshCollection, addCard } = require('../.test-build/lib/model');
const now = Date.now();
const card = { id: 'one', language: 'en', localId: '1', name: 'Test', set: { id: 'test', name: 'Test', total: 3 }, dexIds: [], types: [], category: 'Trainer', rarity: 'Common', finishes: ['normal', 'reverse', 'unsure'] };
function entry(id, finish = 'normal', quantity = 1, day = 1) {
  return { key: `${id}:${finish}`, card: { ...card, id }, finish, quantity, favorite: false, addedAt: `2026-09-${String(day).padStart(2, '0')}T12:00:00Z` };
}
function snapshot(id, normal, reverse, currency = 'USD') {
  return { key: `en:${id}`, checkedAt: now, finishes: ['normal','reverse'], prices: [['normal',normal],['reverse',reverse]].filter(([,p])=>p !== undefined).map(([finish,amount])=>({finish,amount,currency,source:currency==='USD'?'TCGplayer':'Cardmarket',updatedAt:new Date(now).toISOString()})) };
}
const ids = rows => rows.map(e => e.card.id);

test('price order compares unit estimates, uses the lower range bound and leaves missing prices last both ways', () => {
  const rows = [entry('missing'), entry('range','unsure',1), entry('low','normal',999), entry('high')];
  const snapshots = { 'en:range': snapshot('range', 2, 100), 'en:low': snapshot('low',1), 'en:high': snapshot('high',3) };
  assert.deepEqual(ids(sortBinderEntries(rows,'priceHigh',snapshots)), ['high','range','low','missing']);
  assert.deepEqual(ids(sortBinderEntries(rows,'priceLow',snapshots)), ['low','range','high','missing']);
  assert.deepEqual(ids(rows), ['missing','range','low','high']);
});

test('sorting uses selected printing, converted USD and stable ties as prices arrive', () => {
  const rows = [entry('reverse','reverse'), entry('eur'), entry('tie')];
  const snapshots = { 'en:reverse': snapshot('reverse', 1, 5), 'en:eur': snapshot('eur',3,undefined,'EUR'), 'en:tie': snapshot('tie',5) };
  assert.deepEqual(ids(sortBinderEntries(rows,'priceHigh',snapshots)), ['reverse','tie','eur']);
  assert.deepEqual(ids(sortBinderEntries(rows,'priceHigh',snapshots,{rate:2,date:'2026-09-06',checkedAt:now})), ['eur','reverse','tie']);
});

test('needs-printing filter and ordering include unpriced entries, and recent order uses date', () => {
  const rows = [entry('old','normal',1,1), entry('unknown','unsure',2,2), entry('new','normal',1,3), entry('other','unsure',1,1)];
  assert.deepEqual(ids(rows.filter(needsPrinting)), ['unknown','other']);
  assert.deepEqual(ids(sortBinderEntries(rows,'needsPrinting',{})), ['unknown','other','new','old']);
  assert.deepEqual(ids(sortBinderEntries(rows,'recent',{})), ['new','unknown','old','other']);
  const total = collectionValue(rows,{});
  assert.equal(total.unconfirmed,3); assert.equal(total.missing,5);
});

test('confirming a printing removes it from the attention filter and preserves physical count', () => {
  const trainer = addCard(freshCollection().trainers[0], card, 'unsure', 2);
  const updated = changePrinting(trainer,trainer.entries[0].key,'reverse');
  assert.equal(trainer.entries.filter(needsPrinting).length,1);
  assert.equal(updated.entries.filter(needsPrinting).length,0);
  assert.equal(updated.entries[0].quantity,2);
});
