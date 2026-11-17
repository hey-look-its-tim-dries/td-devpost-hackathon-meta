// tests/table.test.mjs: in passthrough the palm is laid on a real surface the headset found: your table if
// there is one in reach of a seated player, else your floor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickSurface } from '../src/atelier/table.js';

const head = { x: 0, y: 1.2, z: 0 }; // seated
const floor = { horizontal: true, label: 'floor', x: 0, y: 0, z: 0, w: 4, d: 4 };
const desk = { horizontal: true, label: 'table', x: 0.1, y: 0.74, z: -0.6, w: 1.2, d: 0.7 };
const far = { horizontal: true, label: 'table', x: 4, y: 0.74, z: -3, w: 1.2, d: 0.7 };
const wall = { horizontal: false, label: 'wall', x: 0, y: 1.2, z: -2, w: 3, d: 2.4 };
const shelf = { horizontal: true, label: 'other', x: 0.2, y: 0.7, z: -0.5, w: 0.8, d: 0.5 };

test('a table in reach wins', () => {
  assert.equal(pickSurface([floor, wall, desk, far], head).label, 'table');
  assert.equal(pickSurface([floor, desk], head).x, 0.1);
});

test('a table out of reach does not: then the floor', () => {
  assert.equal(pickSurface([floor, far, wall], head).label, 'floor');
});

test('an unlabelled surface at table height in reach counts as a table', () => {
  assert.equal(pickSurface([floor, shelf], head).x, shelf.x);
});

test('nothing horizontal found: null (the palm goes where it always went)', () => {
  assert.equal(pickSurface([wall], head), null);
  assert.equal(pickSurface([], head), null);
});

test('the radius fits the surface: the palm never hangs over the edge', () => {
  const s = pickSurface([desk], head);
  assert.ok(s.r <= 0.35 && s.r > 0.2);
});
