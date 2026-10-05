// tests/atelier.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { palmView, toPixel, strokeToLine, lineToPixels } from '../src/atelier/strokes.js';
import { createFlow } from '../src/atelier/flow.js';
import { OUTLINE, FINGERS } from '../src/hand/shape.js';
import { unpackPalm, unpackPrint } from '../src/hand/dna.js';

test('the drawing of a palm fits its area', () => {
  const v = palmView(100, 50, 700, 760);
  const pts = [...OUTLINE, ...FINGERS.map((f) => [f.base[0] + f.dir[0] * f.len, f.base[1] + f.dir[1] * f.len])].map((p) => toPixel(v, p));
  for (const [x, y] of pts) assert.ok(x >= 100 && x <= 800 && y >= 50 && y <= 810, `${x}, ${y}`);
});

test('a traced line becomes 8 evenly spaced points in palm units', () => {
  const v = palmView(0, 0, 700, 760);
  const drag = Array.from({ length: 40 }, (_, i) => toPixel(v, [-150 + i * 7.5, 300 - i * 2]));
  const pts = strokeToLine(v, drag);
  assert.equal(pts.length, 8);
  const d = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  for (const s of d) assert.ok(Math.abs(s - d[0]) < 1e-6);
  const back = lineToPixels(v, pts);
  assert.ok(Math.hypot(back[0][0] - drag[0][0], back[0][1] - drag[0][1]) < 1);
});

test('a tap is not a line, and a stroke off the palm stays inside the DNA ranges (Review Focus 1)', () => {
  const v = palmView(0, 0, 700, 760);
  assert.equal(strokeToLine(v, [toPixel(v, [10, 200]), toPixel(v, [12, 203])]), null);
  assert.equal(strokeToLine(v, []), null);
  const wild = strokeToLine(v, [toPixel(v, [-2000, -900]), toPixel(v, [3000, 2000])]);
  for (const [x, y] of wild) assert.ok(x >= -1 && x <= 1 && y >= -0.25 && y <= 1.75);
});

test('read by eye: five patterns, the lines, a palette and a name make a Hand', () => {
  const f = createFlow(7);
  assert.equal(f.step, 'prints');
  ['whorl', 'ulnar', 'ulnar', 'double', 'arch'].forEach((c) => f.pick(c));
  assert.equal(f.step, 'lines');
  assert.equal(f.traced(null), false); // a tap: still on the heart line
  assert.equal(f.line, 0);
  assert.ok(f.traced(f.guide()));
  f.useGuide(); // head
  f.useGuide(); // life
  f.noLine(); // no fate line
  assert.equal(f.step, 'palette');
  f.choosePalette(4);
  const before = f.name;
  f.reroll();
  assert.notEqual(f.name, before);
  f.done();
  assert.equal(f.step, 'merge');
  const { palm, prints } = f.dna();
  const p = unpackPalm(palm);
  assert.deepEqual(p.lines.map((l) => l.kind), ['heart', 'head', 'life']);
  assert.equal(p.palette, 4);
  assert.deepEqual(prints.map((b) => unpackPrint(b).cls), ['whorl', 'ulnar', 'ulnar', 'double', 'arch']);
  assert.deepEqual(prints.map((b) => unpackPrint(b).finger), [0, 1, 2, 3, 4]);
});

test('"not sure" picks each finger\'s most common pattern, everyone has a heart line, a typical palm in one step', () => {
  const f = createFlow(8);
  for (let i = 0; i < 5; i++) f.notSure();
  assert.deepEqual(f.prints, ['whorl', 'ulnar', 'ulnar', 'whorl', 'ulnar']);
  f.noLine();
  assert.equal(f.line, 0, 'the heart line cannot be skipped');
  f.typicalLines();
  assert.equal(f.step, 'palette');
  assert.deepEqual(f.lines.map((l) => l.kind), ['heart', 'head', 'life', 'fate']);
});
