const { test } = require('node:test');

const assert = require('node:assert/strict');

const fs = require('node:fs');

const path = require('node:path');

const {
  BADGES,
  freshCollection,
  addCard,
  entryKey,
  updateQuantity,
  undoAdditions,
  portableBackup,
  parseCollection,
  mergeBackup,
  earnedBadgeIds,
} = require('../.test-build/lib/model');

const {
  SIDEKICKS,
  findSidekick,
  sidekickForBadge,
  isStarterSidekick,
  unlockedSidekicks,
  canChooseSidekick,
  awardSidekicks,
  newSidekicks,
} = require('../.test-build/lib/sidekicks');

const { earnedBadges } = require('../.test-build/lib/badge-details');

const starters = ['pikachu', 'bulbasaur', 'charmander', 'squirtle'];

const cardFor = (id) => ({
  id: `sidekick-${id}`,
  localId: String(id),
  name: `Pokémon ${id}`,
  language: 'en',
  set: { id: 'sidekick-test', name: 'Sidekick test', total: 999 },
  dexIds: [id],
  types: ['Grass'],
  category: 'Pokemon',
  rarity: 'Common',
  finishes: ['normal', 'holo', 'reverse', 'unsure'],
});

function withSpecies(ids) {
  let trainer = freshCollection().trainers[0];

  for (const id of ids) trainer = addCard(trainer, cardFor(id), 'normal', 1);

  return trainer;
}

const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

const collectionFor = (trainer) => ({ ...freshCollection(), activeId: trainer.id, trainers: [trainer] });

const restored = (trainer) => parseCollection(portableBackup(collectionFor(trainer))).trainers[0];

const choosing = (trainer, sidekick) => ({ ...trainer, appearance: { ...trainer.appearance, sidekick } });

test('four starters are ready and every badge earns its own sidekick', () => {
  assert.deepEqual(
    SIDEKICKS.filter(isStarterSidekick).map((sidekick) => sidekick.id),
    starters,
  );
  assert.equal(new Set(SIDEKICKS.map((sidekick) => sidekick.id)).size, SIDEKICKS.length);
  assert.equal(new Set(SIDEKICKS.map((sidekick) => sidekick.dexId)).size, SIDEKICKS.length);

  for (const badge of BADGES) assert.ok(sidekickForBadge(badge.id), `${badge.id} has a sidekick`);
  const rewards = SIDEKICKS.filter((sidekick) => !isStarterSidekick(sidekick));
  assert.equal(rewards.length, BADGES.length);
  assert.deepEqual(new Set(rewards.map((sidekick) => sidekick.badge)), new Set(BADGES.map((badge) => badge.id)));
  assert.equal(findSidekick('missingno'), undefined);
});

test('every sidekick has bundled art that the refresh script rebuilds', () => {
  const root = path.join(__dirname, '..');
  const script = fs.readFileSync(path.join(root, 'scripts/refresh-sidekick-art.sh'), 'utf8');
  const art = fs.readFileSync(path.join(root, 'src/components/sidekick-art.tsx'), 'utf8');

  for (const { id, dexId } of SIDEKICKS) {
    assert.ok(fs.existsSync(path.join(root, `assets/images/sidekicks/sidekick-${id}.webp`)), `${id} art`);
    assert.match(script, new RegExp(`^${id} ${dexId}$`, 'm'), `${id} is in the refresh list`);
    assert.ok(art.includes(`sidekick-${id}.webp`), `${id} is required by SidekickArt`);
  }
});

test('a new trainer can choose a starter but no badge sidekick, and saves no ledger', () => {
  const trainer = freshCollection().trainers[0];
  assert.deepEqual(unlockedSidekicks(trainer, []), starters);
  assert.ok(canChooseSidekick(trainer, 'none', []));
  assert.ok(canChooseSidekick(trainer, 'pikachu', []));
  assert.equal(canChooseSidekick(trainer, 'eevee', []), false);
  assert.equal(awardSidekicks(trainer, []), trainer, 'nothing to record leaves the trainer unchanged');
  assert.equal(Object.hasOwn(restored(trainer), 'unlockedSidekicks'), false);
  assert.equal(Object.hasOwn(restored(trainer).appearance, 'sidekick'), false);
});

test('discovery badges unlock their sidekicks as cards are added, without equipping them', () => {
  const one = withSpecies([1]);
  assert.deepEqual(one.unlockedSidekicks, ['pichu']);
  assert.equal(one.appearance.sidekick, undefined);
  assert.deepEqual(
    newSidekicks(freshCollection().trainers[0], one).map((sidekick) => sidekick.id),
    ['pichu'],
  );

  const nine = withSpecies(range(1, 9));
  const ten = addCard(nine, cardFor(10), 'normal', 1);
  assert.deepEqual(nine.unlockedSidekicks, ['pichu', 'charizard']);
  assert.deepEqual(ten.unlockedSidekicks, ['pichu', 'growlithe', 'charizard']);
  assert.deepEqual(
    newSidekicks(nine, ten).map((sidekick) => sidekick.id),
    ['growlithe'],
  );
  assert.deepEqual(newSidekicks(ten, addCard(ten, cardFor(11), 'normal', 1)), []);
});

test('species-set, card-count and language badges each unlock their sidekick', () => {
  assert.ok(withSpecies([144, 145, 146]).unlockedSidekicks.includes('zapdos'));
  assert.equal(withSpecies([144, 145]).unlockedSidekicks.includes('zapdos'), false);
  assert.ok(withSpecies([133, 134, 135, 136, 196, 197, 470, 471, 700]).unlockedSidekicks.includes('eevee'));

  const binder = addCard(freshCollection().trainers[0], cardFor(1), 'normal', 100);
  assert.deepEqual(binder.unlockedSidekicks, ['pichu', 'snorlax']);

  const world = addCard(withSpecies([1]), { ...cardFor(1), language: 'ja' }, 'normal', 1);
  assert.ok(world.unlockedSidekicks.includes('lapras'));
});

test('badge sidekicks and the chosen one stay after every card is removed or the add is undone', () => {
  let trainer = choosing(withSpecies(range(1, 10)), 'growlithe');

  for (const entry of trainer.entries) trainer = updateQuantity(trainer, entry.key, 0);
  assert.equal(trainer.entries.length, 0);
  assert.deepEqual(trainer.unlockedSidekicks, ['pichu', 'growlithe', 'charizard']);
  assert.equal(restored(trainer).appearance.sidekick, 'growlithe');
  assert.ok(canChooseSidekick(restored(trainer), 'growlithe', []));

  const added = addCard(withSpecies(range(1, 9)), cardFor(10), 'normal', 1);
  const undone = undoAdditions(added, [{ key: entryKey(cardFor(10), 'normal'), quantity: 1 }]);
  assert.ok(undone.unlockedSidekicks.includes('growlithe'));
});

test('earned badge ids passed in by screens unlock and are written to the ledger', () => {
  const trainer = freshCollection().trainers[0];
  assert.ok(canChooseSidekick(trainer, 'gengar', ['set-master']));
  const awarded = awardSidekicks(choosing(trainer, 'gengar'), ['set-master']);
  assert.deepEqual(awarded.unlockedSidekicks, ['gengar']);
  assert.equal(awarded.appearance.sidekick, 'gengar');
  assert.ok(canChooseSidekick(awarded, 'gengar', []));
});

test('a locked or unknown choice falls back to no sidekick without rejecting the save', () => {
  const trainer = freshCollection().trainers[0];
  assert.equal(awardSidekicks(choosing(trainer, 'mew'), []).appearance.sidekick, 'none');
  assert.equal(awardSidekicks(choosing(trainer, 'pikachu'), []).appearance.sidekick, 'pikachu');

  const saved = collectionFor(trainer);
  saved.trainers[0].appearance = { ...trainer.appearance, sidekick: 'missingno' };
  saved.trainers[0].unlockedSidekicks = ['mew', 'missingno', 42];
  const parsed = parseCollection(JSON.stringify(saved)).trainers[0];
  assert.equal(parsed.appearance.sidekick, 'none');
  assert.deepEqual(parsed.unlockedSidekicks, ['mew'], 'known ledger entries are kept, the rest dropped');

  saved.trainers[0].unlockedSidekicks = 'everything';
  assert.equal(Object.hasOwn(parseCollection(JSON.stringify(saved)).trainers[0], 'unlockedSidekicks'), false);
});

test('older saves silently receive the sidekicks their badges already earned', () => {
  const legacy = collectionFor(withSpecies(range(1, 10)));
  delete legacy.trainers[0].unlockedSidekicks;
  const migrated = parseCollection(JSON.stringify(legacy)).trainers[0];
  assert.deepEqual(migrated.unlockedSidekicks, ['pichu', 'growlithe', 'charizard']);
  assert.equal(Object.hasOwn(migrated.appearance, 'sidekick'), false);
});

test('import keeps each trainer’s sidekicks to that trainer', () => {
  const traveler = { ...choosing(withSpecies([144, 145, 146]), 'zapdos'), entries: [] };
  const incoming = parseCollection(portableBackup(collectionFor(traveler)));
  const current = freshCollection();
  const merged = mergeBackup(current, incoming, 'sidekicks');
  assert.deepEqual(merged.trainers[0], current.trainers[0]);
  assert.equal(canChooseSidekick(merged.trainers[0], 'zapdos', []), false);
  assert.equal(merged.trainers[1].appearance.sidekick, 'zapdos');
  assert.ok(merged.trainers[1].unlockedSidekicks.includes('zapdos'));
});

test('the model and the Badges tab agree on earned badges', () => {
  const trainer = withSpecies(range(1, 151));
  const discovered = new Set(range(1, 151));
  assert.deepEqual(earnedBadges(trainer, discovered, []), earnedBadgeIds(trainer));
  assert.ok(trainer.unlockedSidekicks.includes('mew'));
  assert.ok(trainer.unlockedSidekicks.includes('mewtwo'));
});
