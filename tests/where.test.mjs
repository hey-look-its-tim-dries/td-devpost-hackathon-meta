// tests/where.test.mjs: which Hand and which handbit lie under a world point
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { whereAt, cellsOf } from '../src/world/where.js';
import { founders, toWorld } from '../src/world/founders.js';
import { labelHand } from '../src/hand/label.js';
import { handShape } from '../src/hand/shape.js';
import { unpackPalm } from '../src/hand/dna.js';

const f = founders()[0], lab = labelHand(handShape(unpackPalm(f.palm)), 0.75);
const hand = { id: 'h0', name: f.name, pose: f.pose, data: { x0: lab.x0, y0: lab.y0, cell: lab.cell, w: lab.w, h: lab.h, cells: cellsOf(lab), handbits: lab.handbits } };

test('a point in the middle of a palm handbit names that handbit', () => {
  const hb = lab.handbits.find((b) => b.kind === 'palm' && b.area > 200);
  const [x, z] = toWorld(f.pose, hb.cx, hb.cy);
  const w = whereAt([hand], x, z);
  assert.equal(w.hand, hand);
  assert.equal(w.handbit.code, hb.code);
  assert.equal(w.index, lab.handbits.indexOf(hb));
});
test('a fingertip is its finger handbit', () => {
  const hb = lab.handbits.find((b) => b.code === 'I1');
  const w = whereAt([hand], ...toWorld(f.pose, hb.cx, hb.cy));
  assert.equal(w?.handbit.code, 'I1');
});
test('20 km away there is nothing', () => {
  assert.equal(whereAt([hand], 20000, 20000), null);
});
test('on a river inside a Hand: that Hand, no handbit', () => {
  const lab2 = lab, i = [...lab2.label].findIndex((L, k) => L === -1 && lab2.lineOf[k] >= 0); // RIVER cells carry a line
  const c = i % lab2.w, r = Math.floor(i / lab2.w);
  const X = lab2.x0 + (c + 0.5) * lab2.cell, Y = lab2.y0 + (r + 0.5) * lab2.cell;
  const w = whereAt([hand], ...toWorld(f.pose, X, Y));
  assert.equal(w?.hand, hand);
  assert.equal(w.handbit, null);
  assert.equal(w.index, -1);
});
