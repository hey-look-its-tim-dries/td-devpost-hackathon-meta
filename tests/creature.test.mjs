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
