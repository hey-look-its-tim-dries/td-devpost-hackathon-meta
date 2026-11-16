// tests/tutorial.test.mjs: the tutorial, one move at a time, each done by doing it
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, createTutorial } from '../src/garden/tutorial.js';

const sig = (o = {}) => ({ turn: 0, climb: 0, sown: 0, water: 0, atlas: false, acts: { next: 0, scatter: 0, pour: 0, hyper: 0 }, ...o });
const run = (t, s, seconds) => { for (let i = 0; i < seconds * 10; i++) { const out = t.update(s, 0.1); if (out) return out; } return null; };
test('the tutorial teaches flying first, then every garden move, in the words of hands or of keys', () => {
  assert.deepEqual(STEPS.map((s) => s.id), ['turn', 'climb', 'sow', 'seed', 'scatter', 'water', 'pour', 'hyper', 'atlas']);
  for (const s of STEPS) { assert.ok(s.title && s.hand && s.keys, s.id); assert.ok(s.hand.length <= 64 && s.keys.length <= 64, `${s.id} fits its card`); assert.ok(!/\bSPACE\b|\bkey\b|\b[Pp]ress [A-Z]\b/.test(s.hand), `${s.id}: no keys named for hands`); }
});
test('a step is done by doing it, not by waiting; then the next one comes', () => {
  const t = createTutorial();
  assert.equal(t.active, true);
  assert.equal(t.step.id, 'turn');
  assert.equal(run(t, sig(), 20), null, 'nothing done, nothing learned');
  assert.equal(t.step.id, 'turn');
  run(t, sig({ turn: 0.8 }), 0.5);
  assert.ok(t.progress > 0.2 && t.progress < 1);
  assert.equal(run(t, sig({ turn: -0.8 }), 2), 'next');
  assert.equal(t.step.id, 'climb');
  assert.equal(run(t, sig({ climb: -0.7 }), 2), 'next');
  assert.equal(t.step.id, 'sow');
  run(t, sig({ sown: 12 }), 0.2);
  assert.equal(t.step.id, 'sow', 'what you had sown before the step began does not count');
  assert.equal(run(t, sig({ sown: 15 }), 0.2), 'next');
  assert.equal(t.step.id, 'seed');
  // each of the rest: first seen as it stands, then done
  const acts = { next: 0, scatter: 0, pour: 0, hyper: 0 }, then = (o) => { run(t, sig({ sown: 15, acts: { ...acts } }), 0.1); Object.assign(acts, o); return run(t, sig({ sown: 15, acts: { ...acts } }), 0.2); };
  assert.equal(then({ next: 1 }), 'next');
  assert.equal(then({ scatter: 1 }), 'next');
  assert.equal(t.step.id, 'water');
  assert.equal(run(t, sig({ water: 5, acts }), 0.2), 'next');
  assert.equal(then({ pour: 1 }), 'next');
  assert.equal(then({ hyper: 1 }), 'next');
  assert.equal(t.step.id, 'atlas');
  assert.equal(run(t, sig({ atlas: true }), 0.2), 'done');
  assert.equal(t.active, false);
  assert.equal(t.step, null);
});
test('it can be skipped and started again; one who has done it is not taught twice', () => {
  const t = createTutorial({ done: true });
  assert.equal(t.active, false);
  t.start();
  assert.equal(t.step.id, 'turn');
  t.stop();
  assert.equal(t.active, false);
  assert.equal(t.update(sig({ turn: 1 }), 5), null);
});

import { coach } from '../src/garden/tutorial.js';
test('the card says what is still missing: not over a Hand, over a river, too high; nothing when you are in place', () => {
  assert.match(coach('sow', { onHand: false, onWater: false, alt: 100, limit: 320 }), /NEAREST HAND/);
  assert.match(coach('sow', { onHand: false, onWater: true, alt: 100, limit: 320 }), /river/);
  assert.match(coach('sow', { onHand: true, onWater: false, alt: 500, limit: 320 }), /Too high/);
  assert.equal(coach('sow', { onHand: true, onWater: false, alt: 200, limit: 320 }), null);
  assert.match(coach('water', { onHand: true, onWater: false, alt: 100, limit: 320 }), /river/);
  assert.match(coach('water', { onHand: false, onWater: true, alt: 300, limit: 320 }), /Lower/);
  assert.equal(coach('water', { onHand: false, onWater: true, alt: 90, limit: 320 }), null);
  assert.equal(coach('turn', { onHand: false, onWater: false, alt: 900, limit: 320 }), null, 'flying is learned anywhere');
});
