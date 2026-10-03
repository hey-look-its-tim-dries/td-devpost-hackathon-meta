import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWalker, nearby, route } from '../src/walk.js';

// A tiny land: an L-shaped path (row 5 from x 2..15, then column 15 down to row 15), and height 1
// on the vertical leg so a terrace step can be seen.
function lLand() {
  const N = 20, paths = new Uint8Array(N * N), height = new Uint8Array(N * N);
  for (let x = 2; x <= 15; x++) paths[5 * N + x] = 1;
  for (let y = 5; y <= 15; y++) { paths[y * N + 15] = 1; height[y * N + 15] = y > 8 ? 1 : 0; }
  return { size: N, paths, height };
}

test('the walker snaps onto the nearest path pixel within reach, and not beyond', () => {
  const w = createWalker(lLand());
  assert.equal(w.place(4, 8, 2), false);
  assert.ok(w.place(4, 6.4, 2));
  assert.deepEqual([w.x, w.y], [4, 5]);
});

test('it follows the fingertip along the path and never cuts the corner', () => {
  const land = lLand(), w = createWalker(land, { speed: 1000 });
  w.place(2, 5, 1);
  // a finger at the far end of the leg pulls the walker along row 5 first, then down the leg
  for (let i = 0; i < 40; i++) {
    for (const [x, y] of w.step(15, 15, 0.1)) assert.equal(land.paths[y * land.size + x], 1);
  }
  assert.deepEqual([w.x, w.y], [15, 15]);
  assert.equal(w.level, 1);
});

test('a fingertip across a ridge does not drag the walker off the path', () => {
  const w = createWalker(lLand(), { speed: 1000 });
  w.place(6, 5, 1);
  w.step(6, 12, 1);
  assert.equal(w.y, 5);
});

test('landmarks wake only once and only nearby', () => {
  const marks = [{ x: 3, y: 5 }, { x: 15, y: 14 }];
  const woken = new Set([0]);
  assert.deepEqual(nearby(marks, 3, 5, 2, woken), []);
  assert.deepEqual(nearby(marks, 15, 13, 2, woken), [1]);
});

test('route walks the paths to the pixel nearest the target', () => {
  const r = route(lLand(), 2, 5, 15, 15);
  assert.deepEqual(r[r.length - 1], [15, 15]);
  assert.equal(r.length, 12 + 1 + 9); // 8-connected: the corner is one diagonal step
  assert.deepEqual(route(lLand(), 0, 0, 5, 5), []);
});

test('houses go on the ridge beside the path, spaced apart', async () => {
  const { houseSpot } = await import('../src/walk.js');
  const N = 20, ridge = new Float32Array(N * N).fill(-1), mask = new Float32Array(N * N).fill(1);
  for (let x = 0; x < N; x++) ridge[8 * N + x] = 1; // a ridge along row 8, the path runs along row 5
  const land = { size: N, ridge, mask };
  const spot = houseSpot(land, 4, 5, [], 6);
  assert.deepEqual(spot, [4, 8]);
  assert.equal(houseSpot(land, 6, 5, [spot], 6), null); // too close to the first house
  assert.deepEqual(houseSpot(land, 12, 5, [spot], 6), [12, 8]);
  assert.equal(houseSpot({ size: N, ridge: new Float32Array(N * N).fill(-1), mask }, 4, 5, [], 6), null); // no ridge near
});
