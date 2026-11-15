// tests/community.test.mjs: the Community Hand's 22 slots (spec 6.4)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SLOTS, slotFor, isSealed } from '../src/world/community.js';

test('22 slots: the 15 finger handbits and P1 to P7', () => {
  assert.equal(SLOTS.length, 22);
  assert.equal(slotFor('I1'), 'I1');
  assert.equal(slotFor('P7'), 'P7');
  assert.equal(slotFor('P9'), null);
  assert.equal(slotFor('X1'), null);
});
test('sealed when every slot is filled', () => {
  assert.equal(isSealed(SLOTS.slice(0, 21).map((slot) => ({ slot }))), false);
  assert.equal(isSealed(SLOTS.map((slot) => ({ slot }))), true);
});
