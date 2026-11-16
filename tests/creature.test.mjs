// tests/creature.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCreature } from '../src/creature.js';

// fly the creature's head along -z for a while, in a given state
function fly(c, seconds, state, from = [0, 500, 0]) {
  const p = from.slice();
  for (let i = 0; i < seconds * 60; i++) {
    p[2] -= (state.speed / 60) * Math.cos(state.pitch);
    p[1] += (state.speed / 60) * Math.sin(state.pitch);
    c.update(1 / 60, p, state);
  }
  return p;
}
const glide = { speed: 70, pitch: 0, turn: 0 }, dive = { speed: 250, pitch: -0.7, turn: 0 };
// how far the strands reach from the spine, at most
function reach(c) {
  let max = 0;
  for (let k = 0; k < c.strands; k++) {
    const { xyz, count } = c.strand(k), s = c.spine();
    for (let i = 0; i < count; i++) max = Math.max(max, Math.hypot(xyz[i * 3] - s.xyz[i * 3], xyz[i * 3 + 1] - s.xyz[i * 3 + 1], xyz[i * 3 + 2] - s.xyz[i * 3 + 2]));
  }
  return max;
}

test('every strand runs from the head to the end of the tail, and all points are real', () => {
  const c = createCreature({ strands: 5, points: 40, spacing: 5 });
  const head = fly(c, 6, glide);
  const s = c.spine();
  for (let k = 0; k < 5; k++) {
    const { xyz, count } = c.strand(k);
    assert.equal(count, s.count);
    assert.ok(xyz.slice(0, count * 3).every(Number.isFinite));
    assert.ok(Math.hypot(xyz[0] - head[0], xyz[1] - head[1], xyz[2] - head[2]) < 1e-6, 'starts at the head');
    const t = (count - 1) * 3;
    assert.ok(Math.hypot(xyz[t] - s.xyz[t], xyz[t + 1] - s.xyz[t + 1], xyz[t + 2] - s.xyz[t + 2]) < 1e-6, 'ends at the tail');
  }
});

test('the spine is the path flown, points spacing apart', () => {
  const c = createCreature({ points: 40, spacing: 5 });
  fly(c, 6, glide);
  const { xyz, count } = c.spine();
  assert.equal(count, 41); // the head, then 40 trail points
  for (let i = 2; i < count - 1; i++) assert.ok(Math.abs(Math.hypot(xyz[i * 3] - xyz[i * 3 - 3], xyz[i * 3 + 1] - xyz[i * 3 - 2], xyz[i * 3 + 2] - xyz[i * 3 - 1]) - 5) < 1e-3);
});

test('gliding it spreads wide; diving it pulls into a slim spear', () => {
  const c = createCreature({ radius: 18 });
  fly(c, 4, glide);
  const wide = reach(c);
  fly(c, 4, dive, [0, 500, -300]);
  const slim = reach(c);
  assert.ok(wide > 15, `wide ${wide}`);
  assert.ok(slim < wide * 0.6, `${slim} vs ${wide}`);
});

test('it never stops moving: the shape changes from moment to moment', () => {
  const c = createCreature();
  fly(c, 3, glide);
  const a = Array.from(c.strand(0).xyz.slice(30, 60));
  fly(c, 0.5, glide, [0, 500, -210]);
  const b = Array.from(c.strand(0).xyz.slice(30, 60));
  assert.notDeepEqual(a, b);
});

test('a complex creature: strands of different sizes and line weights, a few bold and many fine', () => {
  const c = createCreature({ strands: 9, radius: 12 });
  fly(c, 4, glide);
  const reaches = Array.from({ length: 9 }, (_, k) => {
    const { xyz, count } = c.strand(k), s = c.spine();
    let m = 0;
    for (let i = 0; i < count; i++) m = Math.max(m, Math.hypot(xyz[i * 3] - s.xyz[i * 3], xyz[i * 3 + 1] - s.xyz[i * 3 + 1], xyz[i * 3 + 2] - s.xyz[i * 3 + 2]));
    return m;
  });
  assert.ok(Math.max(...reaches) > 2 * Math.min(...reaches), `reaches ${reaches.map((r) => r.toFixed(1))}`);
  const widths = Array.from({ length: 9 }, (_, k) => c.weight(k));
  assert.ok(Math.max(...widths) >= 2.5 * Math.min(...widths), `weights ${widths}`);
});


test('pull: a braiding creature reaches its strands toward the other player, and lets go at k = 0', () => {
  const fly = (c) => { for (let i = 0; i < 200; i++) c.update(1 / 60, [0, 500, -i * 3], { speed: 120 }); };
  const mid = (c) => { const { xyz, count } = c.strand(0), m = Math.floor(count / 2) * 3; return [xyz[m], xyz[m + 1], xyz[m + 2]]; };
  const target = [200, 500, -300];
  const a = createCreature({ strands: 9, points: 70, spacing: 2, radius: 13 }); fly(a);
  const b = createCreature({ strands: 9, points: 70, spacing: 2, radius: 13 }); b.pull(target, 1); fly(b);
  const d = (p) => Math.hypot(p[0] - target[0], p[1] - target[1], p[2] - target[2]);
  assert.ok(d(mid(b)) < d(mid(a)) - 20, `${d(mid(b))} vs ${d(mid(a))}`);
  b.pull(null, 0); b.update(1 / 60, [0, 500, -603], { speed: 120 });
  assert.ok(Math.abs(d(mid(b)) - d(mid(a))) < 15, 'let go');
});

test('the whorl grows: more strands wake as you garden, and it gets larger', () => {
  const c = createCreature({ strands: 24, points: 30, spacing: 2, radius: 13 });
  assert.equal(c.active, 5, 'a young whorl has five strands');
  const fly = (n) => { for (let i = 0; i < n; i++) c.update(0.05, [i * 5, 100, 0], { speed: 70 }); };
  fly(40);
  const reach = () => { let m = 0; for (let k = 0; k < c.active; k++) { const { xyz, count } = c.strand(k), sp = c.spine().xyz; for (let i = 0; i < count; i++) m = Math.max(m, Math.hypot(xyz[i * 3] - sp[i * 3], xyz[i * 3 + 1] - sp[i * 3 + 1], xyz[i * 3 + 2] - sp[i * 3 + 2])); } return m; };
  const small = reach();
  c.grow(1);
  fly(80);
  assert.equal(c.active, 24);
  assert.ok(reach() > small * 1.3, 'a grown whorl reaches further');
  c.grow(0.5);
  assert.equal(c.active, 14);
});
test('the whorl splits in two at full speed and merges again; a burst flares it', () => {
  const c = createCreature({ strands: 12, points: 30, spacing: 2, radius: 13 });
  c.grow(1);
  const fly = (n, speed) => { for (let i = 0; i < n; i++) c.update(0.05, [0, 100, -i * 5], { speed }); };
  fly(60, 70);
  assert.ok(c.split < 0.05);
  fly(60, 270);
  assert.ok(c.split > 0.8, 'flat out: two bodies');
  fly(80, 70);
  assert.ok(c.split < 0.1, 'merged again');
  c.burst();
  c.update(0.05, [0, 100, -999], { speed: 70 });
  assert.ok(c.flare > 0.5);
  fly(60, 70);
  assert.ok(c.flare < 0.05);
});

import { STYLES } from '../src/creature.js';
const flown = (c, seconds = 3) => { for (let i = 0; i < seconds * 30; i++) c.update(1 / 30, [0, 300, -i * 6], { speed: 180 }); return Array.from(c.strand(1).xyz.slice(0, 60)).map((v) => Math.round(v * 10)); };
test('a whorl takes its shape from its player\'s five fingerprints: every class its own strand, no two sets alike', () => {
  for (const cls of ['arch', 'tented', 'ulnar', 'radial', 'whorl', 'pocket', 'double']) assert.ok(STYLES[cls], cls);
  const plain = createCreature(), a = createCreature(), b = createCreature(), a2 = createCreature();
  a.style(['whorl', 'ulnar', 'ulnar', 'pocket', 'arch']); a2.style(['whorl', 'ulnar', 'ulnar', 'pocket', 'arch']); b.style(['arch', 'tented', 'radial', 'double', 'whorl']);
  const P = flown(plain), A = flown(a), B = flown(b);
  assert.notDeepEqual(A, P, 'prints change the shape');
  assert.notDeepEqual(A, B, 'other prints, another shape');
  assert.deepEqual(flown(a2), A, 'the same prints, the same whorl, on every screen');
  assert.ok([...A, ...B].every(Number.isFinite));
  assert.deepEqual(a.styled, ['whorl', 'ulnar', 'ulnar', 'pocket', 'arch']);
});
test('a whorl can change: new prints are grown into, not snapped to; unknown or no prints leave the plain whorl', () => {
  const c = createCreature(), plain = createCreature();
  flown(c, 1); flown(plain, 1);
  c.style(['whorl', 'whorl', 'whorl', 'whorl', 'whorl']);
  c.update(1 / 30, [0, 300, -186], { speed: 180 }); plain.update(1 / 30, [0, 300, -186], { speed: 180 });
  const gap = () => { const x = Array.from(c.strand(1).xyz.slice(30, 60)), y = Array.from(plain.strand(1).xyz.slice(30, 60)); return Math.max(...x.map((v, i) => Math.abs(v - y[i]))); };
  const just = gap();
  for (let i = 0; i < 120; i++) { c.update(1 / 30, [0, 300, -192 - i * 6], { speed: 180 }); plain.update(1 / 30, [0, 300, -192 - i * 6], { speed: 180 }); }
  assert.ok(just < 0.35 * gap(), `a thirtieth of a second in it has barely begun (${just.toFixed(1)} m of ${gap().toFixed(1)} m)`);
  const q = createCreature(); q.style(['nonsense', null]); q.style(null);
  assert.deepEqual(flown(q), flown(createCreature()));
});

import { pose as gnomePose } from '../src/gnomes/pose.js';
test('the hanging gnome moves with the flight: it swings to the side, streams out behind at speed, and kicks harder for joy', () => {
  const calm = gnomePose('hang', 1.3, 5), wild = gnomePose('hang', 1.3, 5, { swing: 0.8, lift: 0.9, joy: 1 });
  for (const k of Object.keys(wild)) assert.ok(Number.isFinite(wild[k]), k);
  assert.ok(Math.abs(wild.roll) > Math.abs(calm.roll) + 0.4, 'swung to the side');
  assert.ok(wild.tilt > calm.tilt + 0.4, 'streaming out behind');
  const kick = (m) => { let lo = 9, hi = -9; for (let t = 0; t < 2; t += 0.02) { const p = gnomePose('hang', t, 5, m); lo = Math.min(lo, p.legL); hi = Math.max(hi, p.legL); } return hi - lo; };
  assert.ok(kick({ swing: 0, lift: 0, joy: 1 }) > kick({ swing: 0, lift: 0, joy: 0 }) * 1.5, 'joy kicks its legs');
});

test('a whorl of your own before a Hand: five print classes from a text, the same every time, different for different players', async () => {
  const { seedClasses, STYLES } = await import('../src/creature.js');
  const a = seedClasses('account-one'), b = seedClasses('account-two');
  assert.equal(a.length, 5); for (const c of a) assert.ok(STYLES[c]);
  assert.deepEqual(a, seedClasses('account-one'));
  assert.notDeepEqual(a, b);
  const seen = new Set(Array.from({ length: 40 }, (_, i) => seedClasses(`player ${i}`).join()));
  assert.ok(seen.size >= 35, 'forty players, (nearly) forty whorls');
});

test('gnomes dance: four dances on the beat, each its own, with knees and elbows that bend; a standing gnome keeps them straight', async () => {
  const { pose, DANCES } = await import('../src/gnomes/pose.js');
  assert.ok(DANCES.length >= 4);
  const still = pose('idle', 1, 3);
  assert.equal(still.elbowL, 0); assert.equal(still.kneeR, 0); assert.equal(still.spin, 0);
  const sig = (clip) => { let k = 0, e = 0, moved = 0, prev = null; for (let t = 0; t < 4; t += 0.05) { const p = pose(clip, t, 3, { up: 0.6 }); k = Math.max(k, Math.abs(p.kneeL), Math.abs(p.kneeR)); e = Math.max(e, Math.abs(p.elbowL), Math.abs(p.elbowR)); if (prev) moved += Math.abs(p.armLz - prev.armLz) + Math.abs(p.legL - prev.legL) + Math.abs(p.y - prev.y) + Math.abs(p.roll - prev.roll) + Math.abs(p.spin - prev.spin); prev = p; } return { k, e, moved }; };
  const seen = new Set();
  for (const d of DANCES) { const s = sig(d); assert.ok(s.k > 0.3, `${d}: knees bend`); assert.ok(s.e > 0.3, `${d}: elbows bend`); assert.ok(s.moved > 8, `${d}: it really moves (${s.moved})`); seen.add(s.moved.toFixed(2)); }
  assert.equal(seen.size, DANCES.length, 'no two dances alike');
  const a = pose(DANCES[0], 0.3, 3), b = pose(DANCES[0], 0.3 + 2, 3); // 120 beats a minute: the same step every two seconds (four beats)
  assert.ok(Math.abs(a.kneeL - b.kneeL) < 1e-6 && Math.abs(a.armRz - b.armRz) < 1e-6);
});

test('a dropped gnome falls flailing and tumbling, and screams one of eight screams the voice tool makes', async () => {
  const { pose } = await import('../src/gnomes/pose.js'), { SCREAMS } = await import('../src/gnomes/gnomes.js'), { SCREAM_LINES } = await import('../src/garden/voice.js');
  assert.deepEqual(SCREAMS, SCREAM_LINES); assert.equal(new Set(SCREAMS).size, 8);
  let arms = 0, legs = 0;
  for (let t = 0.02; t < 1; t += 0.02) { const a = pose('fall', t, 1), b = pose('fall', t - 0.02, 1); arms += Math.abs(a.armLz - b.armLz); legs += Math.abs(a.legL - b.legL); }
  assert.ok(arms > 5 && legs > 5, 'its arms and legs never stop');
  assert.equal(pose('fall', 0.5, 1, { tumble: 2 }).tilt, 2, 'it tumbles as far as it is told');
});
