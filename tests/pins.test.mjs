// tests/pins.test.mjs: pinned places (at most five, kept, pruned when a Hand is washed) and addresses
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPins, address } from '../src/world/pins.js';

const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test('five pins at most, the oldest goes; kept on the device', () => {
  const s = memory(), p = createPins(s);
  for (let i = 0; i < 7; i++) p.add({ handId: `h${i}`, code: 'I1', x: i, z: 0, label: `P${i}` });
  assert.equal(p.list().length, 5);
  assert.equal(p.list()[0].label, 'P2');
  assert.equal(createPins(s).list().length, 5);
  p.remove(0);
  assert.equal(p.list()[0].label, 'P3');
});
test('the same place is pinned once; pins of washed Hands are pruned (Review Focus 3)', () => {
  const p = createPins(null);
  p.add({ handId: 'a', code: 'I1', x: 0, z: 0, label: 'A' });
  p.add({ handId: 'a', code: 'I1', x: 0, z: 0, label: 'A' });
  p.add({ handId: 'b', code: 'P2', x: 5, z: 5, label: 'B' });
  assert.equal(p.list().length, 2);
  p.prune(new Set(['b']));
  assert.deepEqual(p.list().map((q) => q.label), ['B']);
});
test('an address names the Hand, the handbit and where it lies from the Source', () => {
  assert.equal(address({ hand: 'Yanida', handbit: 'Index tip', code: 'I1', x: 0, z: -19200 }), 'Yanida › I1 Index tip › 3.2 spans N of the Source');
  assert.equal(address({ hand: 'Oru', handbit: null, code: null, x: 6000, z: 6000 }), 'Oru › 1.4 spans SE of the Source');
});
