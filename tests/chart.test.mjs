// tests/chart.test.mjs: charting handbits by flying over them, and a Hand's seal
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChart } from '../src/world/chart.js';

const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test('a handbit is new once; the last one seals the Hand', () => {
  const c = createChart(memory());
  assert.equal(c.visit('h1', 0, 3), 'new');
  assert.equal(c.visit('h1', 0, 3), null);
  assert.equal(c.visit('h1', 2, 3), 'new');
  assert.equal(c.count('h1'), 2);
  assert.equal(c.sealed('h1'), false);
  assert.equal(c.visit('h1', 1, 3), 'sealed');
  assert.equal(c.sealed('h1'), true);
  assert.equal(c.mask('h1'), 0b111);
  assert.ok(c.has('h1', 1) && !c.has('h2', 1));
});
test('kept on the device, and in memory when storage is refused (Review Focus 2)', () => {
  const s = memory(), a = createChart(s);
  a.visit('h1', 4, 20);
  assert.ok(createChart(s).has('h1', 4));
  const throwing = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() {} };
  for (const st of [null, throwing]) { const m = createChart(st); assert.equal(m.visit('x', 1, 2), 'new'); assert.ok(m.has('x', 1)); }
});
test('forget drops a washed Hand (Review Focus 3); fill charts a whole Hand (your own)', () => {
  const c = createChart(memory());
  c.visit('h1', 0, 2);
  c.forget('h1');
  assert.equal(c.count('h1'), 0);
  c.fill('mine', 22);
  assert.equal(c.sealed('mine'), true);
  assert.equal(c.count('mine'), 22);
});
test('handbit indices up to 31 fit the mask', () => {
  const c = createChart(memory());
  c.visit('h', 30, 31);
  assert.equal(c.mask('h'), 2 ** 30);
});
