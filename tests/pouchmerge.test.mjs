// tests/pouchmerge.test.mjs: two copies of one gardener's pouch meet (the map's and a device's): nothing either
// has earned is lost, and seeds spent on the device that played most do not come back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePouch } from '../src/garden/pouchmerge.js';

const rich = { seeds: { 1: 3, 2: 8 }, sel: 2, water: 2, xp: 500, planted: { 1: 40, 2: 12 }, found: [1, 2, 7, 9], log: [[1, 40, 10], [2, 12, 11]] };
const fresh = { seeds: { 1: 10 }, sel: 1, water: 0, xp: 5, planted: { 1: 1 }, found: [1], log: [[1, 1, 12]] };

test('a fresh device never wipes the history the map holds', () => {
  for (const m of [mergePouch(rich, fresh), mergePouch(fresh, rich)]) {
    assert.equal(m.xp, 500);
    assert.deepEqual(m.log, rich.log);
    assert.deepEqual(m.seeds, rich.seeds);
    assert.deepEqual([...m.found].sort((a, b) => a - b), [1, 2, 7, 9]);
    assert.equal(m.planted[1], 40);
  }
});

test('two devices that both played keep the herbarium and plantings of both', () => {
  const other = { seeds: { 3: 4 }, sel: 3, water: 1, xp: 520, planted: { 3: 6 }, found: [1, 3], log: [[3, 6, 12]] };
  const m = mergePouch(rich, other);
  assert.equal(m.xp, 520);
  assert.deepEqual(m.seeds, other.seeds); // seeds follow the most-played copy: spent seeds stay spent
  assert.deepEqual([...m.found].sort((a, b) => a - b), [1, 2, 3, 7, 9]);
  assert.deepEqual(m.planted, { 1: 40, 2: 12, 3: 6 });
});

test('nothing stored yet, or junk stored: the incoming pouch as it is', () => {
  assert.deepEqual(mergePouch(null, fresh), fresh);
  assert.deepEqual(mergePouch({ nonsense: 1 }, fresh), fresh);
});
