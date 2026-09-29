const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PAGE_LAYOUTS, pageSummary, pocketCrops, pocketIncluded, pocketStatus, waitingPocket } = require('../.test-build/lib/page-scan');
const { scanCandidates } = require('../.test-build/lib/catalog');
const { detectCardLanguage } = require('../.test-build/lib/language-detect');
const fixture = require('./fixtures/scan-page-text.json');

test('pocket crops cover the page in reading order', () => {
  const nine = pocketCrops(PAGE_LAYOUTS.find(l => l.id === '9'));
  assert.equal(nine.length, 9);
  assert.deepEqual(nine[0], [0, 0, 1 / 3, 1 / 3]);
  assert.deepEqual(nine[5], [2 / 3, 1 / 3, 1 / 3, 1 / 3]);
  const twelve = pocketCrops(PAGE_LAYOUTS.find(l => l.id === '12'));
  assert.equal(twelve.length, 12);
  assert.deepEqual(twelve[11], [2 / 3, .75, 1 / 3, .25]);
  assert.equal(pocketCrops(PAGE_LAYOUTS.find(l => l.id === '4')).length, 4);
});

test('every pocket of a glary, tilted page ranks its exact card first', () => {
  for (const pocket of fixture.pockets) {
    const matches = scanCandidates(pocket, detectCardLanguage(pocket), 12, 'all');
    assert.equal(matches[0]?.card.id, pocket.expected);
    assert.equal(pocketStatus(pocket.text, matches), 'match', pocket.expected);
  }
});

test('empty, unreadable and uncertain pockets are not added without checking', () => {
  assert.equal(pocketStatus(' \n©\n', []), 'empty');
  assert.equal(pocketStatus('Some long text that matched no card at all', []), 'unreadable');
  const uncertain = [{ card: { id: 'a', name: 'A' }, score: 120, evidence: 'Name', exactPrinting: false }];
  assert.equal(pocketStatus('A', uncertain), 'check');
  const pockets = [
    { ...waitingPocket(), status: 'match', choice: { id: 'x' } },
    { ...waitingPocket(), status: 'check', choice: { id: 'y' } },
    { ...waitingPocket(), status: 'check', choice: { id: 'z' }, confirmed: true },
    { ...waitingPocket(), status: 'match', choice: { id: 'w' }, skipped: true },
    { ...waitingPocket(), status: 'empty' },
    { ...waitingPocket(), status: 'reading' },
  ];
  assert.deepEqual(pockets.map(pocketIncluded), [true, false, true, false, false, false]);
  assert.deepEqual(pageSummary(pockets), { ready: 2, toCheck: 1, reading: 1 });
});
