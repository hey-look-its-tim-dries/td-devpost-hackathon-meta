// tests/drag.test.mjs: fly too low with a gnome under you and it is dragged over the sand, never through it:
// leaning back, heels ploughing, bumping along, begging to go up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dragLift } from '../src/gnomes/gnomes.js';
import { pose, CLIPS, DRAG_TILT } from '../src/gnomes/pose.js';
import { DRAGS } from '../src/gnomes/gnomes.js';
import { DRAG_LINES } from '../src/garden/voice.js';

test('high enough, it hangs free; too low, it is lifted onto the sand and dragged', () => {
  // hangs from y = 500 by 1.55 units of 100 m: its feet at 345
  assert.equal(dragLift(500, 300, 100, 1.55), null, 'feet above the ground');
  const y = dragLift(400, 300, 100, 1.55);
  assert.ok(y !== null && y > 300, 'lifted, its hands above the ground');
  const heels = y - 1.55 * 100 * Math.cos(DRAG_TILT); // leaning back, its heels are not straight under its hands
  assert.ok(heels < 300, 'its heels just in the sand: it skis on them, it does not float');
  assert.ok(heels > 300 - 0.3 * 100, 'only a little in');
});

test('the drag pose: leaning far back, heels out in front, both hands up on the lines, bumping along', () => {
  assert.ok(CLIPS.includes('drag'));
  const ys = [];
  for (let t = 0; t < 1.5; t += 0.05) {
    const p = pose('drag', t, 7);
    assert.ok(p.tilt < -0.5, 'leans back');
    assert.ok(p.legL < 0 && p.legR < 0, 'heels in front');
    assert.ok(p.armLz < -2 && p.armRz > 2, 'hands up');
    ys.push(p.y);
  }
  assert.ok(Math.max(...ys) - Math.min(...ys) > 0.04, 'bumps');
});

test('it begs to go up, in many ways, and the game and the voice clips say the same words', () => {
  assert.deepEqual(DRAGS, DRAG_LINES);
  assert.ok(new Set(DRAGS).size >= 8);
  for (const l of DRAGS) assert.match(l, /up/i), assert.match(l, /sir/i);
});
