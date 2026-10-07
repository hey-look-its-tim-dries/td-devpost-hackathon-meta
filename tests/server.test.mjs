// tests/server.test.mjs: the Worker end to end, against `wrangler dev` with local D1 and Durable Objects.
// Skips unless a server answers on API (default http://localhost:8787). SERVER=1 starts one if none does:
//   cd server && npm run seed && npm run dev      then      node --test tests/server.test.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { packPalm, packPrint, synthPrint, toB64, fromB64, unpackPalm } from '../src/hand/dna.js';
import { templatePalm, handShape } from '../src/hand/shape.js';
import { findFits } from '../src/world/fit.js';
import { encodePose, decodeSnapshot } from '../src/net/wire.js';

const API = process.env.API ?? 'http://localhost:8787';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const up = async () => { try { return (await fetch(API + '/world')).ok; } catch { return false; } };
let proc = null;
if (!(await up()) && process.env.SERVER === '1') {
  const dir = new URL('../server/', import.meta.url).pathname;
  proc = spawn('sh', ['-c', 'npm run -s seed && exec npm run -s dev'], { cwd: dir, stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await up()); i++) await wait(1000);
}
after(() => proc?.kill());
const skip = !(await up()) && `no server on ${API}`;

const world = async () => (await (await fetch(API + '/world')).json()).hands;
const shapes = (hands) => hands.map((h) => ({ pose: h.pose, shape: handShape(unpackPalm(fromB64(h.palm))) }));
const body = (pose, { name = 'Testo', token = 'a'.repeat(40), seed = 77 } = {}) => ({ token, name, palm: toB64(packPalm(templatePalm({ seed }))), prints: [0, 1, 2, 3, 4].map((f) => toB64(packPrint(synthPrint(f, 'whorl', 50 + f)))), pose });
const post = (b) => fetch(API + '/hands', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const wash = (id, token) => fetch(`${API}/hands/${id}`, { method: 'DELETE', body: JSON.stringify({ token }) });

test('lay, see, conflict, one Hand per token, refuse junk, wash (Review Focus 2)', { skip }, async () => {
  for (const h of (await world()).filter((h) => !h.founder)) await wash(h.id, 'a'.repeat(40)); // a previous run
  const w0 = await world();
  assert.ok(w0.filter((h) => h.founder).length === 10);
  const fit = findFits(shapes(w0), handShape(templatePalm({ seed: 77 })))[0];
  const r1 = await post(body(fit.pose));
  assert.equal(r1.status, 200);
  const { id, pose } = await r1.json();
  assert.ok(id && Math.abs(pose.x - fit.pose.x) < 1e-6);
  const w1 = await world();
  assert.equal(w1.length, w0.length + 1);
  assert.equal(w1.find((h) => h.id === id).name, 'Testo');
  const again = await post(body(fit.pose, { token: 'b'.repeat(40) }));
  assert.equal(again.status, 200, 'a conflict is an answer, not an error');
  const c = await again.json();
  assert.equal(c.conflict, true);
  assert.ok(c.fits.length >= 1 && c.fits.length <= 3);
  const same = await post(body(fit.pose));
  assert.equal(same.status, 409, 'one Hand per token');
  assert.equal((await same.json()).id, id);
  assert.equal((await post({ ...body(fit.pose, { token: 'b'.repeat(40) }), prints: [] })).status, 400);
  assert.equal((await post(body(fit.pose, { name: 'x'.repeat(41), token: 'b'.repeat(40) }))).status, 400);
  assert.equal((await post({ ...body(fit.pose), token: 'short' })).status, 400);
  assert.equal((await wash(id, 'b'.repeat(40))).status, 404, 'not your Hand');
  assert.equal((await wash(id, 'a'.repeat(40))).status, 204);
  assert.equal((await world()).length, w0.length);
});

const socket = (q = '') => new Promise((resolve, reject) => {
  const ws = new WebSocket(API.replace(/^http/, 'ws') + '/room?region=eu' + q);
  ws.binaryType = 'arraybuffer';
  const got = { text: [], snaps: [] };
  ws.onmessage = (e) => (typeof e.data === 'string' ? got.text.push(JSON.parse(e.data)) : got.snaps.push(decodeSnapshot(new Uint8Array(e.data))));
  ws.onopen = () => resolve({ ws, got });
  ws.onerror = reject;
});

test('two players see each other within a second, and a lay and a wash reach both', { skip }, async () => {
  const a = await socket('&shard=3'), b = await socket('&shard=3');
  await wait(300);
  const ia = a.got.text[0]?.hello, ib = b.got.text[0]?.hello;
  assert.ok(Number.isInteger(ia) && Number.isInteger(ib) && ia !== ib);
  for (let i = 0; i < 5; i++) { a.ws.send(encodePose({ x: 1, y: 2, z: 3, yaw: 0, pitch: 0, mode: 0 })); b.ws.send(encodePose({ x: 9, y: 8, z: 7, yaw: 0, pitch: 0, mode: 0 })); await wait(200); }
  await wait(400);
  const last = a.got.snaps.at(-1);
  assert.ok(last.some((p) => p.id === ia) && last.some((p) => p.id === ib && Math.abs(p.pose.x - 9) < 1e-6), 'both in the snapshot');
  const token = 'c'.repeat(40), w = await world();
  for (const h of w.filter((h) => !h.founder)) await wash(h.id, token);
  const fit = findFits(shapes(await world()), handShape(templatePalm({ seed: 78 })))[0];
  const r = await post(body(fit.pose, { name: 'Rooma', token, seed: 78 }));
  assert.equal(r.status, 200);
  const { id } = await r.json();
  await wait(500);
  assert.ok(a.got.text.some((t) => t.laid?.id === id) && b.got.text.some((t) => t.laid?.id === id), 'laid reached both');
  assert.equal(a.got.text.find((t) => t.laid?.id === id).laid.name, 'Rooma');
  await wash(id, token);
  await wait(500);
  assert.ok(a.got.text.some((t) => t.left === id) && b.got.text.some((t) => t.left === id), 'the wash reached both');
  a.ws.close(); b.ws.close();
});

test('a full room points at the next shard (Review Focus 5)', { skip }, async () => {
  const a = await socket('&shard=7&cap=1');
  const b = await socket('&shard=7&cap=1');
  await wait(300);
  assert.equal(b.got.text[0]?.full, 'eu-8');
  assert.equal(a.got.text[0]?.hello !== undefined, true);
  a.ws.close();
});
