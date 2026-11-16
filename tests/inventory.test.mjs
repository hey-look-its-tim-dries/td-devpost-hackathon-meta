import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryRows } from '../src/inventory.js';

const species = [{ name: 'Poppy', kind: 'flower' }, { name: 'Oak', kind: 'tree' }, { name: 'Fox', kind: 'animal', color: '#f80' }, { name: 'Iris', kind: 'flower' }, { name: 'Owl', kind: 'bird' }];
test('inventory: seeds you carry, flora you only know, fauna you met; each with its metric and status', () => {
  const r = inventoryRows({ species, seeds: { 0: 7, 1: 0, 3: 2 }, planted: { 0: 4, 1: 9 }, found: new Set([0, 1, 2, 3]), selected: 3 });
  assert.deepEqual(r.seeds, [{ id: 0, name: 'Poppy', n: 7, sown: 4, status: 'carried' }, { id: 3, name: 'Iris', n: 2, sown: 0, status: 'chosen' }]);
  assert.deepEqual(r.flora, [{ id: 1, name: 'Oak', n: 0, sown: 9, status: 'sown' }]);
  assert.deepEqual(r.fauna, [{ id: 2, name: 'Fox', n: 0, sown: 0, status: 'met', color: '#f80' }]);
  assert.equal(r.carried, 9); assert.equal(r.floraOf, 3); assert.equal(r.faunaOf, 2);
});
