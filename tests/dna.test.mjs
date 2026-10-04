// tests/dna.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRINT_CLASSES, packPrint, unpackPrint, synthPrint, jitterPrint,
  packPalm, unpackPalm, palmBytes, rng, toB64, fromB64,
} from '../src/hand/dna.js';
import { toHalf } from '../src/hand/half.js';

test('Print DNA is 44 bytes and survives a round trip, for every class', () => {
  for (const cls of PRINT_CLASSES) {
    const p = synthPrint(3, cls, 123456789);
    const b = packPrint(p);
    assert.equal(b.length, 44);
    const q = unpackPrint(b);
    assert.equal(q.cls, cls);
    assert.equal(q.finger, 3);
    assert.equal(q.ridgeCount, p.ridgeCount);
    assert.equal(q.seed, 123456789);
    assert.deepEqual(q.cores, p.cores);
    assert.deepEqual(q.deltas, p.deltas);
    assert.deepEqual([...q.orient], [...p.orient]);
  }
});

test('arches have no singular points; double loops have two cores and two deltas (Review Focus 3)', () => {
  const arch = unpackPrint(packPrint(synthPrint(0, 'arch', 1)));
  assert.deepEqual([arch.cores, arch.deltas], [[], []]);
  const dbl = unpackPrint(packPrint(synthPrint(0, 'double', 1)));
  assert.equal(dbl.cores.length, 2);
  assert.equal(dbl.deltas.length, 2);
});

test('a seed above 2^31 keeps all 32 bits', () => {
  assert.equal(unpackPrint(packPrint(synthPrint(0, 'whorl', 0xfedcba98))).seed, 0xfedcba98);
});

test('the shuffle moves every field by at most one step', () => {
  const p = synthPrint(1, 'ulnar', 42), q = jitterPrint(p, rng(7));
  assert.ok(Math.abs(q.ridgeCount - p.ridgeCount) <= 1);
  q.orient.forEach((o, i) => { const d = Math.abs(o - p.orient[i]); assert.ok(d <= 1 || d === 15, `orient ${i}`); });
  q.cores.forEach(([x, y], k) => assert.ok(Math.abs(x - p.cores[k][0]) <= 1 && Math.abs(y - p.cores[k][1]) <= 1));
  q.deltas.forEach(([x, y], k) => assert.ok(Math.abs(x - p.deltas[k][0]) <= 1 && Math.abs(y - p.deltas[k][1]) <= 1));
});

test('Palm DNA is 28 + 13 bytes per line and keeps points to half a grid step', () => {
  const line = (kind, strength, f) => ({ kind, strength, pts: Array.from({ length: 8 }, (_, i) => f(i)) });
  const palm = {
    side: 'L',
    lines: [line('heart', 2, (i) => [-0.7 + i * 0.2, 1.2 - i * 0.05]), line('fate', 0, (i) => [0.05, i * 0.2])],
    creases: Array.from({ length: 10 }, (_, i) => 0.3 + (i % 2) * 0.3),
    proportions: [1, 2, 0, 1, 3],
    triradii: [[-0.5, 1.4], [-0.2, 1.45], [0.2, 1.45], [0.5, 1.4], [0, 0.1]],
    patterns: [0, 1, 2, 3, 4],
    palette: 4,
    seed: 0xdeadbeef,
  };
  const b = packPalm(palm);
  assert.equal(palmBytes(2), 54);
  assert.equal(b.length, 54);
  const q = unpackPalm(b);
  assert.equal(q.side, 'L');
  assert.equal(q.palette, 4);
  assert.equal(q.seed, 0xdeadbeef);
  assert.deepEqual(q.lines.map((l) => [l.kind, l.strength]), [['heart', 2], ['fate', 0]]);
  const half = 1 / 63 + 1e-9;
  q.lines.forEach((l, k) => l.pts.forEach(([x, y], i) => {
    assert.ok(Math.abs(x - palm.lines[k].pts[i][0]) <= half);
    assert.ok(Math.abs(y - palm.lines[k].pts[i][1]) <= half);
  }));
  q.creases.forEach((c, i) => assert.ok(Math.abs(c - palm.creases[i]) <= 0.5 / 63 + 1e-9));
  q.triradii.forEach(([x, y], i) => assert.ok(Math.abs(x - palm.triradii[i][0]) <= half && Math.abs(y - palm.triradii[i][1]) <= half));
  assert.deepEqual(q.proportions, palm.proportions);
  assert.deepEqual(q.patterns, palm.patterns);
});

test('DNA travels as base64url', () => {
  const b = packPrint(synthPrint(9, 'pocket', 5)), s = toB64(b);
  assert.match(s, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual([...fromB64(s)], [...b]);
});

test('half floats for the GPU', () => {
  assert.equal(toHalf(0), 0);
  assert.equal(toHalf(1), 0x3c00);
  assert.equal(toHalf(-2), 0xc000);
  assert.equal(toHalf(0.5), 0x3800);
  assert.equal(toHalf(65504), 0x7bff);
  assert.equal(toHalf(1e6), 0x7c00);
});
