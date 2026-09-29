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
  assert.equal(liveHint({ text: 'Pikachu HP 60 Charge Pika Punch', autoCropped: true }, [{ card: { id: 'a' } }]), 'steady');
  assert.equal(liveHint({ text: 'Pikachu HP 60 Charge Pika Punch', autoCropped: true }, []), 'glare');
});
