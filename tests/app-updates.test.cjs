const { test } = require('node:test');

const assert = require('node:assert/strict');

const { updateStep, updateOffer, isNewSession, AWAY_FOR_NEW_SESSION } = require('../.test-build/lib/app-updates');

const ready = { idle: true, sessionOpen: true, restartedFor: null };

test('a downloaded update restarts the app at the start of a session', () => {
  assert.equal(updateStep({ running: 'a', downloading: false, pending: 'b' }, ready), 'restart');
  // While it downloads, the app shows that it's getting the update rather than letting a child start something.
  assert.equal(updateStep({ running: 'a', available: 'b', downloading: true }, ready), 'downloading');
  assert.equal(updateStep({ running: 'a', downloading: false }, ready), 'none');
  // The server's latest is already running.
  assert.equal(updateStep({ running: 'b', available: 'b', downloading: false, pending: 'b' }, ready), 'none');
});

test('updates never interrupt an open card, game or scan, or a session already underway', () => {
  const status = { running: 'a', available: 'b', downloading: true, pending: 'b' };
  assert.equal(updateStep(status, { ...ready, idle: false }), 'none');
  assert.equal(updateStep(status, { ...ready, sessionOpen: false }), 'none');
  assert.equal(
    updateStep({ running: 'a', available: 'b', downloading: true }, { ...ready, sessionOpen: false }),
    'none',
  );
});

test('a restart into an update that failed to launch is never repeated', () => {
  // expo-updates rolled back to "a" after "b" crashed, but still reports "b" as downloaded.
  assert.equal(updateStep({ running: 'a', downloading: false, pending: 'b' }, { ...ready, restartedFor: 'b' }), 'none');
  assert.equal(
    updateStep({ running: 'a', available: 'b', downloading: true }, { ...ready, restartedFor: 'b' }),
    'none',
  );
  // A newer update after that one is still applied.
  assert.equal(
    updateStep({ running: 'a', downloading: false, pending: 'c' }, { ...ready, restartedFor: 'b' }),
    'restart',
  );
  // Until the saved record loads, wait rather than risk a repeat.
  assert.equal(
    updateStep({ running: 'a', downloading: false, pending: 'c' }, { ...ready, restartedFor: undefined }),
    'none',
  );
});

test('an update that arrives mid-session can be installed from Settings', () => {
  // Downloaded, or still on the server, it's offered even while a session is underway.
  assert.equal(updateOffer({ running: 'a', downloading: false, pending: 'b' }, null), 'b');
  assert.equal(updateOffer({ running: 'a', available: 'b', downloading: false }, null), 'b');
  assert.equal(updateOffer({ running: 'b', available: 'b', downloading: false, pending: 'b' }, null), undefined);
  assert.equal(updateOffer({ running: 'a', downloading: false }, null), undefined);
  // Never one that already failed to launch, and nothing until the saved record loads.
  assert.equal(updateOffer({ running: 'a', downloading: false, pending: 'b' }, 'b'), undefined);
  assert.equal(updateOffer({ running: 'a', available: 'c', downloading: false, pending: 'b' }, 'b'), 'c');
  assert.equal(updateOffer({ running: 'a', downloading: false, pending: 'b' }, undefined), undefined);
});

test('only coming back after a while starts a new session', () => {
  const now = Date.parse('2026-10-04T20:00:00Z');
  assert.equal(isNewSession(undefined, now), false);
  assert.equal(isNewSession(now - AWAY_FOR_NEW_SESSION + 1, now), false);
  assert.equal(isNewSession(now - AWAY_FOR_NEW_SESSION, now), true);
});
