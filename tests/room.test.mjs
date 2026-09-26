import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extent, rayOnPlane, isCeiling } from '../src/room.js';

// A ceiling 2 m above you, 4 x 3 m, facing down (plane +y points at the floor: x flipped, y down).
// Its world→plane matrix, column-major: plane = (-wx, -(wy - 2), wz).
const ceilingInv = [-1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 2, 0, 1];
const box = extent([{ x: -2, z: -1.5 }, { x: 2, z: -1.5 }, { x: 2, z: 1.5 }, { x: -2, z: 1.5 }]);

test('looking straight up from bed lands in the middle of the ceiling', () => {
  const hit = rayOnPlane(ceilingInv, [0, 0, 0], [0, 1, 0], box);
  assert.deepEqual([hit.x + 0, hit.z + 0, hit.dist], [0, 0, 2]);
});

test('a slanted gaze lands off-centre, at the right distance', () => {
  const hit = rayOnPlane(ceilingInv, [0, 0, 0], [0.5, 1, 0], box);
  assert.ok(Math.abs(hit.x + 1) < 1e-9 && Math.abs(hit.dist - Math.hypot(1, 2)) < 1e-9);
});

test('looking at the wall, the floor or past the edge misses', () => {
  assert.equal(rayOnPlane(ceilingInv, [0, 0, 0], [0, 0, -1], box), null);
  assert.equal(rayOnPlane(ceilingInv, [0, 0, 0], [0, -1, 0], box), null);
  assert.equal(rayOnPlane(ceilingInv, [0, 0, 0], [3, 1, 0], box), null);
});

test('only ceilings hold the sky', () => {
  assert.ok(isCeiling('ceiling', 'horizontal', 1));
  assert.ok(!isCeiling('bed', 'horizontal', 1));
  assert.ok(!isCeiling('shelf', 'horizontal', 1));
  assert.ok(isCeiling(undefined, 'horizontal', 1.2));
  assert.ok(!isCeiling(undefined, 'horizontal', 0.1));
  assert.ok(!isCeiling(undefined, 'vertical', 1.2));
});
