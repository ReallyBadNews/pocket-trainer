const { test } = require('node:test');

const assert = require('node:assert/strict');

const {
  POKEMON_TYPES,
  TYPE_COLORS,
  cleanFlavorText,
  contrastRatio,
  evolutionFamily,
  evolvesFrom,
  pokedexEntry,
  speciesTypes,
  typeCounts,
  typeLabel,
  typeTextColor,
} = require('../.test-build/lib/species-details');

const species = require('../src/data/species.json');

const ids = (stages) => stages.map((stage) => stage.map((member) => member.id));

test('types follow each species default form, in slot order', () => {
  assert.deepEqual(speciesTypes(25), ['electric']);
  assert.deepEqual(speciesTypes(6), ['fire', 'flying']);
  assert.deepEqual(speciesTypes(1), ['grass', 'poison']);
  assert.deepEqual(speciesTypes(0), []);
  assert.deepEqual(speciesTypes(99999), []);
});

test('every bundled species from 1 to 1025 has one or two known types', () => {
  assert.ok(species.length >= 1025);

  for (let id = 1; id <= 1025; id++) {
    const types = speciesTypes(id);
    assert.ok(types.length >= 1 && types.length <= 2, `#${id}`);
    assert.ok(
      types.every((type) => POKEMON_TYPES.includes(type)),
      `#${id}`,
    );
  }
});

test('the Charmander line is three single stages from any member', () => {
  for (const id of [4, 5, 6]) assert.deepEqual(ids(evolutionFamily(id)), [[4], [5], [6]]);
  assert.deepEqual(evolutionFamily(5)[1], [{ id: 5, from: 4 }]);
});

test('baby Pokémon start their family: Pichu → Pikachu → Raichu', () => {
  assert.deepEqual(ids(evolutionFamily(26)), [[172], [25], [26]]);
  assert.equal(evolvesFrom(25), 172);
  assert.equal(evolvesFrom(172), undefined);
});

test('branching families keep every branch in one stage', () => {
  assert.deepEqual(ids(evolutionFamily(197)), [[133], [134, 135, 136, 196, 197, 470, 471, 700]]);
  assert.deepEqual(ids(evolutionFamily(107)), [[236], [106, 107, 237]]);
  // Wurmple's second stage lists each branch after its own parent.
  assert.deepEqual(evolutionFamily(269), [
    [{ id: 265 }],
    [
      { id: 266, from: 265 },
      { id: 268, from: 265 },
    ],
    [
      { id: 267, from: 266 },
      { id: 269, from: 268 },
    ],
  ]);
});

test('Pokémon that do not evolve are a family of one; unknown ids have none', () => {
  assert.deepEqual(ids(evolutionFamily(128)), [[128]]);
  assert.deepEqual(ids(evolutionFamily(490)), [[490]]);
  assert.deepEqual(evolutionFamily(0), []);
});

test('Pokédex entries are clean single sentences ready to read aloud', () => {
  assert.match(pokedexEntry(25), /electric/i);
  assert.equal(pokedexEntry(0), undefined);

  for (let id = 1; id <= 1025; id++) {
    const entry = pokedexEntry(id);
    assert.ok(entry, `#${id}`);
    assert.doesNotMatch(entry, /[\f\n\r\t­]| {2}/, `#${id}`);
    assert.equal(entry, entry.trim());
  }

  assert.equal(pokedexEntry(183).includes('water-repellent'), true);
});

test('flavor text cleanup joins wrapped words and removes page breaks', () => {
  assert.equal(
    cleanFlavorText('Exposure to sun­\nlight adds to its\nstrength.\fSunlight  also'),
    'Exposure to sunlight adds to its strength. Sunlight also',
  );
  assert.equal(cleanFlavorText('its water-\nrepellent fur'), 'its water-repellent fur');
  assert.equal(cleanFlavorText(' grows with\nthis POKéMON.\n'), 'grows with this Pokémon.');
});

test('every type has a color and readable text', () => {
  assert.equal(Object.keys(TYPE_COLORS).length, 18);

  for (const type of POKEMON_TYPES) {
    assert.match(TYPE_COLORS[type], /^#[0-9A-F]{6}$/);
    assert.ok(contrastRatio(TYPE_COLORS[type], typeTextColor(type)) >= 4.5, type);
  }

  assert.equal(typeLabel('electric'), 'Electric');
});

test('type counts include both types of dual-type Pokémon, most common first', () => {
  assert.deepEqual(typeCounts([4, 6, 25]), [
    { type: 'fire', count: 2 },
    { type: 'flying', count: 1 },
    { type: 'electric', count: 1 },
  ]);
  assert.deepEqual(typeCounts([]), []);
});
