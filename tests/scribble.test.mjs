// tests/scribble.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScribble, createKnot } from '../src/scribble.js';

const seg = (xyz, i) => Math.hypot(xyz[i * 3] - xyz[i * 3 - 3], xyz[i * 3 + 1] - xyz[i * 3 - 2], xyz[i * 3 + 2] - xyz[i * 3 - 1]);
const angle = (a, b) => Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));

test('once drawn out, the line keeps one length with points exactly spacing apart', () => {
  const s = createScribble({ points: 40, spacing: 0.5, seed: 3 });
  let t = 0;
  for (let k = 0; k < 600; k++) {
    t += 1 / 60;
    s.step(1 / 60, [Math.cos(t) * 20, 5, Math.sin(t) * 20], { speed: 9 });
  }
  const { xyz, count } = s.polyline();
  assert.equal(count, 41);
  let total = 0;
  for (let i = 1; i < count; i++) total += seg(xyz, i);
  assert.ok(Math.abs(total - 39 * 0.5) < 0.02, `length ${total}`);
  for (let i = 2; i < count - 1; i++) assert.ok(Math.abs(seg(xyz, i) - 0.5) < 1e-3);
});

test('the head turns no faster than allowed', () => {
  const s = createScribble({ seed: 1, dir: [0, 0, -1] });
  let prev = s.dir.slice();
  for (let k = 0; k < 200; k++) {
    s.step(0.02, [50, 0, 50], { speed: 9, turn: 1, loops: 0, wander: 0 });
    assert.ok(angle(prev, s.dir) <= 0.02 + 1e-6);
    prev = s.dir.slice();
  }
});

test('a loop is a full turn', () => {
  const s = createScribble({ seed: 2, dir: [0, 0, -1] });
  let prev = s.dir.slice(), total = 0;
  for (let k = 0; k < 100; k++) {
    s.step(0.02, [0, 0, -1000], { speed: 9, turn: 0, loops: 50, loopTime: 1, wander: 0 });
    total += angle(prev, s.dir);
    prev = s.dir.slice();
  }
  assert.ok(total > 2 * Math.PI * 0.9, `turned ${total}`);
});

test('a long frame still lays evenly spaced points (Review Focus 5)', () => {
  const s = createScribble({ points: 20, spacing: 0.5 });
  s.step(0.5, [0, 0, -100], { speed: 30, loops: 0, wander: 0 }); // 15 m in one step
  const { xyz, count } = s.polyline();
  assert.equal(count, 21);
  for (let i = 2; i < count - 1; i++) assert.ok(Math.abs(seg(xyz, i) - 0.5) < 1e-3);
});

test('a knot stays over its hand and keeps moving', () => {
  const k = createKnot({ cls: 'whorl', seed: 4, center: [10, 50, -20], radius: 14 });
  let prev = k.step(0, 9), travelled = 0;
  for (let i = 0; i < 3600; i++) {
    const p = k.step(1 / 60, 9);
    assert.ok(Math.hypot(p[0] - 10, p[1] - 50, p[2] + 20) <= 14 * 0.96 + 1e-9);
    travelled += Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]);
    prev = p;
  }
  assert.ok(travelled > 9 * 60 * 0.6, `travelled ${travelled}`);
});
