// tests/hand.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templatePalm, handShape } from '../src/hand/shape.js';
import { packPalm, unpackPalm } from '../src/hand/dna.js';
import { labelHand } from '../src/hand/label.js';

const hand = (opts = {}) => handShape(unpackPalm(packPalm(templatePalm({ seed: 5, ...opts }))));
const palmNames = (lab) => lab.handbits.filter((b) => b.kind === 'palm').map((b) => b.name).sort();

test('fingers give 15 handbits, three per finger', () => {
  const lab = labelHand(hand(), 1.5);
  const fingers = lab.handbits.filter((b) => b.kind !== 'palm');
  assert.deepEqual(fingers.map((b) => b.code), ['T1', 'T2', 'T3', 'I1', 'I2', 'I3', 'M1', 'M2', 'M3', 'R1', 'R2', 'R3', 'L1', 'L2', 'L3']);
  for (const b of fingers) assert.ok(b.area > 300, `${b.code}: ${b.area} m²`);
});

test('heart, head, life and fate lines cut the palm into five handbits', () => {
  const lab = labelHand(hand({ fate: true }), 1.5);
  assert.equal(lab.palmCount, 5);
  assert.deepEqual(palmNames(lab), ['Crown', 'Heartland', 'Mount of Luna', 'Mount of Venus', 'Plain of Mars']);
});

test('without a fate line the Plain and Luna stay one lowland', () => {
  const lab = labelHand(hand({ fate: false }), 1.5);
  assert.equal(lab.palmCount, 4);
  assert.ok(palmNames(lab).includes('Lowlands'));
});

test('a sun line splits the Crown in two', () => {
  const lab = labelHand(hand({ sun: true }), 1.5);
  assert.equal(lab.palmCount, 6);
  assert.ok(palmNames(lab).includes('Crown of Mercury'));
  assert.ok(palmNames(lab).includes('Crown of Jupiter'));
});

test('a fused crease (heart and head as one) gives one handbit fewer', () => {
  assert.equal(labelHand(hand({ fused: true }), 1.5).palmCount, 4);
});

test('palm handbits are numbered from the wrist up', () => {
  const palm = labelHand(hand(), 1.5).handbits.filter((b) => b.kind === 'palm');
  palm.forEach((b, i) => assert.equal(b.code, `P${i + 1}`));
  for (let i = 1; i < palm.length; i++) assert.ok(palm[i].cy >= palm[i - 1].cy);
});

test('a head line that stops mid-palm joins the regions it fails to split (Review Focus 1)', () => {
  const p = templatePalm({ seed: 5, fate: false });
  const head = p.lines.find((l) => l.kind === 'head');
  const [a, b] = [head.pts[0], head.pts[3]];
  head.pts = Array.from({ length: 8 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / 7, a[1] + ((b[1] - a[1]) * i) / 7]);
  const lab = labelHand(handShape(unpackPalm(packPalm(p))), 1.5);
  assert.equal(lab.palmCount, 3); // Crown, Venus, and everything else as one
  const areas = lab.handbits.filter((h) => h.kind === 'palm').map((h) => h.area);
  const total = areas.reduce((s, v) => s + v, 0);
  for (const v of areas) assert.ok(v / total > 0.03);
});
