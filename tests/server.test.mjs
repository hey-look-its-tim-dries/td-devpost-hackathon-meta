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

test('deferred minors: /events?since, a summit cap per player, two donors racing for one slot', { skip }, async () => {
  const toks = ['u', 'v'].map((c) => c.repeat(40));
  for (const h of (await world()).filter((h) => /^Minor [uv]$/.test(h.name))) for (const t of toks) await wash(h.id, t); // a previous run
  const ids = [];
  for (const [k, token] of toks.entries()) {
    const fit = findFits(shapes(await world()), handShape(templatePalm({ seed: 300 + k })))[0];
    ids.push((await (await post(body(fit.pose, { token, seed: 300 + k, name: `Minor ${'uv'[k]}` }))).json()).id);
  }
  // since: only what came after
  const all = (await (await fetch(API + '/events')).json()).events, top = all[0].id;
  assert.deepEqual((await (await fetch(`${API}/events?since=${top}`)).json()).events, []);
  assert.equal((await (await fetch(`${API}/events?since=${top - 1}`)).json()).events.length, 1);
  // summits: five each
  const name = (feature, hand_id, n) => fetch(API + '/names', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: toks[0], hand_id, feature, name: n }) });
  for (let s = 0; s < 5; s++) assert.equal((await name(`summit:${s}`, 'hand-founder-7', `Capfell ${'abcde'[s]}`)).status, 200);
  assert.equal((await name('summit:0', 'hand-founder-8', 'Capfell f')).status, 429, 'a sixth summit is refused');
  // the same free slot, two donors, one moment: one gets it, the other a clear 409
  const { slots } = await (await fetch(API + '/community')).json();
  const free = ['T1', 'T2', 'T3', 'I1', 'I2', 'I3', 'M1', 'M2', 'M3', 'R1', 'R2', 'R3', 'L1', 'L2', 'L3', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'].find((c) => !slots.some((s) => s.slot === c));
  const give = (token) => fetch(API + '/community', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, code: free }) });
  const st = (await Promise.all(toks.map(give))).map((r) => r.status).sort();
  assert.deepEqual(st, free === 'P7' && slots.length === 21 ? [200, 200] : [200, 409], st.join(','));
  for (const [k, id] of ids.entries()) await wash(id, toks[k]);
});

test('the garden: plant, see, water, uproot; a plot fills at 80; a wash takes its groves; the golden seed has one winner', { skip }, async () => {
  const J = { 'Content-Type': 'application/json' }, tokA = 'G'.repeat(43), tokB = 'H'.repeat(43);
  const plant = (b) => fetch(API + '/plants', { method: 'POST', headers: J, body: JSON.stringify(b) });
  const all = async () => (await (await fetch(API + '/plants')).json());
  for (const h of (await world()).filter((h) => h.name === 'Gardener')) await wash(h.id, tokA.slice(0, 40)); // a previous run
  for (const p of (await all()).plants.filter((p) => p[1] === 'hand-founder-2')) await fetch(`${API}/plants/${p[0]}`, { method: 'DELETE', headers: J, body: JSON.stringify({ token: tokA }) });
  const seed = { token: tokA, hand_id: 'hand-founder-2', bit: 4, x: 12.5, y: -40, sp: 7, hab: 'bank', big: 0 };
  assert.equal((await plant({ ...seed, token: 'short' })).status, 400);
  assert.equal((await plant({ ...seed, hand_id: 'nope' })).status, 404);
  assert.equal((await plant({ ...seed, sp: -1 })).status, 400);
  assert.equal((await plant({ ...seed, x: 1e9 })).status, 400);
  const r = await plant(seed);
  assert.equal(r.status, 200);
  const { id } = await r.json();
  const row = (await all()).plants.find((p) => p[0] === id);
  assert.deepEqual(row.slice(1, 7), ['hand-founder-2', 4, 12.5, -40, 7, 0]);
  assert.equal(row[9], 'bank');
  // water: a stage up, then not again at once; another player may water it too
  const tend = (token) => fetch(`${API}/plants/${id}/tend`, { method: 'POST', headers: J, body: JSON.stringify({ token }) });
  assert.equal((await tend(tokB)).status, 429, 'a grove just planted has had its water');
  await wait(1100);
  const t1 = await tend(tokB);
  assert.equal(t1.status, 200);
  assert.equal((await t1.json()).stage, 1);
  assert.equal((await tend(tokA)).status, 429);
  // uproot: not a stranger's fresh grove; the planter may
  const up = (token) => fetch(`${API}/plants/${id}`, { method: 'DELETE', headers: J, body: JSON.stringify({ token }) });
  assert.equal((await up(tokB)).status, 403);
  assert.equal((await up(tokA)).status, 204);
  assert.ok(!(await all()).plants.some((p) => p[0] === id));
  // a plot holds 80
  const ids = [];
  for (let i = 0; i < 80; i++) { const q = await plant({ ...seed, bit: 9, x: i }); assert.equal(q.status, 200, `grove ${i}`); ids.push((await q.json()).id); }
  assert.equal((await plant({ ...seed, bit: 9, x: 99 })).status, 409, 'the plot is full');
  const st = await (await fetch(API + '/stats')).json();
  assert.ok(st.plants >= 80);
  assert.ok((await all()).top.some((t) => t.n >= 80), 'the gardeners board counts them');
  assert.ok((await (await fetch(API + '/events')).json()).events.some((e) => e.kind === 'bloomed'), 'thirty groves on a plot is news');
  for (const i of ids) await up2(i);
  async function up2(i) { await fetch(`${API}/plants/${i}`, { method: 'DELETE', headers: J, body: JSON.stringify({ token: tokA }) }); }
  // a washed Hand takes its groves
  const fit = findFits(shapes(await world()), handShape(templatePalm({ seed: 611 })))[0];
  const mine = await (await post(body(fit.pose, { token: tokA.slice(0, 40), seed: 611, name: 'Gardener' }))).json();
  const g = await (await plant({ ...seed, hand_id: mine.id })).json();
  await wash(mine.id, tokA.slice(0, 40));
  assert.ok(!(await all()).plants.some((p) => p[0] === g.id));
  // the golden seed: the first to claim this round wins, the next hears who did
  const epoch = Math.floor(Date.now() / 240000), claim = (token, e = epoch) => fetch(API + '/golden', { method: 'POST', headers: J, body: JSON.stringify({ token, epoch: e }) }).then((q) => q.json());
  const c1 = await claim(tokA), c2 = await claim(tokB);
  assert.ok(c1.won === true || typeof c1.name === 'string'); // an earlier run may hold this round
  assert.equal(c2.won, false);
  assert.equal(typeof c2.name, 'string');
  assert.equal((await fetch(API + '/golden', { method: 'POST', headers: J, body: JSON.stringify({ token: tokA, epoch: epoch + 9 }) })).status, 400);
});

test('the garden at scale: groves are read Hand by Hand; a hyper sow sends many sprigs at once; sprigs weigh a fifth of a grove', { skip }, async () => {
  const J = { 'Content-Type': 'application/json' }, tok = 'S'.repeat(43);
  const of = async (hand) => (await (await fetch(`${API}/plants?hand=${hand}`)).json()).plants;
  const clear = async (hand) => { for (const p of await of(hand)) await fetch(`${API}/plants/${p[0]}`, { method: 'DELETE', headers: J, body: JSON.stringify({ token: tok }) }); };
  await clear('hand-founder-4');
  const sprig = (i, bit = 2) => ({ hand_id: 'hand-founder-4', bit, x: i * 0.5, y: 7, sp: 3, hab: 'dune', big: 2 });
  const batch = (list) => fetch(API + '/plants', { method: 'POST', headers: J, body: JSON.stringify({ token: tok, batch: list }) });
  const r = await batch(Array.from({ length: 40 }, (_, i) => sprig(i)));
  assert.equal(r.status, 200);
  const { ids } = await r.json();
  assert.equal(ids.length, 40);
  assert.ok(ids.every((id) => Number.isInteger(id)));
  const mine = await of('hand-founder-4');
  assert.equal(mine.length, 40);
  assert.equal(mine[0][8], 2, 'kept as sprigs');
  assert.ok(!(await of('hand-founder-5')).some((p) => p[1] === 'hand-founder-4'), 'another Hand has only its own');
  assert.equal((await batch(Array.from({ length: 41 }, (_, i) => sprig(i)))).status, 400, 'forty at most');
  assert.equal((await batch([sprig(1), { ...sprig(2), sp: -4 }])).status, 400, 'one bad sprig refuses the lot');
  // a plot holds 400 units: a grove is 5, a sprig 1. 40 sprigs are in; 72 groves make 400; the next thing is refused
  for (let i = 0; i < 72; i++) assert.equal((await fetch(API + '/plants', { method: 'POST', headers: J, body: JSON.stringify({ token: tok, ...sprig(i), big: 0 }) })).status, 200, `grove ${i}`);
  assert.equal((await fetch(API + '/plants', { method: 'POST', headers: J, body: JSON.stringify({ token: tok, ...sprig(1) }) })).status, 409, 'full');
  const part = await batch([sprig(1, 3), sprig(2)]); // one for a free plot, one for the full one
  assert.deepEqual((await part.json()).ids.map((id) => id !== null), [true, false], 'what fits is planted, the rest is told');
  await clear('hand-founder-4');
});

test('profiles: a gardener\'s pouch is kept on the map by device, read back, refused when junk or huge, and deleted on request; Facebook login says so when it is not set up', { skip }, async () => {
  const J = { 'Content-Type': 'application/json' }, tok = 'P'.repeat(43), post = (path, b) => fetch(API + path, { method: 'POST', headers: J, body: JSON.stringify(b) });
  await post('/profile/delete', { token: tok });
  assert.deepEqual(await (await post('/profile/get', { token: tok })).json(), { data: null, linked: false });
  const data = { seeds: { 3: 5 }, sel: 3, water: 2, xp: 120, planted: { 3: 9 }, found: [0, 1, 2, 3], log: [[3, 9, 20000]] };
  assert.equal((await post('/profile', { token: tok, data })).status, 204);
  const back = await (await post('/profile/get', { token: tok })).json();
  assert.deepEqual(back.data, data);
  assert.equal(back.linked, false);
  assert.equal((await post('/profile', { token: tok, data: 'junk' })).status, 400);
  assert.equal((await post('/profile', { token: 'short', data })).status, 400);
  assert.equal((await post('/profile', { token: tok, data: { ...data, log: Array.from({ length: 9000 }, () => [1, 1, 1]) } })).status, 413, 'a pouch is small');
  assert.deepEqual((await (await post('/profile/get', { token: 'Q'.repeat(43) })).json()).data, null, 'another device has its own');
  const fb = await post('/login/facebook', { token: tok, access_token: 'EAAB'.padEnd(60, 'x') });
  assert.ok([501, 403].includes(fb.status), `not set up here (501), or Facebook refuses the made-up token (403): ${fb.status}`);
  assert.equal((await post('/profile/delete', { token: tok })).status, 204);
  assert.equal((await (await post('/profile/get', { token: tok })).json()).data, null);
});
