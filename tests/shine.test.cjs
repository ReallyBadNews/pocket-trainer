const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isShiny } = require('../.test-build/lib/shine');

test('foil printings and special rarities shimmer; plain cards do not', () => {
  for (const rarity of ['Rare Holo', 'Double rare', 'Ultra Rare', 'Illustration rare', 'Special illustration rare', 'Hyper rare', 'Shiny rare', 'ACE SPEC Rare', 'Amazing Rare', 'Radiant Rare', 'Secret Rare', 'RR', 'SAR', 'AR', ' UR ']) assert.ok(isShiny({ rarity }), rarity);
  for (const rarity of ['Common', 'Uncommon', 'Rare', 'None', 'Unknown', 'C', 'U', 'R', undefined]) assert.equal(isShiny({ rarity }), false, String(rarity));
  assert.ok(isShiny({ rarity: 'Common' }, 'reverse'));
  assert.ok(isShiny({ rarity: 'Uncommon' }, 'firstEditionHolo'));
  assert.equal(isShiny({ rarity: 'Common' }, 'normal'), false);
});
