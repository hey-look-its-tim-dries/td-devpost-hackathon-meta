// tests/ground.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groundAt } from '../src/world/ground.js';
import { wildHeight } from '../src/world/wild.js';

// a spot on the basin plain that stands above a Hand's 3 m beach
function highPlain() {
  for (let x = 3000; x < 9000; x += 37) for (let z = -9000; z < -3000; z += 41) if (wildHeight(x + 15, z - 15) > 3.6) return [x, z];
  throw new Error('no high plain found');
}

test('inside a Hand its own surface wins, so the plain cannot dam its rivers or bury its coast', () => {
  const [px, pz] = highPlain();
  const hand = { pose: { x: px, z: pz, rot: 0, mirror: false }, data: { x0: 0, y0: 0, cell: 1, w: 4, h: 4, height: new Float32Array(16).fill(0.3) } };
  const x = px + 15, z = pz - 15; // hand metres (1.5, 1.5): inside
  assert.ok(wildHeight(x, z) > 3.6);
  assert.ok(Math.abs(groundAt([hand], x, z) - 3) < 1e-6, `${groundAt([hand], x, z)}`);
});

test('outside every Hand: the wilderness, or the sea', () => {
  for (const [x, z] of [[0, 0], [20000, 3000], [-40000, 9000]]) assert.equal(groundAt([], x, z), Math.max(0, wildHeight(x, z)));
});
