const { test } = require('node:test');
const assert = require('node:assert/strict');
const { freshCollection, addCard, entryKey, discoveredIds, updateQuantity, undoAdditions, changePrinting, portableBackup, parseCollection, mergeBackup } = require('../.test-build/lib/model');
const { TRAINER_ACCESSORIES, unlockedTrainerAccessories, canEquipTrainerAccessory, awardTrainerAccessories } = require('../.test-build/lib/trainer-accessories');

const ids = ['fieldPin', 'explorerScarf', 'expeditionSatchel'];
const cardFor = id => ({
  id: `accessory-${id}`, localId: String(id), name: `Pokémon ${id}`, language: 'en',
  set: { id: 'accessory-test', name: 'Accessory test', total: 100 }, dexIds: [id],
  types: ['Grass'], category: 'Pokemon', rarity: 'Common', finishes: ['normal', 'holo', 'reverse', 'unsure'],
});
function withSpecies(count) {
  let trainer = freshCollection().trainers[0];
  for (let id = 1; id <= count; id++) trainer = addCard(trainer, cardFor(id), 'normal', 1);
  return trainer;
}
const collectionFor = trainer => ({ ...freshCollection(), activeId: trainer.id, trainers: [trainer] });
const restored = trainer => parseCollection(portableBackup(collectionFor(trainer))).trainers[0];

test('accessories unlock at 1, 10, and 25 Pokémon without changing the trainer’s look', () => {
  assert.deepEqual(TRAINER_ACCESSORIES.map(accessory => [accessory.id, accessory.target]), [[ids[0], 1], [ids[1], 10], [ids[2], 25]]);
  for (const [count, expected] of [[0, []], [1, ids.slice(0, 1)], [9, ids.slice(0, 1)], [10, ids.slice(0, 2)], [24, ids.slice(0, 2)], [25, ids]]) {
    const trainer = withSpecies(count);
    assert.deepEqual(unlockedTrainerAccessories(trainer), expected, `${count} discoveries`);
    assert.deepEqual(trainer.unlockedAccessories ?? [], expected);
    assert.equal(trainer.appearance.accessory, undefined, 'new rewards are not equipped automatically');
    assert.ok(canEquipTrainerAccessory(trainer, 'none'));
    for (const id of ids) assert.equal(canEquipTrainerAccessory(trainer, id), expected.includes(id));
  }
});

test('copies, languages, finishes, Trainer cards, and Energy cards do not inflate milestones', () => {
  let trainer = addCard(freshCollection().trainers[0], cardFor(1), 'normal', 90);
  trainer = addCard(trainer, { ...cardFor(1), language: 'ja' }, 'normal', 50);
  trainer = addCard(trainer, cardFor(1), 'reverse', 80);
  const misleadingDexIds = Array.from({ length: 30 }, (_, i) => i + 50);
  trainer = addCard(trainer, { ...cardFor(200), category: 'Trainer', dexIds: misleadingDexIds }, 'normal', 25);
  trainer = addCard(trainer, { ...cardFor(201), category: 'Energy', dexIds: misleadingDexIds }, 'normal', 25);
  for (let id = 2; id <= 9; id++) trainer = addCard(trainer, cardFor(id), 'normal', 1);
  assert.equal(discoveredIds(trainer).size, 9);
  assert.deepEqual(trainer.unlockedAccessories, ['fieldPin']);
  assert.equal(canEquipTrainerAccessory(trainer, 'explorerScarf'), false);
});

test('a Pokémon TAG TEAM can cross a milestone with multiple distinct species', () => {
  const trainer = addCard(withSpecies(8), { ...cardFor(100), tagTeam: true, dexIds: [8, 9, 10, 10] }, 'holo', 2);
  assert.equal(discoveredIds(trainer).size, 10);
  assert.deepEqual(trainer.unlockedAccessories, ['fieldPin', 'explorerScarf']);
});

test('earned accessories and the equipped selection survive removing every card', () => {
  const earned = withSpecies(25);
  let trainer = { ...earned, appearance: { ...earned.appearance, accessory: 'expeditionSatchel' } };
  for (const entry of trainer.entries) trainer = updateQuantity(trainer, entry.key, 0);
  assert.equal(trainer.entries.length, 0);
  assert.deepEqual(trainer.unlockedAccessories, ids);
  assert.equal(canEquipTrainerAccessory(trainer, 'expeditionSatchel'), true);
  assert.equal(restored(trainer).appearance.accessory, 'expeditionSatchel');
  assert.deepEqual(restored(trainer).unlockedAccessories, ids);
  assert.equal(earned.entries.length, 25, 'the original trainer remains unchanged');
});

test('undoing the milestone addition retains its reward and a later equipped selection', () => {
  let trainer = addCard(withSpecies(9), cardFor(10), 'normal', 1);
  trainer = { ...trainer, appearance: { ...trainer.appearance, accessory: 'explorerScarf' } };
  const undone = undoAdditions(trainer, [{ key: entryKey(cardFor(10), 'normal'), quantity: 1 }]);
  assert.equal(discoveredIds(undone).size, 9);
  assert.deepEqual(undone.unlockedAccessories, ['fieldPin', 'explorerScarf']);
  assert.equal(undone.appearance.accessory, 'explorerScarf');
  assert.ok(canEquipTrainerAccessory(restored(undone), 'explorerScarf'));
  const first = addCard(freshCollection().trainers[0], cardFor(1), 'normal', 1);
  assert.deepEqual(undoAdditions(first, [{ key: entryKey(cardFor(1), 'normal'), quantity: 1 }]).unlockedAccessories, ['fieldPin']);
});

test('changing a printing preserves the permanent ledger and cosmetic selection', () => {
  const base = withSpecies(10);
  const trainer = { ...base, appearance: { ...base.appearance, accessory: 'explorerScarf' } };
  const next = changePrinting(trainer, entryKey(cardFor(1), 'normal'), 'reverse');
  assert.deepEqual(next.unlockedAccessories, ['fieldPin', 'explorerScarf']);
  assert.equal(next.appearance.accessory, 'explorerScarf');
  assert.equal(discoveredIds(next).size, 10);
});

test('backup and import preserve accessory history independently for each trainer', () => {
  const earned = withSpecies(25);
  const traveler = { ...earned, entries: [], appearance: { ...earned.appearance, accessory: 'expeditionSatchel' } };
  const incoming = parseCollection(portableBackup(collectionFor(traveler)));
  const current = freshCollection();
  const merged = mergeBackup(current, incoming, 'accessories');
  assert.equal(merged.activeId, current.activeId);
  assert.deepEqual(merged.trainers[0], current.trainers[0]);
  assert.equal(canEquipTrainerAccessory(merged.trainers[0], 'expeditionSatchel'), false);
  assert.notEqual(merged.trainers[1].id, merged.trainers[0].id);
  assert.deepEqual(merged.trainers[1].unlockedAccessories, ids);
  assert.equal(merged.trainers[1].appearance.accessory, 'expeditionSatchel');
  assert.deepEqual(parseCollection(portableBackup(merged)).trainers[1].unlockedAccessories, ids);
});

test('older saves silently receive eligible rewards while preserving omitted appearance fields', () => {
  const legacy = collectionFor(withSpecies(25));
  delete legacy.trainers[0].unlockedAccessories;
  const migrated = parseCollection(JSON.stringify(legacy)).trainers[0];
  assert.deepEqual(migrated.unlockedAccessories, ids);
  assert.deepEqual(migrated.appearance, legacy.trainers[0].appearance);
  assert.equal(Object.hasOwn(migrated.appearance, 'accessory'), false);
  const blank = freshCollection();
  assert.deepEqual(parseCollection(JSON.stringify(blank)), blank, 'empty old collections keep their shape');
  delete blank.trainers[0].appearance;
  const defaulted = parseCollection(JSON.stringify(blank)).trainers[0];
  assert.equal(Object.hasOwn(defaulted.appearance, 'accessory'), false);
  assert.equal(Object.hasOwn(defaulted, 'unlockedAccessories'), false);
});

test('unknown and duplicate cosmetic history values are dropped without rejecting the binder', () => {
  const collection = freshCollection();
  collection.trainers[0].unlockedAccessories = ['futureAccessory', null, { id: 'fieldPin' }, 'explorerScarf', 'fieldPin', 'explorerScarf', '__proto__'];
  collection.trainers[0].appearance.accessory = 'explorerScarf';
  const trainer = parseCollection(JSON.stringify(collection)).trainers[0];
  assert.deepEqual(trainer.unlockedAccessories, ['fieldPin', 'explorerScarf']);
  assert.equal(trainer.appearance.accessory, 'explorerScarf');
  assert.equal(canEquipTrainerAccessory(trainer, 'futureAccessory'), false);
});

test('malformed cosmetic ledgers and equipped values fall back safely', () => {
  for (const value of [null, false, 42, 'fieldPin', { fieldPin: true }]) {
    const collection = freshCollection();
    collection.trainers[0].unlockedAccessories = value;
    collection.trainers[0].appearance.accessory = 'fieldPin';
    const trainer = parseCollection(JSON.stringify(collection)).trainers[0];
    assert.equal(trainer.unlockedAccessories, undefined);
    assert.equal(trainer.appearance.accessory, 'none');
    assert.equal(trainer.entries.length, 0);
  }
  for (const value of ['futureAccessory', '__proto__', null, false, 42, [], {}]) {
    const collection = collectionFor(withSpecies(1));
    collection.trainers[0].appearance.accessory = value;
    const trainer = parseCollection(JSON.stringify(collection)).trainers[0];
    assert.equal(trainer.appearance.accessory, 'none');
    assert.deepEqual(trainer.unlockedAccessories, ['fieldPin']);
    assert.equal(trainer.entries.length, 1);
  }
});

test('an unearned valid selection is cleared, and none remains an explicit valid selection', () => {
  const collection = collectionFor(withSpecies(1));
  collection.trainers[0].appearance.accessory = 'expeditionSatchel';
  assert.equal(parseCollection(JSON.stringify(collection)).trainers[0].appearance.accessory, 'none');
  collection.trainers[0].appearance.accessory = 'none';
  assert.equal(parseCollection(JSON.stringify(collection)).trainers[0].appearance.accessory, 'none');
});

test('awarding rewards normalizes history without mutating the source trainer', () => {
  const trainer = { ...freshCollection().trainers[0], unlockedAccessories: ['explorerScarf', 'futureAccessory', 'explorerScarf'], appearance: { ...freshCollection().trainers[0].appearance, accessory: 'explorerScarf' } };
  const normalized = awardTrainerAccessories(trainer);
  assert.deepEqual(normalized.unlockedAccessories, ['explorerScarf']);
  assert.equal(normalized.appearance.accessory, 'explorerScarf');
  assert.deepEqual(trainer.unlockedAccessories, ['explorerScarf', 'futureAccessory', 'explorerScarf']);
});
