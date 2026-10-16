const { test } = require('node:test');

const assert = require('node:assert/strict');

const { allCards, cardImage, printedNumber, searchCards, scanCandidates } = require('../.test-build/lib/catalog');

const { collectorNumber, promoNumber } = require('../.test-build/lib/model');

const { needsScanRefinement } = require('../.test-build/lib/catalog');

const { detectCardLanguage } = require('../.test-build/lib/language-detect');

const photos = require('./fixtures/scan-promo-text.json');

const scan = (topText, bottomText) => ({ text: `${topText}\n${bottomText}`, topText, bottomText });

const promo = (language, id, name, localId) => ({ language, set: { id, name, total: 0 }, localId });

test('promos show their printed code instead of a set size', () => {
  assert.equal(collectorNumber(promo('en', 'mep', 'MEP Black Star Promos', '009')), 'MEP\u00A0009');
  assert.equal(collectorNumber(promo('en', 'svp', 'SVP Black Star Promos', '085')), 'SVP\u00A0085');
  assert.equal(collectorNumber(promo('en', 'swshp', 'SWSH Black Star Promos', 'SWSH050')), 'SWSH050');
  assert.equal(collectorNumber(promo('en', 'smp', 'SM Black Star Promos', 'SM01')), 'SM01');
  // Wizards and Nintendo promos print a bare number in the star.
  assert.equal(collectorNumber(promo('en', 'basep', 'Wizards Black Star Promos', '1')), '1');
  assert.equal(collectorNumber(promo('en', 'miscp', 'Miscellaneous Promos', '001')), '001');
  assert.equal(collectorNumber(promo('ja', 'SV-P', 'スカーレット&バイオレット プロモカード', '001')), '001/SV-P');
  assert.equal(collectorNumber(promo('zh-tw', 'SV-P', '特典卡 朱&紫', '001')), '001/SV-P');

  // Search results and binder-page pockets show the same code from the catalog.
  const brief = (id) => allCards.find((c) => c.language === 'en' && c.id === id);
  assert.equal(printedNumber(brief('svp-085')), 'SVP\u00A0085');
  assert.equal(printedNumber(brief('swshp-SWSH050')), 'SWSH050');
  assert.equal(printedNumber(brief('base1-58')), '58');

  // Regular sets keep their fraction.
  assert.equal(promoNumber('en', { id: 'base1', name: 'Base Set' }, '58'), undefined);
  assert.equal(collectorNumber({ ...promo('en', 'base1', 'Base Set', '58'), set: { total: 102 } }), '58/102');
});

test('promos are found by their printed code', () => {
  assert.equal(searchCards('MEP 009', 'en')[0].id, 'mep-009');
  assert.equal(searchCards('SVP 85', 'en')[0].id, 'svp-085');
  assert.equal(searchCards('ＳＶＰ ８５', 'en')[0].id, 'svp-085', 'full-width input');
  assert.equal(searchCards('SWSH050', 'en')[0].id, 'swshp-SWSH050');
  assert.ok(searchCards('Alakazam MEP', 'en').some((c) => c.id === 'mep-009'));
  assert.equal(searchCards('001/SV-P', 'ja')[0].id, 'SV-P-001');
});

test('scanned promo codes are exact-printing evidence', () => {
  for (const [top, footer, id] of [
    ['Alakazam HP140', 'Illus. Aya Kusube MEP EN 009', 'mep-009'],
    ['Alakazam HP140', 'MEPEN009', 'mep-009'],
    ['Alakazam ex HP310', 'SVP EN 050', 'svp-050'],
    ['Alakazam ex HP310', 'SVP 050', 'svp-050'],
    ['Charizard V HP220', 'SWSH050', 'swshp-SWSH050'],
    ['Rowlet HP60', 'SM01', 'smp-SM01'],
    // OCR reads a zero as an O.
    ['Charizard V HP220', 'SWSHO5O', 'swshp-SWSH050'],
  ]) {
    const [best] = scanCandidates(scan(top, footer), 'en');
    assert.equal(best.card.id, id, footer);
    assert.equal(best.exactPrinting, true, footer);
  }

  for (const footer of ['001/SV-P', '001／SV-P', '001/SVP']) {
    const [best] = scanCandidates(scan('ピカチュウ HP60', footer), 'ja');
    assert.equal(best.card.id, 'SV-P-001', footer);
    assert.equal(best.exactPrinting, true, footer);
  }

  const [taiwan] = scanCandidates(scan('皮卡丘 HP60', '001/SV-P'), 'zh-tw');
  assert.equal(taiwan.card.id, 'SV-P-001');

  // OCR reads a header's HP 70 as MP 70, a Mega promo's code; only the footer counts.
  const eevee = scanCandidates(scan('イーブイ\nMP 70', '133/165'), 'ja');
  assert.equal(eevee[0].card.id, 'SV2a-133');
  assert.ok(eevee.every((c) => c.card.id !== 'M-P-070'));

  // A promo code without a name to back it is a lead, not an exact printing.
  const [unnamed] = scanCandidates(scan('', 'SVP EN 050'), 'en');
  assert.equal(unnamed.card.id, 'svp-050');
  assert.equal(unnamed.exactPrinting, false);

  // A regular card's footer never reads as a promo.
  const regular = scanCandidates(scan('Pikachu HP60', '58/102'), 'en');
  assert.equal(regular[0].card.id, 'base1-58');
  assert.ok(regular.every((c) => !c.exactPrinting));
});

test('actual promo photos in binder sleeves are exact matches the live camera takes', () => {
  for (const photo of photos) {
    const language = photo.language === 'auto' ? detectCardLanguage(photo.scan) : photo.language;
    const matches = scanCandidates(photo.scan, language);
    assert.equal(language, 'en', photo.label);
    assert.equal(matches[0].card.id, photo.expected, photo.label);
    assert.equal(matches[0].exactPrinting, true, photo.label);
    assert.equal(needsScanRefinement(matches), false, photo.label);
  }
});

test('recent promos have artwork the catalog API leaves out', () => {
  const card = allCards.find((c) => c.language === 'en' && c.id === 'mep-009');
  assert.equal(cardImage(card), 'https://assets.tcgdex.net/en/me/mep/009/low.webp');
  assert.ok(allCards.find((c) => c.language === 'en' && c.id === 'svp-200').image);
});
