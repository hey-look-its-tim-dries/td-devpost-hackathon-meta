// tests/garden.test.mjs: the garden's rules (plant, tend, wilt, bloom, wildlife), the seed pouch, the seed clouds
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGarden, habitatOf, vigour, CAP, DRY_MS, DEAD_MS, LEVELS } from '../src/garden/garden.js';
import { createPouch } from '../src/garden/pouch.js';
import { clouds, golden } from '../src/garden/drift.js';

// a small index: 6 flora over the habitats, and wildlife of every kind
const S = [
  ['Marigold', 'flower', 'dune', 1], ['Lotus', 'flower', 'bank', 1], ['Edelweiss', 'flower', 'ridge', 1],
  ['Acacia', 'tree', 'dune', 2], ['Willow', 'tree', 'bank', 2], ['Dragon tree', 'tree', 'ridge', 4],
  ['Swallowtail', 'insect', 'dune', 1], ['Hoopoe', 'bird', 'dune', 2], ['Oryx', 'animal', 'dune', 3], ['Carp', 'fish', 'bank', 1], ['Phoenix', 'bird', 'dune', 4],
  ['Bee', 'insect', 'bank', 1], ['Heron', 'bird', 'bank', 2],
].map(([name, kind, habitat, rarity], id) => ({ id, name, kind, habitat, rarity, color: '#ff0000', color2: '#00ff00', form: 'daisy', size: 1 }));
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const T0 = 1_800_000_000_000;
const grove = (id, o = {}) => ({ id, hand: 'h', bit: 3, x: id * 10, y: 0, sp: 0, stage: 0, tended: T0, big: 0, ...o });

test('habitat: beside water is a bank, a fingertip is a ridge, the rest is dune', () => {
  assert.equal(habitatOf('P3', true), 'bank');
  assert.equal(habitatOf('I1', false), 'ridge');
  assert.equal(habitatOf('I2', false), 'dune');
  assert.equal(habitatOf('P1', false), 'dune');
});
test('a grove is fresh, then dry, then dead when nobody tends it', () => {
  const p = grove(1);
  assert.equal(vigour(p, T0 + 1000), 'fresh');
  assert.equal(vigour(p, T0 + DRY_MS + 1), 'dry');
  assert.equal(vigour(p, T0 + DEAD_MS + 1), 'dead');
});
test('a plot blooms by how much grows there, how well, and how many kinds', () => {
  const g = createGarden(S);
  assert.equal(g.plot('h', 3, T0).level, 0);
  for (let i = 0; i < 6; i++) g.add(grove(i + 1, { sp: 0 }));
  const few = g.plot('h', 3, T0);
  assert.equal(few.n, 6);
  assert.ok(few.level >= 1, 'six groves are a first bloom');
  const g2 = createGarden(S);
  for (let i = 0; i < 6; i++) g2.add(grove(i + 1, { sp: i % 3 }));
  assert.ok(g2.plot('h', 3, T0).score > few.score, 'more kinds score higher');
  for (let i = 0; i < 6; i++) g.tend(i + 1, 3, T0);
  assert.ok(g.plot('h', 3, T0).score > few.score * 2, 'grown groves count for more');
  assert.ok(g.plot('h', 3, T0 + DRY_MS + 1).score < g.plot('h', 3, T0).score, 'a dry plot counts for less');
  assert.equal(g.plot('h', 3, T0 + DEAD_MS + 1).level, 0, 'a dead plot is no bloom');
  assert.equal(LEVELS.length, 4);
});
test('a plot is full at CAP groves; remove frees a place; the same id twice is one grove', () => {
  const g = createGarden(S);
  for (let i = 0; i < CAP; i++) assert.ok(g.add(grove(i + 1)));
  assert.equal(g.full('h', 3), true);
  assert.equal(g.add(grove(1)), false);
  g.remove(1);
  assert.equal(g.full('h', 3), false);
  assert.equal(g.count, CAP - 1);
  assert.equal(g.removeHand('h'), CAP - 1);
  assert.equal(g.count, 0);
});
test('wildlife follows the bloom: insects first, then birds, then animals; the rarest only in full bloom; fish need a bank', () => {
  const g = createGarden(S), kinds = (ids) => [...new Set(ids.map((i) => S[i].kind))].sort();
  assert.deepEqual(g.fauna('h', 3, 'dune', 0), []);
  assert.deepEqual(kinds(g.fauna('h', 3, 'dune', 1)), ['insect']);
  assert.deepEqual(kinds(g.fauna('h', 3, 'dune', 2)), ['bird', 'insect']);
  assert.ok(kinds(g.fauna('h', 3, 'dune', 3)).includes('animal'));
  assert.ok(!g.fauna('h', 3, 'dune', 3).includes(10), 'no legend before full bloom');
  assert.ok(g.fauna('h', 3, 'dune', 4).includes(10), 'the legend comes to a full bloom');
  assert.ok(g.fauna('h', 3, 'bank', 2).includes(9), 'fish at a blooming bank');
  assert.deepEqual(g.fauna('h', 3, 'dune', 4), g.fauna('h', 3, 'dune', 4), 'the same for everyone');
});
test('nearest grove to a point, for tending and gathering', () => {
  const g = createGarden(S);
  g.add(grove(1, { x: 0, y: 0 })); g.add(grove(2, { x: 100, y: 0 }));
  assert.equal(g.nearest('h', 90, 5, 50).id, 2);
  assert.equal(g.nearest('h', 400, 0, 50), null);
});

test('the pouch: starters, gather, plant from the selected kind, move on when it runs out, kept on the device', () => {
  const store = mem(), p = createPouch(store, S, [0, 1, 2]);
  assert.equal(p.total, 30, 'ten of each starter');
  assert.equal(p.selected, 0);
  for (let i = 0; i < 10; i++) assert.equal(p.take(), 0);
  assert.equal(p.take(), 1, 'the next kind with seeds');
  p.gather(4, 3);
  assert.equal(p.has(4), 3);
  assert.ok(p.found.has(4));
  p.select(4);
  assert.equal(p.take(), 4);
  p.planted(4);
  const again = createPouch(store, S, [0, 1, 2]);
  assert.equal(again.has(4), 2);
  assert.equal(again.selected, 4);
  assert.deepEqual(again.deco(), [4], 'what you planted decorates your whorl');
});
test('the pouch: water is carried five at a time; experience makes levels', () => {
  const p = createPouch(null, S, [0, 1, 2]);
  assert.equal(p.pour(), false);
  p.fill();
  assert.equal(p.water, 5);
  assert.equal(p.pour(), true);
  assert.equal(p.water, 4);
  const l0 = p.level;
  for (let i = 0; i < 40; i++) p.credit('plant');
  assert.ok(p.level > l0);
  assert.equal(p.next(1), 1); assert.equal(p.next(1), 2); assert.equal(p.next(1), 0, 'cycles through what you carry');
});

test('seed clouds: the same for everyone at the same time, new ones each period, flora only', () => {
  const anchors = [{ id: 'a', x: 0, z: 0 }, { id: 'b', x: 5000, z: 0 }], flora = [0, 1, 2, 3, 4, 5];
  const c1 = clouds(T0, anchors, S, flora), c2 = clouds(T0 + 1000, [...anchors].reverse(), S, flora);
  assert.deepEqual(c1, c2);
  assert.equal(c1.length, 4, 'two per Hand');
  assert.ok(c1.every((c) => flora.includes(c.sp) && c.until > T0));
  assert.ok(c1.every((c) => S[c.sp].rarity < 4), 'legends only come as golden seeds');
  assert.notDeepEqual(clouds(T0 + 10 * 60000, anchors, S, flora).map((c) => c.id), c1.map((c) => c.id));
  assert.ok(Math.hypot(c1[0].x - 0, c1[0].z - 0) < 1500);
});
test('the golden seed: one for the whole world, a legend, somewhere new each time', () => {
  const anchors = [{ id: 'a', x: 0, z: 0 }, { id: 'b', x: 5000, z: 0 }], flora = [0, 1, 2, 3, 4, 5];
  const g = golden(T0, anchors, S, flora);
  assert.equal(S[g.sp].rarity, 4);
  assert.deepEqual(golden(T0 + 5, anchors, S, flora), g);
  assert.notEqual(golden(T0 + 20 * 60000, anchors, S, flora).epoch, g.epoch);
  assert.equal(golden(T0, [], S, flora), null);
});
