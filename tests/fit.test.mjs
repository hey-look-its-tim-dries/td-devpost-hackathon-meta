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

test('overlaps stays fast as the world grows: 40 Hands in well under a frame budget per lay (final review 4)', () => {
  const big = [...world];
  for (let k = 0; k < 30; k++) big.push({ pose: { x: 40000 + (k % 6) * 9000, z: -30000 + Math.floor(k / 6) * 9000, rot: k * 0.7, mirror: false }, shape: world[k % 10].shape });
  const t = performance.now();
  for (const f of fits) assert.equal(overlaps(big, mine, f.pose), false);
  assert.equal(overlaps(big, big[25].shape, big[25].pose), true, 'on a far Hand');
  assert.ok((performance.now() - t) / (fits.length + 1) < 25, `${((performance.now() - t) / (fits.length + 1)).toFixed(0)} ms per check`);
});

test('confluences: a Hand laid in a chain, its river mouth head-on to a founder river, joins that founder', async () => {
  const { confluences, riverMouths } = await import('../src/world/fit.js');
  const w = founders().map((f) => ({ pose: f.pose, shape: handShape(unpackPalm(f.palm)) }));
  const shape = handShape(templatePalm({ seed: 5 }));
  // founder 0's first mouth in the world, and the new Hand's first mouth in hand metres
  const fm = riverMouths(w[0].shape)[0], nm = riverMouths(shape)[0];
  const at = toWorld(w[0].pose, ...fm.at), ahead = toWorld(w[0].pose, fm.at[0] + fm.dir[0], fm.at[1] + fm.dir[1]);
  const d = [ahead[0] - at[0], ahead[1] - at[1]].map((v, _, a) => v / Math.hypot(...a));
  let pose = null; // turn the new Hand until its mouth points straight back, then put that mouth 100 m off
  for (let k = 0; k < 3600 && !pose; k++) {
    const rot = (k / 3600) * Math.PI * 2, c = Math.cos(rot), s = Math.sin(rot), dx = c * nm.dir[0] + s * nm.dir[1], dz = s * nm.dir[0] - c * nm.dir[1];
    if (dx * d[0] + dz * d[1] < -0.999) {
      const tx = at[0] + d[0] * 100, tz = at[1] + d[1] * 100, X = nm.at[0] * 10, Y = nm.at[1] * 10;
      pose = { x: tx - (c * X + s * Y), z: tz - (s * X - c * Y), rot, mirror: false };
    }
  }
  assert.ok(pose);
  assert.ok(confluences(w, shape, pose).includes(0));
  assert.deepEqual(confluences(w, shape, { x: 90000, z: 90000, rot: 0, mirror: false }), [], 'far out at sea nothing meets');
});
