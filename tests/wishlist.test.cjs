const { test } = require('node:test');

const assert = require('node:assert/strict');

const {
  freshCollection,
  addCard,
  updateQuantity,
  entryKey,
  parseCollection,
  portableBackup,
  mergeBackup,
  totalCards,
} = require('../.test-build/lib/model');

const {
  WISHLIST_LIMIT,
  addWish,
  isWished,
  removeWish,
  restoreWish,
  toggleWish,
  wishKey,
  wishesForSpecies,
  wishesOf,
  wishlistShareText,
} = require('../.test-build/lib/wishlist');

const charizard = {
  id: 'sv03-125',
  localId: '125',
  name: 'Charizard ex',
  language: 'en',
  image: 'https://assets.tcgdex.net/en/sv/sv03/125',
};

const pikachu = {
  id: 'base1-58',
  localId: '58',
  name: 'Pikachu',
  language: 'en',
  image: 'https://assets.tcgdex.net/en/base/base1/58',
};

const fullPikachu = {
  ...pikachu,
  set: { id: 'base1', name: 'Base Set', total: 102 },
  dexIds: [25],
  types: ['Lightning'],
  category: 'Pokemon',
  rarity: 'Common',
  finishes: ['normal', 'unsure'],
};

const trainer = () => freshCollection().trainers[0];

test('toggling a wish adds it once and removes it again', () => {
  const original = trainer();
  const wished = toggleWish(original, charizard, [6]);
  assert.ok(isWished(wished, charizard));
  assert.equal(wishesOf(wished).length, 1);
  assert.equal(wishesOf(wished)[0].key, 'en:sv03-125');
  assert.deepEqual(
    wishesForSpecies(wished, 6).map((w) => w.card.id),
    ['sv03-125'],
  );
  assert.ok(!isWished(toggleWish(wished, charizard), charizard));
  assert.equal(wishesOf(original).length, 0);
});

test('wishes are deduped by language + card id and keep only catalog identity', () => {
  let t = addWish(trainer(), {
    ...pikachu,
    localImage: 'file:///device/photo.jpg',
    set: { id: 'base1', name: 'Base Set', total: 102 },
  });

  const same = addWish(t, pikachu);
  assert.equal(same, t, 'wishing again is a no-op');
  t = addWish(t, { ...pikachu, language: 'ja' });
  assert.equal(wishesOf(t).length, 2);
  assert.deepEqual(Object.keys(wishesOf(t)[0].card).sort(), ['id', 'image', 'language', 'localId', 'name']);
  // Legacy in-memory trainers with no wishlist field still work.
  const legacy = { ...trainer() };
  delete legacy.wishlist;
  assert.ok(isWished(addWish(legacy, pikachu), pikachu));
  assert.equal(wishesOf(removeWish(legacy, wishKey(pikachu))).length, 0);
});

test('undo restores a removed wish in its old place', () => {
  let t = [charizard, pikachu, { ...pikachu, language: 'ja' }].reduce((acc, c) => addWish(acc, c), trainer());
  const removed = wishesOf(t)[1];
  t = restoreWish(removeWish(t, removed.key), removed, 1);
  assert.deepEqual(
    wishesOf(t).map((w) => w.key),
    ['en:sv03-125', 'en:base1-58', 'ja:base1-58'],
  );
  assert.equal(restoreWish(t, removed, 0), t, 'no duplicate when it is already back');
});

test('the wishlist has a size limit', () => {
  let t = trainer();

  for (let i = 0; i < WISHLIST_LIMIT; i++) t = addWish(t, { ...pikachu, id: `test-${i}` });
  assert.throws(() => addWish(t, charizard), /wishlist is full/);
  assert.equal(addWish(t, { ...pikachu, id: 'test-0' }), t);
});

test('adding a card to the binder grants the wish for any printing, only for that language', () => {
  let t = addWish(addWish(addWish(trainer(), pikachu, [25]), { ...pikachu, language: 'ja' }, [25]), charizard, [6]);
  t = addCard(t, fullPikachu, 'reverse', 1);
  assert.ok(!isWished(t, pikachu));
  assert.ok(isWished(t, { ...pikachu, language: 'ja' }));
  assert.ok(isWished(t, charizard));
  assert.equal(totalCards(t), 1);
  // Removing the card later does not bring the wish back.
  assert.ok(!isWished(updateQuantity(t, entryKey(fullPikachu, 'reverse'), 0), pikachu));
});

test('older saves without a wishlist load with an empty one', () => {
  const c = freshCollection();
  c.trainers[0] = addCard(c.trainers[0], fullPikachu, 'normal', 2);
  const legacy = structuredClone(c);
  delete legacy.trainers[0].wishlist;
  const restored = parseCollection(JSON.stringify(legacy));
  assert.deepEqual(restored.trainers[0].wishlist, []);
  assert.equal(totalCards(restored.trainers[0]), 2);
});

test('malformed wishlist data is dropped without losing the binder', () => {
  const c = freshCollection();
  c.trainers[0] = addCard(c.trainers[0], fullPikachu, 'normal', 1);
  const good = wishesOf(addWish(trainer(), charizard, [6]))[0];

  for (const junk of ['nope', 42, null, { length: 3 }]) {
    const broken = structuredClone(c);
    broken.trainers[0].wishlist = junk;
    const restored = parseCollection(JSON.stringify(broken));
    assert.deepEqual(restored.trainers[0].wishlist, []);
    assert.equal(totalCards(restored.trainers[0]), 1);
  }

  const broken = structuredClone(c);
  broken.trainers[0].wishlist = [
    null,
    'card',
    { card: null, addedAt: good.addedAt },
    { ...good, addedAt: 'someday' },
    { ...good, card: { ...good.card, image: 'https://evil.example/art.png' } },
    { ...good, card: { ...good.card, language: 'xx' } },
    { ...good, card: { ...good.card, id: '' } },
    {
      ...good,
      key: 'en:something-else',
      dexIds: [6, 6, -1, 'x', 1.5],
      extra: '<script>',
      card: { ...good.card, localImage: 'file:///device/photo.jpg', set: { id: 'sv03' } },
    },
    good,
  ];
  const [wish] = parseCollection(JSON.stringify(broken)).trainers[0].wishlist;
  assert.equal(
    parseCollection(JSON.stringify(broken)).trainers[0].wishlist.length,
    1,
    'invalid and duplicate wishes dropped',
  );
  assert.deepEqual(wish, { key: 'en:sv03-125', card: charizard, dexIds: [6], addedAt: good.addedAt });
  const huge = structuredClone(c);
  huge.trainers[0].wishlist = Array.from({ length: WISHLIST_LIMIT + 50 }, (_, i) => ({
    ...good,
    card: { ...good.card, id: `test-${i}` },
  }));
  assert.equal(parseCollection(JSON.stringify(huge)).trainers[0].wishlist.length, WISHLIST_LIMIT);
});

test("backups and imports keep each trainer's wishlist", () => {
  const c = freshCollection();
  c.trainers[0] = addWish(
    addWish(addCard(c.trainers[0], fullPikachu, 'normal', 1), charizard, [6]),
    { ...pikachu, id: 'base1-4', localId: '4', name: 'Charizard' },
    [6],
  );
  c.trainers[0].wishlist[0].card.localImage = 'file:///device/should-not-export.jpg';
  const raw = portableBackup(c);
  assert.ok(!raw.includes('file:///'));
  const restored = parseCollection(raw);
  assert.deepEqual(
    restored.trainers[0].wishlist.map((w) => w.key),
    ['en:sv03-125', 'en:base1-4'],
  );
  assert.deepEqual(restored.trainers[0].wishlist[0].card, charizard);
  const merged = mergeBackup(freshCollection(), restored, 'test');
  assert.deepEqual(
    merged.trainers[1].wishlist.map((w) => w.key),
    ['en:sv03-125', 'en:base1-4'],
  );
  assert.deepEqual(merged.trainers[0].wishlist, []);
  const legacy = { ...c.trainers[0] };
  delete legacy.wishlist;
  assert.deepEqual(parseCollection(portableBackup({ ...c, trainers: [legacy] })).trainers[0].wishlist, []);
});

test('wishlists sit alongside quiz scores, and undoing an add does not bring a granted wish back', () => {
  const { undoAdditions, recordQuizScore } = require('../.test-build/lib/model');
  const c = freshCollection();
  c.trainers[0] = recordQuizScore(addWish(addWish(c.trainers[0], charizard, [6]), pikachu, [25]), 7);
  const restored = parseCollection(portableBackup(c)).trainers[0];
  assert.equal(restored.quizBest, 7);
  assert.deepEqual(
    restored.wishlist.map((w) => w.key),
    ['en:sv03-125', 'en:base1-58'],
  );
  const added = addCard(restored, fullPikachu, 'normal', 1);
  const undone = undoAdditions(added, [{ key: entryKey(fullPikachu, 'normal'), quantity: 1 }]);
  assert.equal(totalCards(undone), 0);
  assert.deepEqual(
    wishesOf(undone).map((w) => w.key),
    ['en:sv03-125'],
  );
});

test('share text is a friendly numbered list with set, number and language', () => {
  let t = addWish(trainer(), charizard, [6]);
  t = addWish(t, { id: 'SV-P-001', localId: '001', name: 'ピカチュウ', language: 'ja' }, [25]);
  t = addWish(t, { id: 'mystery-9', localId: '9', name: 'Mew', language: 'en' }, [151]);
  assert.equal(
    wishlistShareText('Ash', wishesOf(t)),
    [
      "Ash's Pokémon card wishlist ⭐",
      '1. Charizard ex — Obsidian Flames #125 (English)',
      '2. ピカチュウ (Pikachu) — ' +
        require('../src/data/sets-ja.json').find((s) => s.id === 'SV-P').name +
        ' #001 (Japanese)',
      '3. Mew — #9 (English)',
    ].join('\n'),
  );
  assert.equal(
    wishlistShareText('Ash', wishesOf(t), () => 'Test Set').split('\n')[1],
    '1. Charizard ex — Test Set #125 (English)',
  );
  assert.match(wishlistShareText('  ', []), /^Trainer's Pokémon card wishlist ⭐\nNo wishes yet!$/);
});
