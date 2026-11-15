// tests/others.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOthers } from '../src/others.js';

const pose = (x) => ({ x, y: 1000, z: 0, yaw: 0, pitch: 0, mode: 0 });

test('one creature per other player, never me, freed after two snapshots without them (Review Focus 4)', () => {
  const o = createOthers({ max: 60 });
  o.apply([{ id: 1, pose: pose(0) }, { id: 2, pose: pose(10) }, { id: 7, pose: pose(20) }], 7);
  assert.equal(o.count, 2);
  o.apply([{ id: 1, pose: pose(1) }], 7);
  assert.equal(o.count, 2, 'one miss keeps it');
  o.apply([{ id: 1, pose: pose(2) }], 7);
  assert.equal(o.count, 1, 'two misses free it');
  o.apply([], 7);
  o.apply([], 7);
  assert.equal(o.count, 0);
});

test('only the nearest `max` get a creature', () => {
  const o = createOthers({ max: 3 });
  const snap = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, pose: pose(i * 1000) }));
  o.apply(snap, 0, [0, 1000, 0]);
  assert.equal(o.count, 3);
  const ids = [];
  o.each((c, id) => ids.push(id));
  assert.deepEqual(ids.sort(), [1, 2, 3]);
});

test('update moves a creature towards its pose and gives the ink strands', () => {
  const o = createOthers();
  o.apply([{ id: 4, pose: pose(500) }], 0);
  for (let i = 0; i < 30; i++) o.update(1 / 60, [0, 1000, 0]);
  let seen = 0;
  o.each((c) => { assert.equal(c.strands, 5); assert.ok(c.strand(0).count >= 2); seen++; });
  assert.equal(seen, 1);
});

test('names: kept for players in the room, dropped when they leave', () => {
  const o = createOthers();
  const pose = { x: 0, y: 100, z: 0, yaw: 0, pitch: 0, mode: 0 };
  o.setNames({ 3: 'Firath', 4: 'Cadio' });
  o.apply([{ id: 3, pose }, { id: 4, pose }], 1);
  assert.equal(o.nameOf(3), 'Firath');
  o.apply([{ id: 4, pose }], 1);
  o.apply([{ id: 4, pose }], 1);
  assert.equal(o.nameOf(3), null, 'gone after two snapshots without them');
  assert.equal(o.nameOf(4), 'Cadio');
});
