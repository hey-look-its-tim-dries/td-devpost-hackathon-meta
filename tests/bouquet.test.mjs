// tests/bouquet.test.mjs: "I am what I have sown": a gardener's whole history, in order, as the flowers on their whorl
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logPlanting, bouquet, signature, fromSignature } from '../src/garden/bouquet.js';

const sow = (list) => list.reduce((log, [sp, n, day]) => logPlanting(log, sp, day, n), []);
test('the log keeps the order of what you sowed, and folds the same kind on the same day together', () => {
  let log = [];
  log = logPlanting(log, 7, 100); log = logPlanting(log, 7, 100); log = logPlanting(log, 9, 100); log = logPlanting(log, 7, 101);
  assert.deepEqual(log, [[7, 2, 100], [9, 1, 100], [7, 1, 101]]);
  let long = [];
  for (let i = 0; i < 2000; i++) long = logPlanting(long, i % 50, i, 1, 300);
  assert.ok(long.length <= 300, 'old history is folded, never dropped');
  assert.equal(long.reduce((a, e) => a + e[1], 0), 2000);
});
test('a beginner is a bare scribble; the bouquet grows with all you have sown, without end but ever slower', () => {
  const opt = { strands: 24 };
  assert.equal(bouquet([], opt).length, 0);
  const few = bouquet(sow([[3, 4, 1]]), opt), many = bouquet(sow([[3, 400, 1], [5, 300, 2]]), opt), vast = bouquet(sow([[3, 40000, 1], [5, 30000, 2]]), opt);
  assert.ok(few.length >= 2 && few.length < many.length && many.length < vast.length);
  assert.ok(vast.length <= 420, 'capped');
  assert.ok(few.every((o) => o.sp === 3 && o.at > 0 && o.at < 1 && o.strand >= 0 && o.strand < 24));
});
test('your history reads from head to tail: what you sowed first rides nearest the head', () => {
  const b = bouquet(sow([[1, 50, 1], [2, 50, 9], [3, 50, 30]]), { strands: 24 });
  const mean = (sp) => { const o = b.filter((q) => q.sp === sp); return o.reduce((a, q) => a + q.at, 0) / o.length; };
  assert.ok(mean(1) < mean(2) && mean(2) < mean(3));
});
test('magnitude shows: a kind you sowed a thousand times has more and larger flowers than one you sowed once', () => {
  const b = bouquet(sow([[1, 1000, 1], [2, 1, 1]]), { strands: 24 }), of = (sp) => b.filter((q) => q.sp === sp);
  assert.ok(of(1).length > of(2).length * 3);
  assert.ok(Math.max(...of(1).map((q) => q.size)) > Math.max(...of(2).map((q) => q.size)));
});
test('no two gardeners look alike, and one gardener always looks the same', () => {
  const a = sow([[1, 30, 1], [2, 30, 2]]), b = sow([[2, 30, 1], [1, 30, 2]]);
  assert.deepEqual(bouquet(a, { strands: 24 }), bouquet(a, { strands: 24 }));
  assert.notDeepEqual(bouquet(a, { strands: 24 }), bouquet(b, { strands: 24 }), 'the same flowers in another order are another bouquet');
  assert.notDeepEqual(bouquet(sow([[1, 60, 1]]), { strands: 24 }).map((o) => o.strand), bouquet(sow([[1, 60, 5]]), { strands: 24 }).map((o) => o.strand), 'the day you sowed it shows too');
});
test('a signature small enough to tell the room carries the order and the weight of the first 24 kinds', () => {
  const log = sow(Array.from({ length: 40 }, (_, i) => [100 + i, 1 + i * 20, i]));
  const sig = signature(log);
  assert.ok(sig.length <= 48 && sig.every((v) => Number.isInteger(v) && v >= 0 && v < 4096));
  const back = fromSignature(sig);
  assert.deepEqual(back.map((e) => e[0]), log.slice(0, 24).map((e) => e[0]));
  assert.ok(back[20][1] > back[1][1], 'more of it then, more of it now');
  assert.ok(bouquet(back, { strands: 5 }).length > 10);
  assert.deepEqual(fromSignature([5, 'x', 9999, -1]), [], 'junk from the room is nothing');
});
