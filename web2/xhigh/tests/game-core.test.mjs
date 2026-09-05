import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceRepair,
  clampToWorld,
  findNearestStation,
  formatDistrictTime,
  moveToward,
} from '../src/game-core.js';

test('world positions stay inside the playable yard', () => {
  assert.deepEqual(clampToWorld({ x: 99, z: -99 }), { x: 17, z: -13 });
});

test('movement uses a bounded step and reports arrival', () => {
  assert.deepEqual(moveToward({ x: 0, z: 0 }, { x: 3, z: 4 }, 2.5), { x: 1.5, z: 2, arrived: false });
  assert.deepEqual(moveToward({ x: 0, z: 0 }, { x: 1, z: 0 }, 2), { x: 1, z: 0, arrived: true });
});

test('nearest station includes a measured distance', () => {
  const nearest = findNearestStation({ x: -9, z: -6 });
  assert.equal(nearest.id, 'aster');
  assert.ok(nearest.distance < 1);
});

test('repair progress charges and safely decays', () => {
  assert.equal(advanceRepair(0.8, 1, true, 1), 1);
  assert.equal(advanceRepair(0.2, 1, false), 0);
});

test('district clock wraps at midnight', () => {
  assert.equal(formatDistrictTime(17 * 3600 + 42 * 60), '17:42');
  assert.equal(formatDistrictTime(24 * 3600 + 61), '00:01');
});
