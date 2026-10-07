// tests/fit.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findFits, scorePose, handSamples, riverMouths, overlaps } from '../src/world/fit.js';
import { founders, toWorld, toHand, SOURCE_RADIUS } from '../src/world/founders.js';
import { handShape, templatePalm, insideHand } from '../src/hand/shape.js';
import { unpackPalm } from '../src/hand/dna.js';

const world = founders().map((f) => ({ pose: f.pose, shape: handShape(unpackPalm(f.palm)) }));
const mine = handShape(templatePalm({ seed: 77 }));
let fits, took;

test('three fits for a new Hand, best first, far enough apart to be real choices', () => {
  const t = performance.now();
  fits = findFits(world, mine);
  took = performance.now() - t;
  assert.equal(fits.length, 3);
  for (let i = 1; i < 3; i++) assert.ok(fits[i - 1].score >= fits[i].score);
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(Math.hypot(fits[i].centre[0] - fits[j].centre[0], fits[i].centre[1] - fits[j].centre[1]) >= 3000);
});

test('no fit lies on the world or in the Source (Review Focus 3), and each one is next to someone', () => {
  const { coast, inner } = handSamples(mine);
  for (const fit of fits) {
    let inside = 0;
    for (const [X, Y] of [...coast, ...inner]) {
      const [x, z] = toWorld(fit.pose, X, Y);
      if (Math.hypot(x, z) < SOURCE_RADIUS || world.some((h) => { const [hx, hy] = toHand(h.pose, x, z); return insideHand(h.shape, hx, hy); })) inside++;
    }
    assert.ok(inside <= 1, `${inside} samples on land`);
    assert.ok(fit.snug > 0 && fit.next.length >= 1);
    for (const i of fit.next) assert.ok(i >= -1 && i < world.length);
  }
});

test('overlaps: a founder on its own spot, a pose in the Source, never a found fit (shared with the server)', () => {
  assert.equal(overlaps(world, world[0].shape, world[0].pose), true, 'on a founder');
  assert.equal(overlaps(world, mine, { x: 0, z: 0, rot: 0, mirror: false }), true, 'in the Source');
  for (const f of fits) assert.equal(overlaps(world, mine, f.pose), false, 'a found fit');
  assert.equal(overlaps(world, mine, { x: 0, z: 200000, rot: 0, mirror: false }), false, 'far out at sea, off the grid');
});

test('a joined river counts for more than a snug coast, and crowding costs', () => {
  assert.ok(scorePose({ rivers: 1, snug: 0, distance: 0, crowd: 0 }) > scorePose({ rivers: 0, snug: 1, distance: 0, crowd: 0 }));
  assert.ok(scorePose({ rivers: 0, snug: 0.5, distance: 0, crowd: 6 }) < scorePose({ rivers: 0, snug: 0.5, distance: 0, crowd: 3 }));
});

test('a Hand has rivers that reach its coast', () => {
  const m = riverMouths(mine);
  assert.ok(m.length >= 2);
  for (const { dir } of m) assert.ok(Math.abs(Math.hypot(dir[0], dir[1]) - 1) < 1e-9);
});

test('fast enough to run when you finish the atelier', () => {
  assert.ok(took < 2000, `${took} ms`);
});
