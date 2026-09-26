const { test } = require('node:test');
const assert = require('node:assert/strict');
const { allCards, searchCards, scanCandidates, setForCard } = require('../.test-build/lib/catalog');
const photos = require('./fixtures/scan-30th-text.json');
const scan = (topText, bottomText) => ({ text: `${topText}\n${bottomText}`, topText, bottomText });

test('30th Celebration and Classic Collection are in the English catalog', () => {
  const celebration = allCards.filter(c => c.language === 'en' && c.id.startsWith('30th-') && !c.id.startsWith('30th-c-'));
  assert.equal(celebration.length, 158);
  assert.equal(allCards.filter(c => c.language === 'en' && c.id.startsWith('30th-c-')).length, 30);
  assert.equal(setForCard(celebration[0]).abbreviation, '30C');
  assert.equal(searchCards('Nidoran 087/128', 'en')[0].id, '30th-087');
  assert.ok(searchCards('30th Celebration Pikachu', 'en').some(c => c.id === '30th-044'));
});

test('actual 30th card photo OCR identifies each printing', () => {
  for (const photo of photos) {
    const [best, ...rest] = scanCandidates(photo.scan, photo.language);
    assert.equal(best.card.id, photo.expected, photo.label);
    // The Pikachu badge fraction (22/30) must not surface a Classic Collection card.
    assert.ok(rest.every(c => !c.card.id.startsWith('30th-c-')), photo.label);
  }
  // Both readable footers carry the printed 30C code, including OCR's joined "30CEN".
  assert.ok(photos.filter(p => p.expected !== '30th-044').every(p => scanCandidates(p.scan, 'en')[0].exactPrinting));
});

test('English set abbreviations give exact-printing evidence only as printed codes', () => {
  for (const footer of ['30C EN 004/128', '30CEN 004/128', 'J 30C EN • 004/128']) {
    const [best] = scanCandidates(scan('Illumise HP80', footer), 'en');
    assert.equal(best.card.id, '30th-004');
    assert.equal(best.exactPrinting, true);
  }
  // Printed codes are uppercase; "Mew" in flavor text is not the MEW (151) set code.
  const mewtwo = scanCandidates(scan('Mewtwo HP60', 'A scientist created this Pokémon from Mew. 10/102'), 'en');
  assert.equal(mewtwo[0].card.id, 'base1-10');
  assert.ok(mewtwo.every(c => !c.card.id.startsWith('sv03.5-')));
  assert.equal(scanCandidates(scan('Illumise HP80', '004/128'), 'en')[0].exactPrinting, false);
});
