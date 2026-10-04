// tests/glide.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGlide } from '../src/glide.js';

test('glides forward at its speed, facing -z at yaw 0', () => {
  const g = createGlide({ pos: [0, 200, 0], speed: 20 });
  g.update(0.5, {}, () => 0);
  assert.ok(Math.abs(g.pos[2] + 10) < 1e-9 && Math.abs(g.pos[0]) < 1e-9);
});

test('turn +1 turns right', () => {
  const g = createGlide({ pos: [0, 200, 0] });
  for (let i = 0; i < 60; i++) g.update(1 / 60, { turn: 1 }, () => 0);
  assert.ok(g.yaw < 0);
  assert.ok(g.forward()[0] > 0);
});

test('a cliff ahead never puts you inside the ground', () => {
  const ground = (x) => (x > 100 ? 200 : 0);
  const g = createGlide({ pos: [0, 40, 0], yaw: -Math.PI / 2 }); // facing +x
  for (let i = 0; i < 600; i++) {
    g.update(1 / 60, {}, ground);
    assert.ok(g.pos[1] >= ground(g.pos[0]) + 8 - 1e-9, `at x=${g.pos[0]}: ${g.pos[1]}`);
  }
});

test('starting too low, it climbs back to its clearance', () => {
  const g = createGlide({ pos: [0, 10, 0], clearance: 35 });
  for (let i = 0; i < 300; i++) g.update(1 / 60, {}, () => 0);
  assert.ok(g.pos[1] > 34);
});

test('minutes over open sea stay finite and above the clearance (Review Focus 4)', () => {
  const g = createGlide({ pos: [0, 300, 0] });
  for (let i = 0; i < 20000; i++) g.update(1 / 60, { turn: Math.sin(i / 300), climb: Math.cos(i / 500) }, () => 0);
  assert.ok(g.pos.every(Number.isFinite));
  assert.ok(g.pos[1] >= 8 && g.pos[1] <= 900);
});

test('higher is faster: the speed follows your height above the ground', () => {
  const speedAt = (h) => Math.min(120, Math.max(35, 35 + 0.35 * h));
  const low = createGlide({ pos: [0, 30, 0], speedAt, clearance: 20 }), high = createGlide({ pos: [0, 250, 0], speedAt, clearance: 20 });
  low.update(0.1, {}, () => 0);
  high.update(0.1, {}, () => 0);
  assert.ok(high.speed > low.speed * 2, `${low.speed} vs ${high.speed}`);
});

test('diving is faster than gliding level', () => {
  const speedAt = () => 60;
  const level = createGlide({ pos: [0, 300, 0], speedAt }), dive = createGlide({ pos: [0, 300, 0], speedAt });
  level.update(0.1, {}, () => 0);
  dive.update(0.1, { climb: -1 }, () => 0);
  assert.ok(dive.speed > level.speed * 1.3);
});
