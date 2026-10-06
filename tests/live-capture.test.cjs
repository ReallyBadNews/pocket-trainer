const { test } = require('node:test');

const assert = require('node:assert/strict');

const { acceptLiveFrame, liveHint } = require('../.test-build/lib/live-capture');

const { scanCandidates } = require('../.test-build/lib/catalog');

const { detectCardLanguage } = require('../.test-build/lib/language-detect');

const fixture = require('./fixtures/scan-page-text.json');

test('a clearly read card is captured automatically', () => {
  const pocket = fixture.pockets[0];
  const matches = scanCandidates(pocket, detectCardLanguage(pocket), 12, 'all');
  assert.equal(matches[0].card.id, pocket.expected);
  assert.ok(acceptLiveFrame(matches));
});

test('uncertain or empty frames keep the camera open with a helpful hint', () => {
  assert.equal(acceptLiveFrame([]), false);
  assert.equal(acceptLiveFrame([{ card: { id: 'a' }, score: 90, evidence: 'Name', exactPrinting: false }]), false);
  assert.equal(liveHint({ text: 'ok', autoCropped: false }, []), 'looking');
  assert.equal(liveHint({ text: 'Pikachu HP 60 Charge Pika Punch', autoCropped: false }, []), 'closer');
  assert.equal(
    liveHint({ text: 'Pikachu HP 60 Charge Pika Punch', autoCropped: true }, [{ card: { id: 'a' } }]),
    'steady',
  );
  assert.equal(liveHint({ text: 'Pikachu HP 60 Charge Pika Punch', autoCropped: true }, []), 'glare');
});

test('the page guide maps to the matching part of a photo wider than the screen', () => {
  const { guideRegion } = require('../.test-build/lib/live-capture');
  const { pocketCrops, PAGE_LAYOUTS } = require('../.test-build/lib/page-scan');

  // A 3:4 photo fills a 402×874 screen, so only its middle 61% is visible.
  const region = guideRegion(
    { x: 20, y: 200, width: 362, height: 452 },
    { width: 402, height: 874 },
    { width: 3024, height: 4032 },
  );

  const shown = 3024 * (874 / 4032);
  assert.ok(Math.abs(region[0] - (20 + (shown - 402) / 2) / shown) < 1e-9);
  assert.ok(Math.abs(region[2] - 362 / shown) < 1e-9);
  assert.ok(Math.abs(region[1] - 200 / 874) < 1e-9 && Math.abs(region[3] - 452 / 874) < 1e-9);
  const pockets = pocketCrops(PAGE_LAYOUTS[0], region);
  assert.ok(
    Math.abs(pockets[0][0] - region[0]) < 1e-9 &&
      Math.abs(pockets[8][0] + pockets[8][2] - (region[0] + region[2])) < 1e-9,
  );

  // A guide that spills past the photo edge is clamped inside it.
  const edge = guideRegion(
    { x: -50, y: -50, width: 600, height: 1000 },
    { width: 402, height: 874 },
    { width: 3024, height: 4032 },
  );

  assert.ok(edge[0] >= 0 && edge[1] >= 0 && edge[0] + edge[2] <= 1 && edge[1] + edge[3] <= 1);
});

test('the viewfinder zooms in so a card filling the guide stays in focus range', () => {
  const { closeFocusZoom, CARD_WIDTH_MM, POCKET_WIDTH_MM } = require('../.test-build/lib/live-capture');
  // Roughly an iPhone 16 Pro main camera: 20 cm focus limit, 24 mm-equivalent lens.
  const pro = { minimumFocusDistance: 200, fieldOfView: 71.6, aspect: 0.75, maxZoom: 123.75 };
  const factor = (zoom) => Math.pow(pro.maxZoom, zoom);
  const halfWidth = Math.tan((pro.fieldOfView * Math.PI) / 360) * pro.aspect;
  // At the chosen zoom, a card filling 68% of the preview is 23 cm away: just past the focus limit.
  const cardZoom = factor(closeFocusZoom(pro, CARD_WIDTH_MM, 0.68));
  assert.ok(cardZoom > 2 && cardZoom < 3);
  assert.ok(Math.abs((cardZoom * CARD_WIDTH_MM) / (2 * 0.68 * halfWidth) - 230) < 1e-6);
  // A 9-pocket page already fills the frame from far enough away; a 4-pocket page needs a little zoom.
  assert.ok(factor(closeFocusZoom(pro, 3 * POCKET_WIDTH_MM, 0.94)) < 1.25);
  assert.ok(factor(closeFocusZoom(pro, 2 * POCKET_WIDTH_MM, 0.94)) > 1.5);
  // Close-focusing lenses stay unzoomed, extreme cases are capped, and unknown optics are left alone.
  assert.equal(closeFocusZoom({ ...pro, minimumFocusDistance: 60 }, CARD_WIDTH_MM, 0.68), 0);
  assert.ok(Math.abs(factor(closeFocusZoom({ ...pro, minimumFocusDistance: 900 }, CARD_WIDTH_MM, 0.68)) - 3) < 1e-9);
  assert.equal(closeFocusZoom({ ...pro, minimumFocusDistance: -1 }, CARD_WIDTH_MM, 0.68), 0);
});
