const { test } = require('node:test');

const assert = require('node:assert/strict');

const { showdownName, cryUrl, animatedSprite, pokedexLine } = require('../.test-build/lib/pokedex-voice');

const { species } = require('../.test-build/lib/catalog');

test('Showdown names drop punctuation, accents and gender symbols', () => {
  assert.equal(showdownName('Mr. Mime'), 'mrmime');
  assert.equal(showdownName('Nidoran♀'), 'nidoranf');
  assert.equal(showdownName('Nidoran♂'), 'nidoranm');
  assert.equal(showdownName('Farfetch’d'), 'farfetchd');
  assert.equal(showdownName('Flabébé'), 'flabebe');
  assert.equal(showdownName('Type: Null'), 'typenull');
  assert.equal(showdownName('Ho-Oh'), 'hooh');
  assert.equal(cryUrl(25), 'https://play.pokemonshowdown.com/audio/cries/pikachu.mp3');
  assert.equal(animatedSprite(25), 'https://play.pokemonshowdown.com/sprites/ani/pikachu.gif');
  assert.equal(cryUrl(99999), undefined);
});

test('every species has a usable cry name and a spoken line', () => {
  for (const s of species) {
    assert.match(showdownName(s.en), /^[a-z0-9]+$/, s.en);
    const line = pokedexLine(s.id);
    assert.ok(line.startsWith(`${s.en}, the `), line);
    assert.ok(!/\s{2}|\f|\n/.test(line), line);
  }

  assert.match(pokedexLine(1), /^Bulbasaur, the Seed Pokémon\. .+/);
});
