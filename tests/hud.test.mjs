// tests/hud.test.mjs: where markers sit on the compass ribbon
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bearings, spans } from '../src/compass.js';

// yaw 0 looks along -z (glide.js); the ribbon spans 90 degrees either side
const me = [0, 500, 0];
test('a marker straight ahead sits in the middle; due right at the right end; behind is clamped and flagged', () => {
  const [a, r, b] = bearings(me, 0, [{ label: 'ahead', x: 0, z: -1000 }, { label: 'right', x: 1000, z: 0 }, { label: 'behind', x: -10, z: 1000 }]);
  assert.ok(Math.abs(a.x) < 1e-6 && !a.behind);
  assert.ok(Math.abs(r.x - 1) < 1e-6 && !r.behind);
  assert.equal(b.behind, true);
  assert.equal(b.x, -1, 'just left of behind clamps to the left end');
  assert.equal(Math.round(a.dist), 1000);
});
test('turning right moves a fixed marker left', () => {
  const [m] = bearings(me, -0.5, [{ label: 'a', x: 0, z: -1000 }]); // yaw decreases when you turn right
  assert.ok(m.x < 0);
});
test('altitude in spans: 6000 m is one span', () => {
  assert.equal(spans(6000), '1.0');
  assert.equal(spans(480), '0.08');
});
