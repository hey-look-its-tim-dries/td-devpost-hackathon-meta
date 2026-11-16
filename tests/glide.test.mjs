// tests/glide.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGlide } from '../src/glide.js';

const run = (g, seconds, input = {}, ground = () => 0) => {
  for (let i = 0; i < seconds * 60; i++) g.update(1 / 60, input, ground);
  return g;
};

test('turn +1 turns right', () => {
  const g = run(createGlide({ pos: [0, 600, 0] }), 1, { turn: 1 });
  assert.ok(g.yaw < 0);
  assert.ok(g.forward()[0] > 0);
});

test('diving trades height for speed', () => {
  const g = createGlide({ pos: [0, 1400, 0], speed: 70 });
  run(g, 5, { climb: -1 });
  assert.ok(g.speed > 130, `speed ${g.speed}`);
  assert.ok(g.pos[1] < 1300);
});

test('climbing spends speed', () => {
  const g = createGlide({ pos: [0, 300, 0], speed: 150 });
  run(g, 3, { climb: 1 });
  assert.ok(g.speed < 110, `speed ${g.speed}`);
  assert.ok(g.pos[1] > 450, `height ${g.pos[1]}`);
});

test('a dive pulled into a climb zooms far higher than a climb from cruise', () => {
  const fast = run(createGlide({ pos: [0, 300, 0], speed: 300 }), 6, { climb: 1 });
  const slow = run(createGlide({ pos: [0, 300, 0], speed: 70 }), 6, { climb: 1 });
  assert.ok(fast.pos[1] - 300 > 2 * (slow.pos[1] - 300), `${fast.pos[1]} vs ${slow.pos[1]}`);
});

test('skimming low is faster than cruising high (ground rush)', () => {
  const low = run(createGlide({ pos: [0, 20, 0], speed: 70 }), 30);
  const high = run(createGlide({ pos: [0, 600, 0], speed: 70 }), 30);
  assert.ok(low.speed > 1.5 * high.speed, `${low.speed} vs ${high.speed}`);
});

test('a cliff ahead never puts you inside the ground', () => {
  const ground = (x) => (x > 400 ? 300 : 0);
  const g = createGlide({ pos: [0, 40, 0], yaw: -Math.PI / 2, speed: 120 }); // facing +x
  for (let i = 0; i < 600; i++) {
    g.update(1 / 60, { climb: -0.3 }, ground);
    assert.ok(g.pos[1] >= ground(g.pos[0]) + 8 - 1e-9, `at x=${g.pos[0]}: ${g.pos[1]}`);
  }
});

test('minutes of wild flying stay finite, above the ground and under the ceiling', () => {
  const g = createGlide({ pos: [0, 300, 0], ceiling: 1500 });
  for (let i = 0; i < 20000; i++) g.update(1 / 60, { turn: Math.sin(i / 300), climb: Math.cos(i / 170) }, () => 0);
  assert.ok(g.pos.every(Number.isFinite) && Number.isFinite(g.speed));
  assert.ok(g.pos[1] >= 8 && g.pos[1] <= 1500);
  assert.ok(g.speed >= 22);
});

test('braking to sow: holding the brake slows you well below cruise, letting go brings cruise back', () => {
  const g = createGlide({ pos: [0, 500, 0], speed: 340, cruise: 340, terminal: 1100, minSpeed: 80, gravity: 55 });
  for (let i = 0; i < 80; i++) g.update(0.05, { brake: 1 });
  assert.ok(g.speed < 130, `braked to ${g.speed}`);
  for (let i = 0; i < 400; i++) g.update(0.05, {});
  assert.ok(Math.abs(g.speed - 340) < 25, `back at ${g.speed}`);
});
