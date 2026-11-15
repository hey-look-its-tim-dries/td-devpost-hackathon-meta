// tests/braid.test.mjs: two players meeting braid their swarms for a few seconds (spec 9)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBraid } from '../src/braid.js';

const run = (b, seconds, me, others) => { let r = null; for (let i = 0; i < seconds * 60; i++) r = b.update(1 / 60, me, others); return r; };

test('two players 150 m apart braid: k rises to 1 within 0.6 s', () => {
  const b = createBraid();
  const r = run(b, 0.6, [0, 500, 0], [{ id: 4, pos: [150, 500, 0] }]);
  assert.equal(r.id, 4);
  assert.ok(r.k > 0.99, `k ${r.k}`);
});
test('400 m apart: no braid', () => {
  assert.equal(run(createBraid(), 1, [0, 500, 0], [{ id: 4, pos: [400, 500, 0] }]), null);
});
test('a braid holds, falls, and the same player is not braided again within 30 s', () => {
  const b = createBraid({ hold: 3, cooldown: 30 }), near = [{ id: 4, pos: [100, 500, 0] }];
  run(b, 2, [0, 500, 0], near);
  assert.ok(run(b, 1, [0, 500, 0], near).k > 0.99, 'still holding at 3 s');
  assert.equal(run(b, 2, [0, 500, 0], near), null, 'over after hold + fall');
  assert.equal(run(b, 10, [0, 500, 0], near), null, 'cooling down');
  assert.equal(run(b, 21, [0, 500, 0], near)?.id, 4, 'again after 30 s (it starts 19 s into this run)');
});
test('one braid at a time: the nearest wins', () => {
  const r = run(createBraid(), 1, [0, 500, 0], [{ id: 5, pos: [200, 500, 0] }, { id: 6, pos: [80, 500, 0] }]);
  assert.equal(r.id, 6);
});
