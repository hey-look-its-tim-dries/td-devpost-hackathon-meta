import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOINTS, palmFrame, OneEuro, createPalmDown, createTouch, palmTilt, createShadowBird, palmDownChecks, steerChecks, createSteer, pointSteer } from '../src/gesture.js';

// A synthetic hand: palm down, fingers pointing away (-z), then rolled, pitched and moved.
// curl bends the fingers towards the palm; spread fans them out.
function hand(side, { at = [0, 1, -0.4], roll = 0, pitch = 0, curl = 0, spread = 0.15 } = {}) {
  const m = side === 'left' ? -1 : 1; // the right hand's index sits on the left (-x)
  const j = { wrist: [0, 0, 0] };
  ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'].forEach((f, k) => {
    const x = m * (-0.03 + k * 0.02), fan = (k - 1.5) * spread * m;
    const knuckle = [x, 0, -0.09];
    j[`${f}-metacarpal`] = [x * 0.4, 0, -0.02];
    j[`${f}-phalanx-proximal`] = knuckle;
    let p = knuckle, a = 0;
    for (const [name, l] of [['phalanx-intermediate', 0.04], ['phalanx-distal', 0.025], ['tip', 0.02]]) {
      a += curl * 1.2;
      const d = [Math.sin(fan) * Math.cos(a), -Math.sin(a), -Math.cos(fan) * Math.cos(a)];
      p = [p[0] + d[0] * l, p[1] + d[1] * l, p[2] + d[2] * l];
      j[`${f}-${name}`] = p;
    }
  });
  Object.assign(j, { 'thumb-metacarpal': [m * -0.03, 0, -0.02], 'thumb-phalanx-proximal': [m * -0.05, 0, -0.04], 'thumb-phalanx-distal': [m * -0.06, 0, -0.06], 'thumb-tip': [m * -0.07, 0, -0.08] });
  // pitch (fingers up) about x, then roll (bank right) about the forward axis
  const rot = ([x, y, z]) => {
    const [y1, z1] = [y * Math.cos(pitch) - z * Math.sin(pitch), y * Math.sin(pitch) + z * Math.cos(pitch)];
    const x2 = x * Math.cos(roll) + y1 * Math.sin(roll), y2 = -x * Math.sin(roll) + y1 * Math.cos(roll);
    return [x2 + at[0], y2 + at[1], z1 + at[2]];
  };
  return Object.fromEntries(JOINTS.map((n) => [n, rot(j[n])]));
}

test('palm frame: palm-down normals point down for both hands; extension and spread read right', () => {
  for (const side of ['left', 'right']) {
    const f = palmFrame(hand(side), side);
    assert.ok(f.normal[1] < -0.95, `${side} normal ${f.normal}`);
    assert.ok(f.forward[2] < -0.95);
    assert.ok(f.extension > 0.9);
    assert.ok(palmFrame(hand(side, { curl: 1 }), side).extension < 0.3);
    assert.ok(palmFrame(hand(side, { spread: 0.3 }), side).spread > palmFrame(hand(side, { spread: 0.05 }), side).spread);
  }
});

test('One Euro: steadies a jittery point, still follows a move', () => {
  const f = new OneEuro({ minCutoff: 1, beta: 0.3 });
  let maxDev = 0;
  for (let i = 0; i < 200; i++) maxDev = Math.max(maxDev, Math.abs(f.filter(Math.sin(i * 2.7) * 0.01, 1 / 72)));
  assert.ok(maxDev < 0.006);
  let v = 0;
  for (let i = 0; i < 144; i++) v = f.filter(i / 144, 1 / 72);
  assert.ok(Math.abs(v - 1) < 0.08);
});

test('palm-down take-off needs the hold, survives a short dropout, rejects the wrong poses', () => {
  const run = (frames, dt = 0.05) => { const d = createPalmDown(); let on = false; for (const f of frames) on = d.update(f, 0.75, dt); return on; };
  const lifted = palmFrame(hand('right', { at: [0, 0.9, -0.4] }), 'right');
  assert.equal(run(Array(8).fill(lifted)), false); // 0.4 s: not yet
  assert.equal(run(Array(12).fill(lifted)), true);
  assert.equal(run([...Array(12).fill(lifted), null, null, null]), true); // 0.15 s gap
  assert.equal(run([...Array(12).fill(lifted), ...Array(8).fill(null)]), false); // gone
  assert.equal(run(Array(20).fill(palmFrame(hand('right', { at: [0, 0.9, -0.4], roll: Math.PI }), 'right'))), false); // palm up
  assert.equal(run(Array(20).fill(palmFrame(hand('right', { at: [0, 0.9, -0.4], curl: 1 }), 'right'))), false);
  assert.equal(run(Array(20).fill(palmFrame(hand('right', { at: [0, 0.77, -0.4] }), 'right'))), false); // resting on the table
  const d = createPalmDown();
  for (let i = 0; i < 12; i++) d.update(lifted, 0.75, 0.05);
  const fist = palmFrame(hand('right', { at: [0, 0.9, -0.4], curl: 1 }), 'right');
  for (let i = 0; i < 4; i++) d.update(fist, 0.75, 0.05);
  assert.equal(d.active, true); // 0.2 s of fist: still flying
  for (let i = 0; i < 4; i++) d.update(fist, 0.75, 0.05);
  assert.equal(d.active, false);
});

test('touch and hover bands, without flicker around the edge', () => {
  const t = createTouch();
  assert.equal(t.update([0, 0.76, 0], 0.75, 0.016), 'touch');
  assert.equal(t.update([0, 0.77, 0], 0.75, 0.016), 'touch'); // 2 cm: still touching (releases above 3)
  const seen = new Set();
  for (let i = 0; i < 60; i++) seen.add(t.update([0, 0.75 + 0.02 + Math.sin(i) * 0.005, 0], 0.75, 0.016));
  assert.deepEqual([...seen], ['touch']);
  for (let i = 0; i < 20; i++) t.update([0, 0.785, 0], 0.75, 0.016);
  assert.equal(t.update([0, 0.785, 0], 0.75, 0.016), 'hover');
  for (let i = 0; i < 3; i++) t.update([0, 0.9, 0], 0.75, 0.016);
  assert.equal(t.update([0, 0.9, 0], 0.75, 0.016), 'none');
});

test('tilt: banking right and fingers up read positive, for either hand', () => {
  for (const side of ['left', 'right']) {
    const ref = palmFrame(hand(side), side);
    const right = palmTilt(palmFrame(hand(side, { roll: 0.4 }), side), ref);
    assert.ok(right.roll > 0.3, `${side} roll ${right.roll}`);
    assert.ok(palmTilt(palmFrame(hand(side, { roll: -0.4 }), side), ref).roll < -0.3);
    assert.ok(palmTilt(palmFrame(hand(side, { pitch: 0.4 }), side), ref).pitch > 0.3);
    const still = palmTilt(ref, ref);
    assert.ok(Math.abs(still.roll) < 1e-9 && Math.abs(still.pitch) < 1e-9);
  }
});

test('shadow bird: crossed close parallel palms after the hold, tolerant of a lost hand', () => {
  const l = hand('left', { at: [0.02, 1.0, -0.4] }), r = hand('right', { at: [-0.02, 1.0, -0.4] });
  const lf = palmFrame(l, 'left'), rf = palmFrame(r, 'right');
  const b = createShadowBird();
  let on = false;
  for (let i = 0; i < 12; i++) on = b.update(lf, rf, l, r, 0.75, 0.05);
  assert.ok(on);
  for (let i = 0; i < 6; i++) on = b.update(lf, null, l, null, 0.75, 0.05);
  assert.ok(on, 'one hand dropping out is not the end of the pose');
  const far = hand('right', { at: [-0.4, 1.0, -0.4] });
  for (let i = 0; i < 10; i++) on = b.update(lf, palmFrame(far, 'right'), l, far, 0.75, 0.05);
  assert.ok(!on);
  const apart = createShadowBird();
  const ls = hand('left', { at: [-0.25, 1, -0.4] }), rs = hand('right', { at: [0.25, 1, -0.4] });
  for (let i = 0; i < 20; i++) on = apart.update(palmFrame(ls, 'left'), palmFrame(rs, 'right'), ls, rs, 0.75, 0.05);
  assert.ok(!on, 'two hands side by side are not a bird');
});

test('steering is relaxed: palm down, hand up, anything but a fist; fingers may hang and touch', () => {
  const ok = palmDownChecks(palmFrame(hand('right'), 'right'));
  assert.ok(ok.down.ok && ok.open.ok && ok.raised.ok && ok.all);
  const hanging = palmDownChecks(palmFrame(hand('right', { curl: 0.35, spread: 0.02 }), 'right'));
  assert.ok(hanging.all, 'relaxed, hanging fingers close together still steer');
  const fist = palmDownChecks(palmFrame(hand('right', { curl: 1 }), 'right'));
  assert.ok(!fist.open.ok && fist.down.ok && !fist.all);
  const up = palmDownChecks(palmFrame(hand('left', { roll: Math.PI }), 'left'));
  assert.ok(!up.down.ok && up.down.value < 0);
  const lap = palmDownChecks(palmFrame(hand('right', { at: [0, -0.7, -0.3] }), 'right'), -0.5);
  assert.ok(!lap.raised.ok && lap.down.ok && !lap.all, 'a hand resting on your lap does not steer');
  for (const c of [ok.down, ok.open, ok.raised]) assert.ok(c.frac >= 0 && c.frac <= 1);
});

test('palm down shows how far through the hold it is, then 1 while active', () => {
  const d = createPalmDown({ holdOn: 0.5 }), f = palmFrame(hand('right'), 'right');
  assert.equal(d.progress, 0);
  for (let i = 0; i < 5; i++) d.update(f, -Infinity, 0.05);
  assert.ok(Math.abs(d.progress - 0.5) < 1e-9, `progress ${d.progress}`);
  for (let i = 0; i < 6; i++) d.update(f, -Infinity, 0.05);
  assert.equal(d.active, true);
  assert.equal(d.progress, 1);
  d.update(palmFrame(hand('right', { curl: 1 }), 'right'), -Infinity, 0.05);
  assert.equal(d.progress, 1); // still active while the release hold runs
});

test('your hand is the arrow: fingers up climbs, down dives, left and right turn', () => {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  let s = pointSteer([0, 0, -1]); // fingers to the horizon: level, straight on
  assert.ok(near(s.turn, 0) && near(s.climb, 0));
  assert.equal(pointSteer([0, 1, 0]).climb, 1);
  assert.equal(pointSteer([0, -1, 0]).climb, -1);
  assert.equal(pointSteer([1, 0, 0]).turn, 1);
  assert.equal(pointSteer([-1, 0, 0]).turn, -1);
  s = pointSteer([Math.sin(0.3), Math.cos(0.3), 0]); // an upright hand leaning right
  assert.ok(s.turn > 0.4 && s.climb > 0.9);
  assert.ok(near(pointSteer([0.03, 0.02, -1]).turn, 0), 'a small wobble does nothing');
});

test('any raised hand that is not a fist engages after the hold; palm direction does not matter', () => {
  const upright = palmFrame(hand('right', { pitch: Math.PI / 2 }), 'right'); // fingers up, palm forward
  assert.ok(steerChecks(upright).all);
  assert.ok(steerChecks(palmFrame(hand('left', { roll: Math.PI }), 'left')).all, 'palm up is fine too');
  assert.ok(!steerChecks(palmFrame(hand('right', { curl: 1 }), 'right')).open.ok);
  assert.ok(!steerChecks(palmFrame(hand('right', { at: [0, -0.7, -0.3] }), 'right'), -0.5).raised.ok);
  const d = createSteer({ holdOn: 0.4 });
  for (let i = 0; i < 7; i++) d.update(upright, -Infinity, 0.05);
  assert.equal(d.active, false);
  assert.ok(d.progress > 0.8);
  d.update(upright, -Infinity, 0.05);
  d.update(upright, -Infinity, 0.05); // eight steps of 0.05 s sum to 0.39999... in floating point
  assert.equal(d.active, true);
});
