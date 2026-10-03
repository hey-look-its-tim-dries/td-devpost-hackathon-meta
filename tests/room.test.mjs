import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extent, rayOnPlane, isCeiling, isTable, landSpot } from '../src/room.js';

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

test('tables carry the land, beds and floors do not', () => {
  assert.ok(isTable('table', 'horizontal', 0.5));
  assert.ok(!isTable('bed', 'horizontal', 0.5));
  assert.ok(!isTable('floor', 'horizontal', 1.3));
  assert.ok(isTable(undefined, 'horizontal', 0.45));
  assert.ok(!isTable(undefined, 'horizontal', 1.4));
  assert.ok(!isTable(undefined, 'vertical', 0.5));
});

test('the land sits at the near edge of the table and shrinks to fit a small one', () => {
  const desk = [-0.6, -0.4, 0.6, 0.4]; // 1.2 x 0.8 m
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  const edge = landSpot(desk, [0, 0.9], 0.6); // you sit past the near edge
  assert.ok(near(edge.x, 0) && near(edge.z, 0.1) && edge.size === 0.6);
  const above = landSpot(desk, [0.1, 0], 0.6); // right above it
  assert.ok(near(above.x, 0.1) && near(above.z, 0));
  const small = landSpot([-0.2, -0.2, 0.2, 0.2], [0, 1], 0.6);
  assert.equal(small.size, 0.4);
  assert.ok(Math.abs(small.z) < 1e-12);
});
