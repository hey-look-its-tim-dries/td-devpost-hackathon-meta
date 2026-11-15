// tests/autopilot.test.mjs: Fly here steers the glider to a place
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { steerTo } from '../src/autopilot.js';
import { createGlide } from '../src/glide.js';

test('from 5 km away the glider arrives within 400 m in under 60 s, never below the ground', () => {
  const ground = (x, z) => 120 + 80 * Math.sin(x / 700) * Math.cos(z / 900);
  const g = createGlide({ pos: [0, 600, 0], yaw: 2.4, speed: 170, cruise: 170, terminal: 560, minSpeed: 70, gravity: 55 });
  const target = [3000, 0, -4000];
  let t = 0;
  for (; t < 60 && Math.hypot(g.pos[0] - target[0], g.pos[2] - target[2]) > 400; t += 1 / 60) {
    g.update(1 / 60, steerTo(g, target, ground), ground);
    assert.ok(g.pos[1] >= ground(g.pos[0], g.pos[2]), 'above the ground');
  }
  assert.ok(t < 60, `still ${Math.round(Math.hypot(g.pos[0] - target[0], g.pos[2] - target[2]))} m away after 60 s`);
});
test('it cruises a few hundred metres up, so it charts on the way', () => {
  const g = createGlide({ pos: [0, 1400, 0], yaw: 0, speed: 170 });
  for (let i = 0; i < 600; i++) g.update(1 / 60, steerTo(g, [0, 0, -50000], () => 0), () => 0);
  assert.ok(g.pos[1] < 900, `height ${g.pos[1]}`);
});
