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
  const back = await same.json();
  assert.equal(back.id, id);
  assert.equal(back.name, 'Testo', 'a 409 hands back the whole Hand (final review 2)');
  assert.equal(back.prints.length, 5);
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

test('two lays on one spot at the same moment: exactly one Hand (Review Focus 2, final review 3)', { skip }, async () => {
  const tokens = ['d', 'e', 'f', 'g'].map((c) => c.repeat(40));
  for (const h of (await world()).filter((h) => !h.founder)) for (const t of tokens) await wash(h.id, t);
  const w0 = await world(), fit = findFits(shapes(w0), handShape(templatePalm({ seed: 77 })))[0];
  const answers = await Promise.all(tokens.map((token, k) => post(body(fit.pose, { token, name: `Race${k}` })).then(async (r) => ({ status: r.status, body: await r.json() }))));
  const laid = answers.filter((a) => a.status === 200 && a.body.id);
  assert.equal(laid.length, 1, JSON.stringify(answers.map((a) => a.status)));
  assert.ok(answers.every((a) => a.status === 200), 'never a 500');
  assert.equal((await world()).length, w0.length + 1);
  await wash(laid[0].body.id, tokens[answers.indexOf(laid[0])]);
});

test('GET is open to any origin; the local preview ports may write (final review 9)', { skip }, async () => {
  assert.equal((await fetch(API + '/world', { headers: { Origin: 'https://example.org' } })).headers.get('access-control-allow-origin'), '*');
  const pre = await fetch(API + '/hands', { method: 'OPTIONS', headers: { Origin: 'http://localhost:8123', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(pre.headers.get('access-control-allow-origin'), 'http://localhost:8123');
});

test('stats count the Hands and who is flying; names travel through the room (Task 1)', { skip }, async () => {
  const s0 = await (await fetch(API + '/stats')).json();
  assert.ok(Number.isInteger(s0.hands) && s0.hands >= 10);
  assert.ok(Number.isInteger(s0.flying));
  const open = () => new Promise((res) => { const ws = new WebSocket(API.replace(/^http/, 'ws') + '/room?shard=77'); ws.binaryType = 'arraybuffer'; const got = []; ws.onmessage = (e) => typeof e.data === 'string' && got.push(JSON.parse(e.data)); ws.onopen = () => res({ ws, got }); });
  const a = await open(), b = await open();
  await wait(300);
  a.ws.send(JSON.stringify({ name: '\u0007Firath' }));
  await wait(500);
  const heard = b.got.find((m) => m.names && m.hello === undefined);
  assert.ok(heard, 'b hears a name');
  assert.equal(Object.values(heard.names)[0], 'Firath', 'cleaned on the server');
  const c = await open();
  await wait(300);
  assert.equal(Object.values(c.got.find((m) => m.hello !== undefined).names)[0], 'Firath', 'a newcomer gets every name at hello');
  for (const x of [a, b, c]) x.ws.send(encodePose({ x: 0, y: 500, z: 0, yaw: 0, pitch: 0, mode: 0 }));
  await wait(11000);
  for (const x of [a, b, c]) x.ws.send(encodePose({ x: 0, y: 500, z: 0, yaw: 0, pitch: 0, mode: 0 }));
  await wait(800);
  const s1 = await (await fetch(API + '/stats')).json();
  assert.ok(s1.flying >= 3, `flying ${s1.flying}`);
  for (const x of [a, b, c]) x.ws.close();
});

test('naming: owners name their handbits, anyone with a Hand names a summit first (Task 8)', { skip }, async () => {
  const shapesNow = shapes(await world());
  const mk = async (token, seed) => { const fit = findFits(shapesNow, handShape(templatePalm({ seed })))[0]; const r = await post(body(fit.pose, { token, seed, name: 'Namer' })); return r.status === 200 ? (await r.json()).id : (await r.json()).id; };
  const tokA = 'n'.repeat(40), tokB = 'o'.repeat(40);
  for (const h of (await world()).filter((h) => !h.founder)) for (const t of [tokA, tokB]) await wash(h.id, t);
  const a = await mk(tokA, 91);
  const name = (token, hand_id, feature, n) => fetch(API + '/names', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, hand_id, feature, name: n }) });
  assert.equal((await name(tokA, a, 'I1', 'Oru Vale')).status, 200);
  assert.equal((await name(tokB, a, 'I2', 'Mine Now')).status, 403, 'a stranger may not name your handbits');
  assert.equal((await name(tokA, 'hand-founder-0', 'summit:1', 'Brisk Fell')).status, 200);
  assert.equal((await name(tokA, 'hand-founder-0', 'summit:1', 'Other Fell')).status, 409, 'the first name stays');
  assert.equal((await name(tokB, 'hand-founder-0', 'summit:2', 'No Hand')).status, 403, 'naming a summit needs a Hand of your own');
  assert.equal((await name(tokA, a, 'I1', 'nazi')).status, 400);
  assert.equal((await name(tokA, a, 'Z9', 'Bad')).status, 400);
  const all = (await (await fetch(API + '/names')).json()).names;
  assert.equal(all[a].I1, 'Oru Vale');
  assert.equal(all['hand-founder-0']['summit:1'], 'Brisk Fell');
  await wash(a, tokA);
  assert.equal((await (await fetch(API + '/names')).json()).names[a], undefined, 'a wash takes its names along');
});

test('the Community Hand: 22 donors seal it, the 23rd starts the next; one donation each (Task 9, Review Focus 5)', { skip }, async () => {
  for (const h of (await world()).filter((h) => /^Donor \d+$/.test(h.name))) await wash(h.id, `cm${h.name.split(' ')[1].padStart(2, '0')}`.padEnd(40, 'x')); // a previous run
  const before = await (await fetch(API + '/community')).json();
  const no = before.no, filled = new Set(before.slots.map((s) => s.slot));
  const codes = ['T1', 'T2', 'T3', 'I1', 'I2', 'I3', 'M1', 'M2', 'M3', 'R1', 'R2', 'R3', 'L1', 'L2', 'L3', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'].filter((c) => !filled.has(c));
  const donors = [], shapesNow = shapes(await world());
  const fitFor = (seed) => findFits(shapesNow, handShape(templatePalm({ seed })))[0].pose;
  for (let i = 0; i <= codes.length; i++) {
    const token = `cm${String(i).padStart(2, '0')}`.padEnd(40, 'x'), r = await post(body(fitFor(200 + i), { token, seed: 200 + i, name: `Donor ${i}` }));
    const j = await r.json();
    if (j.conflict) { const r2 = await post(body(j.fits[0].pose, { token, seed: 200 + i, name: `Donor ${i}` })); donors.push({ token, id: (await r2.json()).id }); }
    else donors.push({ token, id: j.id });
    shapesNow.push(...shapes([(await world()).find((h) => h.id === donors.at(-1).id)]));
  }
  const give = (token, code) => fetch(API + '/community', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, code }) });
  assert.equal((await give(donors[0].token, codes[0])).status, 200);
  assert.equal((await give(donors[0].token, codes[1])).status, 409, 'one donation each');
  const results = await Promise.all(codes.slice(1).map((code, i) => give(donors[i + 1].token, code))); // all at once: the World takes them one by one
  assert.ok(results.every((r) => r.status === 200), results.map((r) => r.status).join(','));
  const after = await (await fetch(API + '/community')).json();
  assert.equal(after.no, no + 1, 'sealed: the next one started');
  assert.equal(after.sealed, no);
  const last = await give(donors[codes.length].token, 'I1');
  assert.equal(last.status, 200);
  assert.equal((await last.json()).no, no + 1);
  assert.equal((await give('zz'.repeat(20), 'I1')).status, 403, 'only players with a Hand donate');
  for (const d of donors) await wash(d.id, d.token);
});

test('the journal: a lay and a wash are events, a lay that joins rivers records its confluences (Task 10)', { skip }, async () => {
  const w0 = await world();
  const fit = findFits(shapes(w0), handShape(templatePalm({ seed: 5 }))).find((f) => f.rivers > 0) ?? findFits(shapes(w0), handShape(templatePalm({ seed: 5 })))[0];
  const tok = 'j'.repeat(40);
  for (const h of (await world()).filter((h) => h.name === 'Journaler')) await wash(h.id, tok); // a previous run
  const r = await post(body(fit.pose, { token: tok, seed: 5, name: 'Journaler' }));
  const { id } = await r.json();
  const ev = (await (await fetch(API + '/events')).json()).events;
  const laid = ev.find((e) => e.kind === 'laid' && e.hand_id === id);
  assert.ok(laid, 'the lay is in the journal');
  assert.equal(laid.data.name, 'Journaler');
  if (fit.rivers > 0) {
    assert.ok(ev.some((e) => e.kind === 'confluence' && e.hand_id === id));
    const { pairs } = await (await fetch(API + '/watersheds')).json();
    assert.ok(pairs.some((p) => p.includes(id)));
  }
  await wash(id, tok);
  const ev2 = (await (await fetch(API + '/events')).json()).events;
  assert.ok(ev2.some((e) => e.kind === 'washed'), 'a wash is in the journal');
  assert.ok(!JSON.stringify(ev2).includes('Journaler'), 'but not who washed (spec 8.5)');
  assert.ok(!(await (await fetch(API + '/watersheds')).json()).pairs.some((p) => p.includes(id)), 'its confluences leave with it');
});

test('pairing relay: create, send once, collect once; junk and unknown codes refused (Task 12)', { skip }, async () => {
  const { code } = await (await fetch(API + '/pair', { method: 'POST' })).json();
  assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  assert.equal((await fetch(`${API}/pair/${code}`)).status, 204, 'waiting');
  const dna = body({ x: 0, z: 0, rot: 0 });
  const send = (c, b) => fetch(`${API}/pair/${c}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  assert.equal((await send(code, { palm: 'AAAA', prints: [] })).status, 400, 'not DNA');
  assert.equal((await send(code, { palm: dna.palm, prints: dna.prints, name: 'Phoned' })).status, 200);
  const got = await fetch(`${API}/pair/${code}`);
  assert.equal(got.status, 200);
  const j = await got.json();
  assert.equal(j.palm, dna.palm);
  assert.equal(j.name, 'Phoned');
  assert.equal((await fetch(`${API}/pair/${code}`)).status, 404, 'collected once');
  assert.equal((await send('QQQQQQ', { palm: dna.palm, prints: dna.prints })).status, 404);
});

test('review 2, 5, 6: names stored cleaned; a wash leaves no name in the journal; renames and pairing are throttled; room name floods close (fix pass)', { skip }, async () => {
  const tok = 'r'.repeat(40);
  for (const h of (await world()).filter((h) => h.name.startsWith('AB'))) await wash(h.id, tok);
  const fit = findFits(shapes(await world()), handShape(templatePalm({ seed: 404 })))[0];
  const r = await post({ ...body(fit.pose, { token: tok, seed: 404 }), name: 'A‮B' + 'q'.repeat(30) });
  assert.equal(r.status, 200);
  const { id } = await r.json();
  const stored = (await world()).find((h) => h.id === id).name;
  assert.equal(stored, ('AB' + 'q'.repeat(30)).slice(0, 24), 'stored cleaned');
  const name = (n) => fetch(API + '/names', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tok, hand_id: id, feature: 'I1', name: n }) });
  for (const n of ['One', 'Two', 'Three']) assert.equal((await name(n)).status, 200);
  const named = (await (await fetch(API + '/events')).json()).events.filter((e) => e.kind === 'named' && e.hand_id === id);
  assert.equal(named.length, 1, 'only the first naming of a feature goes in the journal');
  await wash(id, tok);
  const ev = JSON.stringify((await (await fetch(API + '/events')).json()).events);
  assert.ok(!ev.includes(stored), 'the washed name is nowhere in the journal');
  let codes = 0, limited = false;
  for (let i = 0; i < 25 && !limited; i++) { const p = await fetch(API + '/pair', { method: 'POST' }); if (p.status === 429) limited = true; else codes++; }
  assert.ok(limited && codes <= 20, `pairing throttled after ${codes}`);
  const ws = new WebSocket(API.replace(/^http/, 'ws') + '/room?shard=88');
  const closed = new Promise((res) => (ws.onclose = (e) => res(e.code)));
  await new Promise((res) => (ws.onopen = res));
  for (let i = 0; i < 40; i++) ws.send(JSON.stringify({ name: i % 2 ? 'Aa' : 'Bb' }));
  assert.equal(await Promise.race([closed, wait(3000).then(() => 'open')]), 1008, 'a name flood closes the socket');
});
