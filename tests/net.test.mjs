// tests/net.test.mjs: the pure parts of the client's network layer, with a stub fetch
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNet, rowToHand } from '../src/net.js';
import { founders } from '../src/world/founders.js';
import { toB64 } from '../src/hand/dna.js';

const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const row = (f, i) => ({ id: `h${i}`, name: f.name, palette: 2, side: 'R', palm: toB64(f.palm), prints: f.prints.map(toB64), pose: f.pose, founder: true, placed_at: i });

test('the device token is random, 43 characters of base64url, and kept', () => {
  const s = memory(), a = createNet({ storage: s }).token, b = createNet({ storage: s }).token;
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(a, b);
  assert.notEqual(createNet({ storage: memory() }).token, a);
});

test('the world comes from the server, decoded; the founders stand in when the server is away (Review Focus 3)', async () => {
  const rows = founders().map(row);
  const net = createNet({ storage: memory(), fetchFn: async () => new Response(JSON.stringify({ gen: 1, hands: rows })) });
  const w = await net.fetchWorld();
  assert.equal(w.online, true);
  assert.equal(w.hands.length, 10);
  assert.deepEqual([...w.hands[0].palm], [...founders()[0].palm]);
  assert.equal(w.hands[0].prints[4].length, 44);
  const off = createNet({ storage: memory(), fetchFn: async () => { throw new Error('down'); } });
  const o = await off.fetchWorld();
  assert.equal(o.online, false);
  assert.equal(o.hands.length, 10);
  assert.equal(o.hands[3].name, 'Fennick');
  const slow = createNet({ storage: memory(), timeout: 50, fetchFn: () => new Promise(() => {}) });
  const t = performance.now(), s = await slow.fetchWorld();
  assert.equal(s.online, false);
  assert.ok(performance.now() - t < 1000);
});

test('laying: a 200 and a 409 are a Hand, a conflict is fits, the rest is an error', async () => {
  const f = founders()[0], mk = (status, body) => createNet({ storage: memory(), fetchFn: async () => new Response(JSON.stringify(body), { status }) });
  const h = { palm: f.palm, prints: f.prints, pose: f.pose, name: 'Testo' };
  assert.deepEqual(await mk(200, { id: 'x', pose: f.pose }).layHand(h), { id: 'x', pose: f.pose });
  assert.equal((await mk(409, { id: 'y', pose: f.pose }).layHand(h)).id, 'y');
  assert.equal((await mk(200, { conflict: true, fits: [] }).layHand(h)).conflict, true);
  assert.equal((await mk(400, { error: 'not a Hand' }).layHand(h)).error, 'not a Hand');
  assert.equal((await createNet({ storage: memory(), fetchFn: async () => { throw new Error('down'); } }).layHand(h)).error, 'offline');
});

test('rowToHand carries exactly what main.js bakes with', () => {
  const h = rowToHand(row(founders()[1], 1));
  assert.deepEqual(Object.keys(h).sort(), ['founder', 'id', 'name', 'palm', 'pose', 'prints']);
});
