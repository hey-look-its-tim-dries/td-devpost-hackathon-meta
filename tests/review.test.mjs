// tests/review.test.mjs: the final review's findings, each pinned (M4-M6 fix pass)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChart } from '../src/world/chart.js';
import { createPins } from '../src/world/pins.js';
import { forgetGone } from '../src/world/tidy.js';
import { whoSteers } from '../src/autopilot.js';
import { layout, hitAt } from '../src/atlas/layout.js';
import { rowToHand } from '../src/net.js';
import { createOthers } from '../src/others.js';
import { cameraAllowed } from '../src/world/names.js';
import { founders } from '../src/world/founders.js';
import { toB64 } from '../src/hand/dna.js';

test('finding 1: Hands gone from the world take their pins and charting along', () => {
  const chart = createChart(null), pins = createPins(null);
  chart.visit('gone', 0, 2); chart.visit('kept', 0, 2);
  pins.add({ handId: 'gone', code: 'I1', x: 0, z: 0, label: 'G' }); pins.add({ handId: 'kept', code: 'I1', x: 1, z: 1, label: 'K' });
  forgetGone(['kept', 'mine'], chart, pins);
  assert.deepEqual(chart.ids(), ['kept']);
  assert.deepEqual(pins.list().map((p) => p.label), ['K']);
});
test('finding 2: names from the map and the room are cleaned before anything draws them', () => {
  const f = founders()[0], row = { id: 'h', name: 'A‮B' + 'x'.repeat(40), palette: 2, side: 'R', palm: toB64(f.palm), prints: f.prints.map(toB64), pose: f.pose, founder: false, placed_at: 1 };
  assert.equal(rowToHand(row).name, ('AB' + 'x'.repeat(40)).slice(0, 24));
  const o = createOthers();
  o.setNames({ 3: '\u0007Oru' });
  o.apply([{ id: 3, pose: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, mode: 0 } }], 1);
  assert.equal(o.nameOf(3), 'Oru');
});
test('finding 3: Fly here steers in the headset until a hand engages', () => {
  assert.equal(whoSteers({ flyTo: true, engaged: false, keys: false, xr: true }), 'auto');
  assert.equal(whoSteers({ flyTo: true, engaged: true, keys: false, xr: true }), 'hand');
  assert.equal(whoSteers({ flyTo: true, engaged: false, keys: true, xr: false }), 'keys');
  assert.equal(whoSteers({ flyTo: false, engaged: false, keys: false, xr: true }), 'head');
  assert.equal(whoSteers({ flyTo: false, engaged: false, keys: false, xr: false }), 'keys');
});
test('finding 4: the atlas zooms by touch: + and - on the World tab', () => {
  const r = layout('world');
  for (const dir of ['in', 'out']) { const q = r.find((x) => x.id === `zoom:${dir}`); assert.ok(q, dir); assert.deepEqual(hitAt(r, [q.x + 4, q.y + 4]), { type: 'zoom', dir }); }
  assert.ok(r.find((x) => x.id === 'zoom:in').w >= 60, 'a fingertip target');
});
test('finding 7: the camera route is off in Illinois, Texas and Washington (spec 8.5)', () => {
  assert.equal(cameraAllowed('US', 'IL'), false);
  assert.equal(cameraAllowed('US', 'TX'), false);
  assert.equal(cameraAllowed('US', 'WA'), false);
  assert.equal(cameraAllowed('US', 'CA'), true);
  assert.equal(cameraAllowed('BE', 'VLG'), true);
  assert.equal(cameraAllowed(undefined, undefined), true);
});
