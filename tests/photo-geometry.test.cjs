const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fitPhoto, boundPhotoOffset } = require('../.test-build/lib/photo-geometry');

test('portrait card cannot pan vertically while its zoomed artwork still fits', () => {
  const fitted = fitPhoto(390, 680, .716);
  assert.equal(fitted.width, 390);
  assert.equal(boundPhotoOffset(100, fitted.height, 680, 1.2), 0);
  assert.equal(boundPhotoOffset(100, fitted.width, 390, 1.2), 39);
});

test('landscape scan only pans across actual overflow, not contain letterboxing', () => {
  const fitted = fitPhoto(390, 680, 2);
  assert.deepEqual(fitted, { width: 390, height: 195 });
  assert.equal(boundPhotoOffset(-1000, fitted.width, 390, 2), -195);
  assert.equal(boundPhotoOffset(1000, fitted.height, 680, 2), 0);
  assert.equal(boundPhotoOffset(1000, fitted.height, 680, 4), 50);
});

test('height-constrained cards use fitted width and zooming out clamps existing offsets', () => {
  const fitted = fitPhoto(844, 300, .716);
  assert.ok(Math.abs(fitted.width - 214.8) < 1e-9);
  assert.equal(boundPhotoOffset(400, fitted.width, 844, 3), 0);
  assert.equal(boundPhotoOffset(-400, fitted.height, 300, 3), -300);
  assert.equal(boundPhotoOffset(-300, fitted.height, 300, 1.5), -75);
  assert.ok(boundPhotoOffset(-75, fitted.height, 300, 1) === 0);
});

test('unknown photo dimensions keep panning centered until the image loads', () => {
  for (const ratio of [0, NaN, Infinity]) {
    const fitted = fitPhoto(390, 680, ratio);
    assert.deepEqual(fitted, { width: 0, height: 0 });
    assert.equal(boundPhotoOffset(200, fitted.width, 390, 5), 0);
  }
});
