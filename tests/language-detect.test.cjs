const { test } = require('node:test');
const assert = require('node:assert/strict');
const { scanCandidates } = require('../.test-build/lib/catalog');
const { detectCardLanguage, textLanguage, searchAnyLanguage } = require('../.test-build/lib/language-detect');
const { identifyProgressively } = require('../.test-build/lib/scan-pipeline');
const samples = require('./fixtures/scan-auto-text.json');
const scan = (topText, bottomText = '', text = topText) => ({ text: `${text}\n${bottomText}`, topText, bottomText, photoUri: 'file:///card.jpg', crop: [0, 0, 1, 1], autoCropped: true });

test('actual auto-detect OCR identifies each card language and its printing', () => {
  for (const sample of samples) {
    assert.equal(detectCardLanguage(sample.scan), sample.language, sample.label);
    assert.equal(scanCandidates(sample.scan, sample.language)[0].card.id, sample.expected, sample.label);
  }
  assert.deepEqual(new Set(samples.map(s => s.language)), new Set(['en', 'ja', 'ko', 'zh-cn', 'zh-tw']));
});

test('script decides the language; Chinese uses printing, then character, then catalog evidence', () => {
  assert.equal(detectCardLanguage(scan('BASIC\nPikachu HP60', '030/165')), 'en');
  // Stray glyphs from artwork or glare do not make an English card foreign.
  assert.equal(detectCardLanguage(scan('BASIC\nPikachu 一', '030/165')), 'en');
  assert.equal(detectCardLanguage(scan('たね\nピカチュウ HP60')), 'ja');
  assert.equal(detectCardLanguage(scan('기본\n로젤리아 HP60')), 'ko');
  // A mainland card missing from the sparse zh-cn catalog stays Simplified even
  // though the Traditional catalog has the same name.
  assert.equal(detectCardLanguage(scan('基础\n四季鹿 HP70', '', '基础\n四季鹿\n选择这只宝可梦')), 'zh-cn');
  assert.equal(detectCardLanguage(scan('基礎\n四季鹿 HP70', '', '基礎\n四季鹿\n選擇這隻寶可夢')), 'zh-tw');
  // No script evidence: an exact set/number printing picks the catalog.
  assert.equal(detectCardLanguage(scan('四季鹿', 'CBB4C 17 07/07')), 'zh-cn');
  assert.equal(detectCardLanguage(scan('四季鹿', 'SV5M 073/071')), 'zh-tw');
});

test('typed searches find the matching catalog without choosing a language', () => {
  for (const [query, language] of [['피카츄', 'ko'], ['ピカチュウ', 'ja'], ['叶伊布', 'zh-cn'], ['葉伊布', 'zh-tw'], ['宝可梦', 'zh-cn'], ['Pikachu', 'en'], ['皮卡丘', 'zh-tw']]) {
    assert.equal(textLanguage(query), language, query);
  }
  assert.ok(searchAnyLanguage('Pikachu', null).every(c => c.language === 'en'));
  assert.ok(searchAnyLanguage('야나프', null).every(c => c.language === 'ko'));
  // Japanese, Korean and Traditional Chinese share set codes; each printing is offered.
  assert.deepEqual(searchAnyLanguage('SV4K 001/066', null).map(c => `${c.language}:${c.id}`).sort(), ['ja:SV4K-001', 'ko:SV4K-001', 'zh-tw:SV4K-001']);
  assert.deepEqual(searchAnyLanguage('SV4K 001/066', 'ko').map(c => c.language), ['ko']);
  assert.equal(searchAnyLanguage('CBB4C 17 07/07', null)[0].id, 'CBB4C-1707');
  // After a scan, English names search the detected catalog first.
  assert.ok(searchAnyLanguage('Pansage', 'ko').every(c => c.language === 'ko'));
});

test('auto scans read once without a language, then refine and rank in the detected one', async () => {
  const calls = [], published = [];
  await identifyProgressively({
    recognize: async (_, language) => { calls.push(['recognize', language]); return scan('기본\n야나프', ''); },
    refine: async (_, language) => { calls.push(['refine', language]); return { text: '', topText: '', bottomText: 'SV4K 001/066' }; },
    compare: async (_, c) => c,
  }, { uri: 'file:///card.jpg', language: 'auto', filter: 'all' }, (_, matches, stage, language) => published.push([stage, language, matches[0]?.card.id]), () => true);
  assert.deepEqual(calls, [['recognize', 'auto'], ['refine', 'ko']]);
  assert.ok(published.every(([, language]) => language === 'ko'));
  assert.deepEqual(published.at(-1), ['done', 'ko', 'SV4K-001']);
});
