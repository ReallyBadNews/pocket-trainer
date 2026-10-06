const { test } = require('node:test');

const assert = require('node:assert/strict');

const {
  cardSurface,
  cardBack,
  clampCardPose,
  DEFAULT_CARD_POSE,
  flippedCardPose,
  isCardBackVisible,
  inspectionImageSources,
} = require('../.test-build/lib/card-inspection');

const mesh = require('../assets/crafted/card-model.json');

test('regular and unconfirmed printings never inherit foil from a shiny rarity', () => {
  for (const rarity of ['Double rare', 'Holo Rare', 'Secret Rare', 'SAR']) {
    for (const finish of ['normal', 'firstEdition', 'wPromo', 'unsure'])
      assert.equal(cardSurface({ rarity }, finish), 'paper');
  }
});

test('holo and reverse holo use distinct masks; full-art rarities retain a full surface', () => {
  assert.equal(cardSurface({ rarity: 'Rare' }, 'holo'), 'art-foil');
  assert.equal(cardSurface({ rarity: 'Rare' }, 'firstEditionHolo'), 'art-foil');
  assert.equal(cardSurface({ rarity: 'Double rare' }, 'holo'), 'full-foil');
  assert.equal(cardSurface({ rarity: 'SAR' }, 'holo'), 'full-foil');
  assert.equal(cardSurface({ rarity: 'Double rare' }, 'reverse'), 'reverse-foil');
  assert.equal(cardSurface({ rarity: 'Rare' }, 'firstEditionReverse'), 'reverse-foil');
});

test('modern Japanese cards get their own back; everything else falls back to the blue back', () => {
  const card = { name: 'Pikachu', id: 'sv03.5-025', language: 'en' };
  assert.equal(cardBack(card), 'international');
  assert.equal(cardBack({ ...card, language: 'ja', id: 'SV2a-025' }), 'japanese-modern');
  assert.equal(cardBack({ ...card, language: 'ja', id: 'base1-025' }), 'international');

  for (const language of ['ko', 'zh-tw', 'zh-cn']) assert.equal(cardBack({ ...card, language }), 'international');
  assert.equal(cardBack({ ...card, name: 'Ancient Mew' }), 'international');
  assert.equal(cardBack({ ...card, set: { id: 'wcs', name: 'World Championships', total: 60 } }), 'international');
});

test('flip lands on the opposite face from both front and back without losing zoom', () => {
  for (const yaw of [-12, -Math.PI, -1.2, 0, 1.2, Math.PI, 12]) {
    const pose = { yaw, pitch: 0.4, zoom: 1.6 },
      flipped = flippedCardPose(pose);

    assert.notEqual(isCardBackVisible(flipped), isCardBackVisible(pose));
    assert.equal(flipped.zoom, 1.6);
    assert.equal(flipped.pitch, 0);
    assert.ok(Math.abs(flipped.yaw - yaw) <= Math.PI);
  }

  assert.equal(isCardBackVisible(DEFAULT_CARD_POSE), false);
});

test('pose guards against extreme pitch, zoom and non-finite gesture input', () => {
  assert.deepEqual(clampCardPose({ yaw: NaN, pitch: Infinity, zoom: NaN }), { yaw: 0, pitch: 0, zoom: 1 });
  assert.deepEqual(clampCardPose({ yaw: 100, pitch: 5, zoom: 20 }), { yaw: 100, pitch: 0.85, zoom: 2.5 });
  assert.equal(clampCardPose({ yaw: 0, pitch: -8, zoom: 0 }).zoom, 1);
});

test('image sources preserve catalog, saved photo and lower-resolution fallbacks', () => {
  const url = 'https://assets.tcgdex.net/en/sv/sv03.5/006/high.webp';
  assert.deepEqual(inspectionImageSources({ localImage: 'file://card.jpg' }, url), [
    url,
    'file://card.jpg',
    url.replace('/high.webp', '/low.webp'),
    url.replace('/high.webp', '/high.png'),
  ]);
  assert.deepEqual(inspectionImageSources({ localImage: 'file://card.jpg' }), ['file://card.jpg']);
  assert.deepEqual(inspectionImageSources({}), []);
});

test('Blender mesh is a small complete card, with finite positions, normals and upright UVs', () => {
  assert.deepEqual(mesh.dimensions, [63, 88, 0.3]);
  assert.equal(mesh.stride, 9);
  assert.equal(mesh.vertices.length % 27, 0);
  assert.ok(mesh.vertices.length / 27 < 500);

  const surfaces = new Set(),
    bounds = [
      [Infinity, -Infinity],
      [Infinity, -Infinity],
      [Infinity, -Infinity],
    ];

  for (let i = 0; i < mesh.vertices.length; i += 9) {
    const v = mesh.vertices.slice(i, i + 9);
    assert.ok(v.every(Number.isFinite));

    for (let axis = 0; axis < 3; axis++) {
      bounds[axis][0] = Math.min(bounds[axis][0], v[axis]);
      bounds[axis][1] = Math.max(bounds[axis][1], v[axis]);
    }

    assert.ok(Math.abs(Math.hypot(...v.slice(3, 6)) - 1) < 1e-4);
    assert.ok(v[6] >= 0 && v[6] <= 1 && v[7] >= 0 && v[7] <= 1);
    surfaces.add(v[8]);

    if (v[8] < 2) {
      assert.ok(Math.abs(v[6] - (0.5 + (v[0] / 63) * (v[8] === 0 ? 1 : -1))) < 1e-5);
      assert.ok(Math.abs(v[7] - (0.5 + v[1] / 88)) < 1e-5);
    }
  }

  assert.deepEqual([...surfaces].sort(), [0, 1, 2]);

  for (let axis = 0; axis < 3; axis++)
    assert.ok(Math.abs(bounds[axis][1] - bounds[axis][0] - mesh.dimensions[axis]) < 1e-4);
});
