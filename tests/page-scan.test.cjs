const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PAGE_LAYOUTS, nextToCheck, pageSummary, pocketCrops, pocketIncluded, pocketNeedsCheck, pocketReviewState, pocketStatus, reviewProgress, waitingPocket } = require('../.test-build/lib/page-scan');
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

test('pocket review says where each pocket stands', () => {
  const pocket = change => ({ ...waitingPocket(), ...change });
  assert.equal(pocketReviewState(pocket({})), 'reading');
  assert.equal(pocketReviewState(pocket({ status: 'reading' })), 'reading');
  assert.equal(pocketReviewState(pocket({ status: 'match', choice: { id: 'x' } })), 'ready');
  assert.equal(pocketReviewState(pocket({ status: 'check', choice: { id: 'y' } })), 'check');
  assert.equal(pocketReviewState(pocket({ status: 'check', choice: { id: 'y' }, confirmed: true })), 'ready');
  assert.equal(pocketReviewState(pocket({ status: 'match', choice: { id: 'x' }, skipped: true })), 'skipped');
  assert.equal(pocketReviewState(pocket({ status: 'empty' })), 'empty');
  assert.equal(pocketReviewState(pocket({ status: 'unreadable' })), 'unreadable');
  // A card typed in for an unreadable pocket is ready like any other choice.
  assert.equal(pocketReviewState(pocket({ status: 'unreadable', choice: { id: 'z' }, confirmed: true })), 'ready');
});

test('confirming or skipping moves on to the next pocket that still needs checking', () => {
  const pockets = [
    { ...waitingPocket(), status: 'check', choice: { id: 'a' } },
    { ...waitingPocket(), status: 'match', choice: { id: 'b' } },
    { ...waitingPocket(), status: 'empty' },
    { ...waitingPocket(), status: 'unreadable' },
    { ...waitingPocket(), status: 'check', choice: { id: 'c' }, skipped: true },
    { ...waitingPocket(), status: 'reading' },
  ];
  assert.deepEqual(pockets.map(pocketNeedsCheck), [true, false, false, true, false, false]);
  assert.equal(nextToCheck(pockets, 0), 3);
  assert.equal(nextToCheck(pockets, 3), 0, 'wraps round to the start of the page');
  assert.equal(nextToCheck(pockets, 4), 0);
  assert.equal(nextToCheck([pockets[0]], 0), null, 'the pocket just settled never counts');
  assert.equal(nextToCheck(pockets.slice(1, 3), 0), null);
  assert.equal(nextToCheck([], 0), null);
});

test('review progress keeps track of the whole page', () => {
  const ready = { ...waitingPocket(), status: 'match', choice: { id: 'x' } };
  const check = { ...waitingPocket(), status: 'check', choice: { id: 'y' } };
  assert.equal(reviewProgress([ready, check, check]), '2 left to check · 1 ready');
  assert.equal(reviewProgress([ready, waitingPocket()]), 'Still reading… 1 ready so far');
  assert.equal(reviewProgress([ready, { ...waitingPocket(), status: 'empty' }]), 'All checked! 1 card ready to add');
  assert.equal(reviewProgress([ready, ready]), 'All checked! 2 cards ready to add');
  assert.equal(reviewProgress([{ ...check, skipped: true }]), 'All checked! No cards ready yet');
});
