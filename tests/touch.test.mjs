import test from 'node:test';
import assert from 'node:assert/strict';
import { tilt } from '../src/touch.js';

test('tilt: a phone held still at its neutral pose steers nowhere', () => {
  assert.deepEqual(tilt({ beta: 40, gamma: 0 }, 0, { roll: 0, pitch: 40 }), { turn: 0, climb: 0 });
});
test('tilt: portrait, rolling right turns right, tipping the top away dives... and back climbs', () => {
  const n = { roll: 0, pitch: 40 };
  assert.ok(tilt({ beta: 40, gamma: 20 }, 0, n).turn > 0.5);
  assert.ok(tilt({ beta: 40, gamma: -20 }, 0, n).turn < -0.5);
  assert.ok(tilt({ beta: 60, gamma: 0 }, 0, n).climb > 0.5); // top towards you: climb
  assert.ok(tilt({ beta: 20, gamma: 0 }, 0, n).climb < -0.5);
});
test('tilt: landscape swaps the axes, and the other landscape flips them', () => {
  const a = tilt({ beta: 20, gamma: -40 }, 90, { roll: 0, pitch: 40 }), b = tilt({ beta: -20, gamma: 40 }, 270, { roll: 0, pitch: 40 });
  assert.ok(a.turn > 0.5 && Math.abs(a.climb) < 0.01);
  assert.deepEqual(a, b);
});
test('tilt: never more than full stick, and a small dead zone', () => {
  const n = { roll: 0, pitch: 0 };
  assert.equal(tilt({ beta: 0, gamma: 80 }, 0, n).turn, 1);
  assert.equal(tilt({ beta: 0, gamma: 1.5 }, 0, n).turn, 0);
});
