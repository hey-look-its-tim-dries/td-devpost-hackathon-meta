// tests/net.test.mjs: the pure parts of the client's network layer, with a stub fetch
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNet, rowToHand, settleLay } from '../src/net.js';
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
  assert.equal((await mk(409, row(founders()[0], 'y')).layHand(h)).id, 'hy', 'a 409 is the Hand already on the map');
  assert.equal((await mk(200, { conflict: true, fits: [] }).layHand(h)).conflict, true);
  assert.equal((await mk(400, { error: 'not a Hand' }).layHand(h)).error, 'not a Hand');
  assert.equal((await createNet({ storage: memory(), fetchFn: async () => { throw new Error('down'); } }).layHand(h)).error, 'offline');
});

test('rowToHand carries exactly what main.js bakes with', () => {
  const h = rowToHand(row(founders()[1], 1));
  assert.deepEqual(Object.keys(h).sort(), ['founder', 'id', 'name', 'palm', 'placed_at', 'pose', 'prints']); // placed_at: the atlas timeline
});

test('a world whose body stalls after the headers still falls back in time (final review 8, Review Focus 3)', async () => {
  const net = createNet({ storage: memory(), timeout: 50, fetchFn: async () => new Response(new ReadableStream({ start() {} })) });
  const t = performance.now(), w = await net.fetchWorld();
  assert.equal(w.online, false);
  assert.ok(performance.now() - t < 1000);
});

const answers = (...list) => { let k = 0; return async () => { const [status, body] = list[Math.min(k++, list.length - 1)]; return new Response(JSON.stringify(body), { status }); }; };
const f0 = founders()[0], mineHand = { id: 'local-1', palm: f0.palm, prints: f0.prints, pose: { x: 1, z: 2, rot: 0, mirror: false }, name: 'Pendo', pending: true };

test('settleLay: laid, or adopted, or moved to a fresh fit, or still pending (final review 1 and 2)', async () => {
  const at = (fetchFn) => settleLay(createNet({ storage: memory(), fetchFn }), mineHand);
  let r = await at(answers([200, { id: 's1', pose: mineHand.pose }]));
  assert.deepEqual([r.note, r.hand.id, r.hand.pending], ['joined', 's1', false]);
  const old = row(founders()[2], 9);
  r = await at(answers([409, old]));
  assert.deepEqual([r.note, r.hand.id, r.hand.name, r.hand.pending], ['existing', 'h9', 'Oru', false]);
  assert.deepEqual([...r.hand.palm], [...founders()[2].palm], 'the server\'s Hand, not the one this device drew');
  const fit = { pose: { x: 5000, z: 6000, rot: 1, mirror: false } };
  r = await at(answers([200, { conflict: true, fits: [fit] }], [200, { id: 's2', pose: fit.pose }]));
  assert.deepEqual([r.note, r.hand.id, r.hand.pose.x, r.hand.pending], ['moved', 's2', 5000, false]);
  r = await at(answers([200, { conflict: true, fits: [fit] }], [200, { conflict: true, fits: [] }]));
  assert.deepEqual([r.note, r.hand.pose.x, r.hand.pending], ['pending', 5000, true], 'waits at the free place it was offered');
  r = await at(async () => { throw new Error('down'); });
  assert.deepEqual([r.note, r.hand.id, r.hand.pending], ['pending', 'local-1', true]);
});

test('a 409 hands back the server\'s whole Hand', async () => {
  const r = await createNet({ storage: memory(), fetchFn: answers([409, row(founders()[2], 9)]) }).layHand(mineHand);
  assert.equal(r.existing, true);
  assert.equal(r.name, 'Oru');
  assert.equal(r.prints.length, 5);
});

test('stats: the counts from the map, null when it is away (Review Focus 1)', async () => {
  const on = createNet({ storage: memory(), fetchFn: async () => new Response(JSON.stringify({ hands: 12, flying: 3 })) });
  assert.deepEqual(await on.stats(), { hands: 12, flying: 3 });
  const off = createNet({ storage: memory(), fetchFn: async () => { throw new Error('down'); } });
  assert.equal(await off.stats(), null);
  const junk = createNet({ storage: memory(), fetchFn: async () => new Response('{"hands":"x"}') });
  assert.equal(await junk.stats(), null);
});

test('names: a map of Hands to their named places; empty when the map is away; naming says why it failed', async () => {
  const on = createNet({ storage: memory(), fetchFn: async () => new Response(JSON.stringify({ names: { h1: { I1: 'Oru Vale' } } })) });
  assert.deepEqual(await on.names(), { h1: { I1: 'Oru Vale' } });
  const off = createNet({ storage: memory(), fetchFn: async () => { throw new Error('down'); } });
  assert.deepEqual(await off.names(), {});
  assert.deepEqual(await off.nameIt({ handId: 'h1', feature: 'I1', name: 'X' }), { error: 'offline' });
  const taken = createNet({ storage: memory(), fetchFn: async () => new Response(JSON.stringify({ error: 'already named' }), { status: 409 }) });
  assert.deepEqual(await taken.nameIt({ handId: 'h1', feature: 'summit:0', name: 'X' }), { error: 'already named' });
});

test('community: the current Community Hand, null offline; donating says why it failed', async () => {
  const c = { no: 2, sealed: 1, slots: [{ slot: 'I1', hand_id: 'h', code: 'I1', palette: 3 }] };
  assert.deepEqual(await createNet({ storage: memory(), fetchFn: async () => new Response(JSON.stringify(c)) }).community(), c);
  const off = createNet({ storage: memory(), fetchFn: async () => { throw new Error('down'); } });
  assert.equal(await off.community(), null);
  assert.deepEqual(await off.donate('I1'), { error: 'offline' });
});

test('events and watersheds: lists from the map, null and [] when it is away', async () => {
  const on = createNet({ storage: memory(), fetchFn: async (u) => new Response(JSON.stringify(u.includes('/events') ? { events: [{ id: 1, at: 5, kind: 'sealed', data: { no: 1 } }] } : { pairs: [['a', 'b']] })) });
  assert.equal((await on.events()).length, 1);
  assert.deepEqual(await on.watersheds(), [['a', 'b']]);
  const off = createNet({ storage: memory(), fetchFn: async () => { throw new Error('down'); } });
  assert.equal(await off.events(), null);
  assert.deepEqual(await off.watersheds(), []);
});

test('a Hand from the map keeps when it was laid (the timeline needs it)', () => {
  const f = founders()[0];
  assert.equal(rowToHand(row(f, 7)).placed_at, 7);
});

test('pairing: a code from the map; the headset waits (204) until the phone has sent its DNA', async () => {
  const f = founders()[0];
  let polls = 0;
  const fetchFn = async (url, init) => {
    if (url.endsWith('/pair') && init?.method === 'POST') return new Response(JSON.stringify({ code: 'ABC234' }));
    if (url.endsWith('/pair/ABC234') && !init?.method) return ++polls < 3 ? new Response(null, { status: 204 }) : new Response(JSON.stringify({ palm: toB64(f.palm), prints: f.prints.map(toB64), name: 'Oru' }));
    return new Response('{}', { status: 404 });
  };
  const net = createNet({ storage: memory(), fetchFn });
  assert.deepEqual(await net.pair(), { code: 'ABC234' });
  const got = await net.waitPair('ABC234', { every: 5 });
  assert.equal(polls, 3);
  assert.deepEqual([...got.palm], [...f.palm]);
  assert.equal(got.prints.length, 5);
  assert.equal(got.name, 'Oru');
  const off = createNet({ storage: memory(), fetchFn: async () => { throw new Error('down'); } });
  assert.equal(await off.pair(), null);
  const ctl = new AbortController();
  const waiting = off.waitPair('ZZZZZZ', { every: 5, signal: ctl.signal });
  ctl.abort();
  assert.equal(await waiting, null, 'stops when the headset gives up');
});

test('a world that is slow to answer once is asked again before the game gives up on it', async () => {
  const rows = (await createNet({ storage: memory(), fetchFn: async () => { throw new Error('down'); } }).fetchWorld()).hands.map((h) => ({ id: h.id, name: h.name, palette: 2, side: 'R', palm: Buffer.from(h.palm).toString('base64url'), prints: h.prints.map((p) => Buffer.from(p).toString('base64url')), pose: h.pose, founder: true, placed_at: 1 }));
  let asked = 0;
  const net = createNet({ storage: memory(), timeout: 50, fetchFn: () => (++asked === 1 ? new Promise(() => {}) : Promise.resolve(new Response(JSON.stringify({ gen: 1, hands: rows })))) });
  const w = await net.fetchWorld();
  assert.equal(w.online, true, 'the second try reached it');
  assert.equal(asked, 2);
  let never = 0;
  const gone = await createNet({ storage: memory(), timeout: 30, fetchFn: () => { never++; return new Promise(() => {}); } }).fetchWorld();
  assert.equal(gone.online, false);
  assert.equal(never, 3, 'three tries, then the bundled founders');
});
