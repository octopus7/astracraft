import test from 'node:test';
import assert from 'node:assert/strict';
import { RELAYS, createGameState, formatTime, nearestRelay, tickState, usePulse } from '../src/game-core.js';

test('fresh shift starts with full energy and no repaired relays', () => {
  const state = createGameState();
  assert.equal(state.energy, 100);
  assert.equal(state.repaired.size, 0);
  assert.equal(state.complete, false);
});

test('nearestRelay only returns an unrepaired nearby target', () => {
  const state = createGameState();
  assert.equal(nearestRelay({ x: RELAYS[0].x, z: RELAYS[0].z }, state)?.id, 'r1');
  state.repaired.add('r1');
  assert.equal(nearestRelay({ x: RELAYS[0].x, z: RELAYS[0].z }, state), null);
});

test('holding repair completes one relay after calibration time', () => {
  const state = createGameState();
  state.started = true;
  const result = tickState(state, RELAYS[0], 1.5, true);
  assert.equal(result.repaired, 'r1');
  assert.equal(state.repaired.size, 1);
});

test('scrap is collected once and restores energy', () => {
  const state = createGameState();
  state.started = true;
  state.energy = 50;
  const atScrap = { x: -5, z: 8 };
  assert.deepEqual(tickState(state, atScrap, 0.01).collected, ['s1']);
  assert.equal(state.scrap, 1);
  assert.deepEqual(tickState(state, atScrap, 0.01).collected, []);
});

test('pulse consumes energy and obeys cooldown', () => {
  const state = createGameState();
  state.started = true;
  assert.equal(usePulse(state), true);
  assert.equal(state.energy, 92);
  assert.equal(usePulse(state), false);
});

test('timer uses stable mm:ss formatting', () => {
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(125.9), '02:05');
});
