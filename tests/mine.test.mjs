// tests/mine.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameFor } from '../src/world/names.js';
import { saveHand, loadHand, forgetHand, checkHand } from '../src/world/mine.js';
import { packPalm, packPrint, synthPrint, fromB64, toB64 } from '../src/hand/dna.js';
import { templatePalm } from '../src/hand/shape.js';

const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const hand = () => ({
  palm: packPalm(templatePalm({ seed: 3 })),
  prints: [0, 1, 2, 3, 4].map((f) => packPrint(synthPrint(f, 'ulnar', 10 + f))),
  pose: { x: 1234.5, z: -6789, rot: 0.7, mirror: false },
  name: 'Saelo',
});

test('names read like a map: one capitalised word, the same for the same seed, nearly always different', () => {
  const names = Array.from({ length: 1000 }, (_, i) => nameFor(i + 1));
  for (const n of names) assert.match(n, /^[A-Z][a-z]{2,15}$/);
  assert.equal(nameFor(42), nameFor(42));
  assert.ok(new Set(names).size >= 950);
});

test('your Hand survives a reload: DNA, pose and name, nothing else', () => {
  const s = memory(), h = hand();
  saveHand(s, h);
  const back = loadHand(s);
  assert.deepEqual([...back.palm], [...h.palm]);
  back.prints.forEach((p, i) => assert.deepEqual([...p], [...h.prints[i]]));
  assert.deepEqual(back.pose, h.pose);
  assert.equal(back.name, 'Saelo');
  assert.deepEqual(Object.keys(JSON.parse(s.getItem('pwc.hand.v1'))).sort(), ['name', 'palm', 'pose', 'prints']);
});

test('a missing, broken or tampered save opens the world without it (Review Focus 2)', () => {
  const s = memory();
  assert.equal(loadHand(s), null);
  s.setItem('pwc.hand.v1', '{nope');
  assert.equal(loadHand(s), null);
  saveHand(s, hand());
  const v = JSON.parse(s.getItem('pwc.hand.v1'));
  for (const bad of [{ palm: 'AAAA' }, { palm: '!!' }, { prints: v.prints.slice(0, 3) }, { pose: { x: 'far', z: 0, rot: 0 } }, { pose: null }]) {
    s.setItem('pwc.hand.v1', JSON.stringify({ ...v, ...bad }));
    assert.equal(loadHand(s), null, JSON.stringify(bad));
  }
  const p0 = fromB64(v.prints[0]);
  p0[1] = 0x0f; // finger 0, class index 15: no such class
  s.setItem('pwc.hand.v1', JSON.stringify({ ...v, prints: [toB64(p0), ...v.prints.slice(1)] }));
  assert.equal(loadHand(s), null, 'unknown print class');
});

test('forgetting your Hand deletes it', () => {
  const s = memory();
  saveHand(s, hand());
  forgetHand(s);
  assert.equal(loadHand(s), null);
  assert.equal(s.m.size, 0);
});

test('checkHand is the one gate: strings or bytes in, a clean Hand or null out', () => {
  const h = hand();
  const ok = checkHand({ ...h, palm: toB64(h.palm), prints: h.prints.map(toB64) });
  assert.deepEqual([...ok.palm], [...h.palm]);
  assert.equal(ok.prints.length, 5);
  assert.equal(checkHand(h).name, 'Saelo');
  assert.equal(checkHand({ ...h, name: '  ' }), null, 'blank name');
  assert.equal(checkHand({ ...h, name: 'x'.repeat(41) }), null, 'long name');
  assert.equal(checkHand({ ...h, pose: { ...h.pose, x: 200000 } }), null, 'too far');
  assert.equal(checkHand({ ...h, pose: { ...h.pose, mirror: true } }), null, 'mirrored (M3 lays right hands)');
  assert.equal(checkHand({ ...h, prints: h.prints.slice(0, 4) }), null, 'four prints');
});

test('a saved Hand keeps its server id and whether it is still pending', () => {
  const s = memory();
  saveHand(s, { ...hand(), id: 'h1', pending: true });
  assert.equal(loadHand(s).id, 'h1');
  assert.equal(loadHand(s).pending, true);
  saveHand(s, hand());
  assert.equal(loadHand(s).id, undefined);
  assert.equal(loadHand(s).pending, false);
});
