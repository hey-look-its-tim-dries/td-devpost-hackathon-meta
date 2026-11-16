// tests/fauna.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { herdSize, planFauna, groupSeed, hash32, DEFAULT_MAX } from '../src/garden/fauna-plan.js';

const KINDS = ['bird', 'insect', 'fish', 'animal'];
const species = [
  { id: 0, name: 'Sand lark', kind: 'bird', form: 'songbird', color: '#e0503c', color2: '#f4d35e', size: 1 },
  { id: 1, name: 'Dune kite', kind: 'bird', form: 'raptor', color: '#7a4a2a', color2: '#f3e4d2', size: 1.2 },
  { id: 2, name: 'Blue wing', kind: 'insect', form: 'butterfly', color: '#3a7bd5', color2: '#16100e', size: 1 },
  { id: 3, name: 'River dart', kind: 'fish', form: 'fish', color: '#2a9d8f', color2: '#e9c46a', size: 1 },
  { id: 4, name: 'Dune buck', kind: 'animal', form: 'antelope', color: '#c98a4b', color2: '#f3e4d2', size: 1 },
  { id: 5, name: 'Desert rose', kind: 'flower', form: 'daisy', color: '#ff0000', color2: '#00ff00', size: 1 }, // not wildlife
];
const plot = (x, z, level, fauna = [0, 1, 2, 3, 4, 5], water = [[x + 10, z], [x + 60, z + 5]]) => ({ x, z, r: 300, level, fauna, water });
const tally = (list) => list.reduce((n, it) => { n[it.kind] = (n[it.kind] || 0) + 1; return n; }, {});

test('herdSize grows with the bloom level and is never 0 from level 1', () => {
  for (const kind of KINDS) {
    for (let level = 1; level <= 4; level++) {
      assert.ok(herdSize(kind, level) >= 1, `${kind} at level ${level}`);
      if (level > 1) assert.ok(herdSize(kind, level) > herdSize(kind, level - 1), `${kind} grows at level ${level}`);
    }
    assert.equal(herdSize(kind, 0), 0);
    assert.equal(herdSize(kind, NaN), 0);
    assert.equal(herdSize(kind, 9), herdSize(kind, 4), 'no more than a full bloom');
    assert.equal(herdSize(kind, 2.7), herdSize(kind, 2));
  }
  assert.equal(herdSize('bird', 1), 3);
  assert.equal(herdSize('bird', 4), 9);
  assert.equal(herdSize('flower', 4), 0, 'only wildlife');
});

test('the planner gives every species on a plot its herd, and only wildlife', () => {
  const list = planFauna([plot(100, 200, 1), plot(4000, -900, 4)], species);
  for (const [pi, level] of [[0, 1], [1, 4]]) for (const sp of [0, 1, 2, 3, 4]) {
    const mine = list.filter((it) => it.plot === pi && it.sp === sp);
    assert.equal(mine.length, herdSize(species[sp].kind, level), `species ${sp} on plot ${pi}`);
    assert.deepEqual(mine.map((it) => it.i), mine.map((_, i) => i));
    assert.ok(mine.every((it) => it.n === mine.length && it.kind === species[sp].kind && it.group === groupSeed([100, 4000][pi], [200, -900][pi], sp)));
  }
  assert.ok(list.every((it) => it.sp !== 5), 'a flower is not wildlife');
  assert.equal(new Set(list.map((it) => it.seed)).size, list.length, 'every individual its own seed');
});

test('the planner is deterministic, and a plot keeps its individuals whatever else is on the list', () => {
  const a = [plot(100, 200, 2), plot(4000, -900, 4), plot(-2500, 700, 3)];
  assert.deepEqual(planFauna(a, species), planFauna(JSON.parse(JSON.stringify(a)), species));
  const alone = planFauna([a[1]], species).map((it) => it.seed).sort();
  const among = planFauna(a, species).filter((it) => it.plot === 1).map((it) => it.seed).sort();
  assert.deepEqual(among, alone, 'the same herd for two players who know different plots');
  // a plot that grows keeps the individuals it had
  const before = planFauna([plot(100, 200, 2)], species).map((it) => it.seed);
  const after = new Set(planFauna([plot(100, 200, 3)], species).map((it) => it.seed));
  assert.ok(before.every((s) => after.has(s)));
});

test('the planner respects the caps, thinning every group evenly', () => {
  const many = Array.from({ length: 90 }, (_, i) => plot(i * 700, (i % 7) * 900, 1 + (i % 4)));
  const full = tally(planFauna(many, species));
  for (const kind of KINDS) assert.ok(full[kind] <= DEFAULT_MAX[{ bird: 'birds', insect: 'insects', fish: 'fish', animal: 'animals' }[kind]], `${kind}: ${full[kind]}`);
  assert.equal(full.bird, 400);
  assert.equal(full.insect, 500);
  assert.equal(full.fish, 100);
  assert.equal(full.animal, 60);
  const max = { birds: 7, insects: 3, fish: 0, animals: 2 };
  const list = planFauna([plot(0, 0, 4), plot(900, 0, 4)], species, max);
  assert.deepEqual(tally(list), { bird: 7, insect: 3, animal: 2 });
  // four flocks of birds share seven places: 2, 2, 2, 1, never 7 and 0
  const flocks = [0, 1].flatMap((pi) => [0, 1].map((sp) => list.filter((it) => it.plot === pi && it.sp === sp).length));
  assert.deepEqual(flocks.slice().sort(), [1, 2, 2, 2]);
  // the caps do not depend on the order of the list
  const size = (l, x, sp) => l.filter((it) => it.sp === sp && it.plot === (l === list ? (x ? 1 : 0) : (x ? 0 : 1))).length;
  const turned = planFauna([plot(900, 0, 4), plot(0, 0, 4)], species, max);
  for (const x of [0, 900]) for (const sp of [0, 1, 2, 4]) assert.equal(size(turned, x, sp), size(list, x, sp), `plot at ${x}, species ${sp}`);
});

test('fish need a river; unknown species and repeats are ignored', () => {
  assert.equal(planFauna([plot(0, 0, 4, [3], [])], species).length, 0);
  assert.equal(planFauna([{ x: 0, z: 0, r: 200, level: 4, fauna: [3] }], species).length, 0);
  assert.equal(planFauna([plot(0, 0, 4, [3])], species).length, herdSize('fish', 4));
  assert.equal(planFauna([plot(0, 0, 3, [0, 0, 99, 'nope', 0])], species).length, herdSize('bird', 3));
  assert.equal(planFauna([plot(0, 0, 0)], species).length, 0, 'nothing lives on a plot that has not bloomed');
  assert.equal(planFauna([], species).length, 0);
});

test('hash32 spreads: seeds of neighbouring plots and species differ', () => {
  const seen = new Set();
  for (let x = 0; x < 30; x++) for (let z = 0; z < 30; z++) for (let id = 0; id < 5; id++) seen.add(groupSeed(x * 100, z * 100, id));
  assert.equal(seen.size, 4500);
  assert.notEqual(hash32(1, 2), hash32(2, 1));
});
