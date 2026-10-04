// tests/phase.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, printPhase, ridgeAngle } from '../src/print/phase.js';

const disc = () => {
  const out = [];
  for (let y = -0.9; y <= 0.9; y += 0.1) for (let x = -0.9; x <= 0.9; x += 0.1) if (x * x + y * y < 0.85) out.push([x, y]);
  return out;
};

test('every pattern gives a finite phase over the whole fingertip', () => {
  for (const p of Object.keys(PATTERNS)) for (const [x, y] of disc()) assert.ok(Number.isFinite(printPhase(p, x, y, 3)), p);
});

test('an arch climbs steadily from base to tip: no closed ridges', () => {
  let prev = -Infinity;
  for (let y = -0.9; y <= 0.9; y += 0.05) {
    const v = printPhase('arch', 0, y);
    assert.ok(v > prev);
    prev = v;
  }
});

test('loops and whorls ring their core: the phase grows away from it', () => {
  assert.ok(printPhase('loop', 0, 0.22) < printPhase('loop', 0, 0.75));
  assert.ok(printPhase('whorl', 0, 0.08) < printPhase('whorl', 0.6, 0.08));
});

test('a whorl is one spiral ridge: once round the core adds exactly one ridge', () => {
  let total = 0, prev = printPhase('whorl', 0.2, 0.08);
  for (let k = 1; k <= 720; k++) {
    const a = (k / 720) * 2 * Math.PI;
    const v = printPhase('whorl', 0.2 * Math.cos(a), 0.08 + (0.2 / 1.1) * Math.sin(a));
    let d = v - prev;
    d -= Math.round(d); // the spiral's branch cut jumps by a whole ridge
    total += d;
    prev = v;
  }
  assert.ok(Math.abs(total - 1) < 0.02, `total ${total}`);
});

test('the six patterns are six different prints', () => {
  const keys = Object.keys(PATTERNS);
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const pts = disc();
    const diff = pts.reduce((s, [x, y]) => s + Math.abs(Math.cos(2 * Math.PI * printPhase(keys[i], x, y)) - Math.cos(2 * Math.PI * printPhase(keys[j], x, y))), 0) / pts.length;
    assert.ok(diff > 0.2, `${keys[i]} vs ${keys[j]}: ${diff}`);
  }
});

test('ridgeAngle runs along the ridge: stepping along it barely changes the phase', () => {
  for (const p of Object.keys(PATTERNS)) for (const [x, y] of [[0.3, -0.45], [-0.5, 0.25], [0.15, 0.62]]) {
    const a = ridgeAngle(p, x, y), v = printPhase(p, x, y);
    const along = Math.abs(printPhase(p, x + 0.01 * Math.cos(a), y + 0.01 * Math.sin(a)) - v);
    const across = Math.abs(printPhase(p, x - 0.01 * Math.sin(a), y + 0.01 * Math.cos(a)) - v);
    assert.ok(along < across * 0.2, `${p} at ${x},${y}: ${along} vs ${across}`);
  }
});
