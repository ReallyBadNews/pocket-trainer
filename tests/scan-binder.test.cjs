const { test } = require('node:test');

const assert = require('node:assert/strict');

const { scanCandidates, needsScanRefinement } = require('../.test-build/lib/catalog');

const { detectCardLanguage } = require('../.test-build/lib/language-detect');

const photos = require('./fixtures/scan-binder-text.json');

/** Rank like scan-pipeline.ts: the first read, then the detailed read merged in when the first is unclear. */
function read(id, mode = 'card') {
  const photo = photos.find((p) => p.id === id && (p.language === 'auto') === (mode === 'auto'));
  const language = photo.language === 'auto' ? detectCardLanguage(photo.scan) : photo.language;
  const first = scanCandidates(photo.scan, language);
  const merged = { ...photo.scan };

  for (const key of ['text', 'topText', 'bottomText']) merged[key] = `${photo.scan[key]}\n${photo.refine[key]}`;

  const final = needsScanRefinement(first) ? scanCandidates(merged, language) : first;

  return { photo, language, first, final };
}

test('an exact printing without its name is never taken automatically', () => {
  // The card's footer dropped its slash (0770132); neighbours' numbers paired with its MEG code before.
  const lucario = read('s001-en-me01-077');
  assert.equal(lucario.first[0].card.id, 'me01-077', lucario.photo.label);
  assert.equal(needsScanRefinement(lucario.first), true, lucario.photo.label);

  // Read with auto-detect, a Japanese neighbour's code and number matched a Japanese card at full strength.
  const auto = read('s001-en-me01-077', 'auto');
  assert.equal(needsScanRefinement(auto.first), true, auto.photo.label);
});

test("a foreign neighbour doesn't change an English card's language", () => {
  for (const id of ['s010-en-me02.5-135', 's013-en-me03-047']) {
    const { photo, language, final } = read(id, 'auto');
    assert.equal(language, 'en', photo.label);
    assert.equal(final[0].card.id, photo.expected, photo.label);
  }

  const scrafty = read('s010-en-me02.5-135', 'auto');
  assert.equal(needsScanRefinement(scrafty.first), false, 'the live camera takes it');
});

test('glare-damaged numbers still find the right printing', () => {
  for (const [id, mode] of [
    ['s080-ja-SV4a-024', 'card'],
    ['s085-ja-SV10-079', 'auto'],
    ['s092-en-30th-040', 'card'],
    ['s100-en-sv01-039', 'card'],
  ]) {
    const { photo, final } = read(id, mode);
    assert.equal(final[0].card.id, photo.expected, photo.label);
  }
});

test('ranking garbled text from several cards stays fast enough for live frames', () => {
  for (const photo of photos) {
    const started = performance.now();
    scanCandidates(photo.scan, 'en');
    assert.ok(performance.now() - started < 400, photo.label);
  }
});
