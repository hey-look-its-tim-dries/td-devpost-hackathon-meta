import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTrail, tingHz, createTrail } from '../src/garden/trail.js';

test('a seed trail: a winding row ahead of you, evenly spaced, never a sharp corner', () => {
  const pts = makeTrail([0, 300, 0], 0, 7);
  assert.equal(pts.length, 30);
  assert.ok(pts[0][2] < -200, 'it begins ahead (yaw 0 flies along -z)');
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]); assert.ok(d > 50 && d < 75, `spacing ${d}`); }
  assert.notDeepEqual(makeTrail([0, 300, 0], 0, 8), pts, 'another seed, another line');
});
test('ting ting ting: every seed in a row rings a step higher up a pentatonic scale, and starts again after two octaves', () => {
  for (let i = 1; i < 10; i++) assert.ok(tingHz(i) > tingHz(i - 1));
  assert.equal(tingHz(5), tingHz(0) * 2);
  assert.equal(tingHz(10), tingHz(0));
});
test('flying the line: each seed is taken once as you pass it, the streak grows, and a gap breaks it', () => {
  const tr = createTrail();
  tr.begin([0, 300, 0], 0, 1);
  const pts = tr.points();
  let got = tr.update(pts[0].slice(), 0.1);
  assert.deepEqual(got.map((g) => g.streak), [0]);
  assert.equal(tr.update(pts[0].slice(), 0.1).length, 0, 'not twice');
  got = tr.update(pts[1].slice(), 0.5);
  assert.equal(got[0].streak, 1);
  got = tr.update(pts[5].slice(), 5); // a long gap: the tune starts over
  assert.equal(got[0].streak, 0);
  assert.equal(tr.left, 27);
  for (let i = 6; i < 30; i++) tr.update(pts[i].slice(), 0.2);
  assert.equal(tr.update(pts[2].slice(), 0.2).at(-1).last, false);
  tr.update(pts[3].slice(), 0.2);
  assert.equal(tr.update(pts[4].slice(), 0.2).at(-1).last, true, 'the last seed of a line says so');
  assert.equal(tr.done, true);
});
