const { test } = require('node:test');
const assert = require('node:assert/strict');
const { freshCollection, addCard, entryKey, updateQuantity, undoAdditions, defaultFinish, totalCards } = require('../.test-build/lib/model');
const card = { id: 'base1-58', localId: '58', name: 'Pikachu', language: 'en', set: { id: 'base1', name: 'Base Set', total: 102 }, dexIds: [25], types: ['Lightning'], category: 'Pokemon', rarity: 'Common', finishes: ['normal', 'unsure'] };
const other = { ...card, id: 'base1-4', localId: '4', name: 'Charizard', dexIds: [6], finishes: ['holo', 'reverse', 'unsure'] };

test('undo removes only the copies that were just added', () => {
  let t = addCard(freshCollection().trainers[0], card, 'normal', 2);
  t = addCard(addCard(t, card, 'normal', 1), other, 'unsure', 1);
  const undone = undoAdditions(t, [{ key: entryKey(card, 'normal'), quantity: 1 }, { key: entryKey(other, 'unsure'), quantity: 1 }]);
  assert.equal(totalCards(undone), 2);
  assert.deepEqual(undone.entries.map(e => [e.key, e.quantity]), [[entryKey(card, 'normal'), 2]]);
});

test('undo keeps changes made after adding and ignores cards already removed', () => {
  let t = addCard(freshCollection().trainers[0], card, 'normal', 1);
  t = addCard(t, other, 'unsure', 1);
  t = updateQuantity(t, entryKey(card, 'normal'), 0);
  t = { ...t, entries: t.entries.map(e => ({ ...e, favorite: true })) };
  const undone = undoAdditions(addCard(t, other, 'unsure', 1), [{ key: entryKey(other, 'unsure'), quantity: 1 }, { key: entryKey(card, 'normal'), quantity: 1 }]);
  assert.deepEqual(undone.entries.map(e => [e.key, e.quantity, e.favorite]), [[entryKey(other, 'unsure'), 1, true]]);
});

test('a single known printing is chosen automatically; several wait for the collector', () => {
  assert.equal(defaultFinish(card), 'normal');
  assert.equal(defaultFinish(other), 'unsure');
  assert.equal(defaultFinish({ ...card, finishes: ['unsure'] }), 'unsure');
});
