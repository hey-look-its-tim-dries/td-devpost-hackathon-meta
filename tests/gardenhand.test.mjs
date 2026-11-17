// tests/gardenhand.test.mjs: your hands in the headset are a gardener's: stems for bones, a leaf for a palm, a
// flower on each fingertip and a gnome's hat on your thumb. A pinch closes the index flower into a bud.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BONES, openness, decorOf } from '../src/hands/bones.js';
import { JOINTS } from '../src/gesture.js';

test('every joint is on a stem, and every stem joins two real joints', () => {
  const on = new Set(BONES.flat());
  for (const j of JOINTS) assert.ok(on.has(j), j);
  for (const [a, b] of BONES) assert.ok(JOINTS.includes(a) && JOINTS.includes(b), `${a} ${b}`);
  assert.equal(BONES.length, 24);
});

test('a pinch closes the flower, an open hand opens it', () => {
  assert.equal(openness(0.005), 0);
  assert.equal(openness(0.08), 1);
  assert.ok(openness(0.03) > 0 && openness(0.03) < 1);
});

test('your hand wears your garden: the most grown kinds on your laid Hand are its fingertip flowers', () => {
  const species = [{ color: '#a', color2: '#a2' }, { color: '#b', color2: '#b2' }, { color: '#c', color2: '#c2' }, { color: '#s', color2: '#s2' }];
  const plots = [{ hand: 7, sp: 1 }, { hand: 7, sp: 1 }, { hand: 7, sp: 2 }, { hand: 9, sp: 0 }, { hand: 7, sp: 0, wild: true }];
  const d = decorOf(plots, 7, species, 3);
  assert.deepEqual(d.tips.slice(0, 3).map((t) => t.petal), ['#b', '#c', '#s'], 'most grown first, then the seed you carry');
  assert.equal(d.tips[0].heart, '#b2');
  assert.equal(d.tips.length, 4, 'always four: the rest from the garden palette');
  assert.ok(d.blossoms >= 1 && d.blossoms <= 14);
});

test('the more your Hand blooms, the more blossoms climb your fingers; none without a Hand', () => {
  const species = [{ color: '#a', color2: '#a2' }];
  const few = decorOf([{ hand: 1, sp: 0 }], 1, species, 0), many = decorOf(Array.from({ length: 80 }, () => ({ hand: 1, sp: 0 })), 1, species, 0);
  assert.ok(many.blossoms > few.blossoms && many.blossoms <= 14);
  assert.equal(decorOf([{ hand: 1, sp: 0 }], null, species, 0).blossoms, 0);
});
