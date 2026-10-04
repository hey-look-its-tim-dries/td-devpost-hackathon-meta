// tests/founders.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { founders, toHand, toWorld, FOUNDER_NAMES } from '../src/world/founders.js';
import { handShape, insideHand } from '../src/hand/shape.js';
import { unpackPalm } from '../src/hand/dna.js';

test('ten founders, named, each with a palm and five 44-byte prints', () => {
  const f = founders();
  assert.equal(f.length, 10);
  assert.deepEqual(f.map((h) => h.name), FOUNDER_NAMES);
  for (const h of f) {
    assert.equal(h.prints.length, 5);
    h.prints.forEach((p) => assert.equal(p.length, 44));
  }
});

test('the founders are the same on every device', () => {
  assert.deepEqual(founders().map((h) => [...h.palm]), founders().map((h) => [...h.palm]));
});

test('hand and world coordinates round-trip, mirrored or not (Review Focus 2)', () => {
  for (const mirror of [false, true]) {
    const pose = { x: 120, z: -340, rot: 1.1, mirror };
    const [x, z] = toWorld(pose, 37, 210);
    const [X, Y] = toHand(pose, x, z);
    assert.ok(Math.abs(X - 37) < 1e-9 && Math.abs(Y - 210) < 1e-9, `${mirror}: ${X}, ${Y}`);
  }
  assert.deepEqual(toWorld({ x: 0, z: 0, rot: 0, mirror: false }, 0, 100).map(Math.round), [0, -100]); // fingers to -z
});

test('every hand reaches away from the Source', () => {
  for (const h of founders()) {
    const wrist = toWorld(h.pose, 0, 0), tip = toWorld(h.pose, 0, 500);
    assert.ok(Math.hypot(...tip) > Math.hypot(...wrist) + 400);
  }
});

test('the First Ten never overlap', () => {
  const hs = founders().map((h) => ({ pose: h.pose, shape: handShape(unpackPalm(h.palm)) }));
  for (let x = -1200; x <= 1200; x += 10) for (let z = -1200; z <= 1200; z += 10) {
    let n = 0;
    for (const h of hs) {
      const [X, Y] = toHand(h.pose, x, z);
      if (X > -200 && X < 300 && Y > -20 && Y < 640 && insideHand(h.shape, X, Y)) n++;
    }
    assert.ok(n <= 1, `${n} hands at ${x}, ${z}`);
  }
});
