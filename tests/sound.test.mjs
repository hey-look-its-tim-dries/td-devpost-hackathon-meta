// tests/sound.test.mjs: what the game plays (the notes), not how the browser plays them
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOUNDS, recipe, breeze } from '../src/sound.js';

test('every action has a sound of its own: notes you can hear, short, never the same as another', () => {
  const names = Object.keys(SOUNDS);
  for (const want of ['sow', 'sprig', 'scatter', 'next', 'gather', 'found', 'water', 'tend', 'pour', 'bloom', 'clear', 'hyper', 'mushroom', 'grab', 'drop', 'cross', 'quest', 'team', 'greet', 'chart', 'stamp', 'level', 'golden', 'step', 'atlas', 'storm']) assert.ok(names.includes(want), want);
  const seen = new Set();
  for (const name of names) {
    const notes = recipe(name, 1);
    assert.ok(notes.length >= 1, name);
    for (const q of notes) { assert.ok(q.f >= 40 && q.f <= 5000 && (!q.to || (q.to >= 40 && q.to <= 5000)), `${name} can be heard`); assert.ok(q.at >= 0 && q.d > 0 && q.at + q.d <= 2.6, `${name} is short`); assert.ok(q.g > 0 && q.g <= 1); assert.ok(['sine', 'triangle', 'square', 'sawtooth'].includes(q.type)); }
    const print = JSON.stringify(notes.map((q) => [Math.round(q.f), q.type, q.at]));
    assert.ok(!seen.has(print), `${name} sounds like no other`);
    seen.add(print);
  }
  assert.deepEqual(recipe('nonsense'), []);
  assert.ok(recipe('sow', 3)[0].f > recipe('sow', 1)[0].f, 'sowing on climbs the scale');
});
test('the breeze: a whisper at a sower\'s pace, soft at cruise, a rush flat out, and brighter the faster', () => {
  const slow = breeze(85), cruise = breeze(340), fast = breeze(1100);
  assert.ok(slow.gain > 0 && slow.gain < 0.06);
  assert.ok(cruise.gain > slow.gain && cruise.gain < 0.2);
  assert.ok(fast.gain > 0.3 && fast.gain <= 0.4);
  assert.ok(slow.hz < cruise.hz && cruise.hz < fast.hz);
  assert.deepEqual(breeze(5000), breeze(1100), 'never louder than flat out');
});
