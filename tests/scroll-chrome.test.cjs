const test = require('node:test');
const assert = require('node:assert/strict');
const { scrollChromeStep: step, scrollChromeSnap: snap } = require('../.test-build/lib/scroll-chrome.js');

test('hides progressively and starts revealing on the first upward movement, far from the top', () => {
  assert.equal(step(0, 500, 535, 4000, 600, 820, 140).progress, .25);
  assert.equal(step(.25, 535, 640, 4000, 650, 820, 140).progress, 1);
  assert.equal(step(1, 2000, 1986, 4000, 820, 820, 140).progress, .9);
});

test('snaps to the nearest endpoint, including halfway', () => {
  assert.equal(snap(.49), 0);
  assert.equal(snap(.5), 1);
  assert.equal(snap(.9), 1);
});

test('top bounce and bottom bounce do not toggle the controls', () => {
  assert.deepEqual(step(0, 0, -80, 4000, 600, 820, 140), { offset: 0, progress: 0 });
  assert.deepEqual(step(1, 3180, 3250, 4000, 820, 820, 140), { offset: 3180, progress: 1 });
  assert.deepEqual(step(1, 3180, 3180, 4000, 820, 820, 140), { offset: 3180, progress: 1 });
});

test('growing the viewport at the bottom does not look like upward scrolling', () => {
  assert.deepEqual(step(.8, 3300, 3200, 4000, 800, 820, 140), { offset: 3200, progress: .8 });
  assert.ok(step(.8, 3200, 3186, 4000, 800, 820, 140).progress < .8);
});

test('short content and filtered results restore controls and keep navigation recoverable', () => {
  assert.equal(step(1, 500, 200, 500, 600, 820, 140).progress, 0);
  assert.equal(step(.4, 20, 40, 800, 600, 820, 140).progress, 0);
  assert.equal(step(1, 50, 0, 4000, 820, 820, 140).progress, 0);
});
