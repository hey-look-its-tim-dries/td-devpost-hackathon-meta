// server/src/world.js
// The World: every laid Hand, in D1. One object, so two players laying Hands at the same moment are
// checked one after the other (spec 6.3). It also remembers which Rooms exist, to tell them of a lay.
import { DurableObject } from 'cloudflare:workers';
import { checkHand } from '../../src/world/mine.js';

const PAIR_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', PAIR_TTL = 10 * 60 * 1000;
import { overlaps, findFits, confluences } from '../../src/world/fit.js';
import { handShape } from '../../src/hand/shape.js';
import { unpackPalm, toB64, fromB64 } from '../../src/hand/dna.js';
import { cleanName, HANDBIT_FEATURE, SUMMIT_FEATURE } from '../../src/world/names.js';
import { slotFor, isSealed } from '../../src/world/community.js';
import { toWorld } from '../../src/world/founders.js';


const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const ab = (u8) => u8.slice().buffer; // D1 binds blobs as ArrayBuffers
const row = (r) => {
  const prints = new Uint8Array(r.prints);
  return { id: r.id, name: r.name, palette: r.palette, side: r.side, palm: toB64(new Uint8Array(r.palm_dna)), prints: Array.from({ length: 5 }, (_, i) => toB64(prints.subarray(i * 44, i * 44 + 44))), pose: { x: r.x, z: r.z, rot: r.rot, mirror: false }, founder: !!r.founder, placed_at: r.placed_at };
};
const SELECT = 'select h.*, p.name, p.palette from hand h join player p on p.id = h.player_id';

export class World extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.lastByIp = new Map();
    this.cache = null; // { etag, body }
    this.rooms = new Set();
    this.counts = new Map(); // room name -> { n, at }: how many fly there, as the Room last said
    this.pairs = new Map(); // code -> { at, dna }: the pairing relay, in memory only, ten minutes (spec 10)
    this.chain = Promise.resolve(); // lays and washes, one at a time: D1 calls let other requests in while they wait
    ctx.blockConcurrencyWhile(async () => { this.rooms = new Set((await ctx.storage.get('rooms')) ?? []); });
  }

  async hands() {
    const { results } = await this.env.DB.prepare(`${SELECT} where h.placed_at is not null order by h.placed_at`).all();
    return results.map(row);
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/world') {
      if (!this.cache) { const hands = await this.hands(); this.cache = { etag: `"${hands.at(-1)?.placed_at ?? 0}-${hands.length}"`, body: JSON.stringify({ gen: 1, hands }) }; }
      if (req.headers.get('If-None-Match') === this.cache.etag) return new Response(null, { status: 304, headers: { ETag: this.cache.etag } });
      return new Response(this.cache.body, { headers: { ETag: this.cache.etag, 'Content-Type': 'application/json' } });
    }
    const del = url.pathname.match(/^\/hands\/([\w-]+)$/);
    if ((url.pathname === '/hands' && req.method === 'POST') || (del && req.method === 'DELETE')) {
      const out = this.chain.then(() => (del ? this.wash(del[1], req) : this.lay(req)));
      this.chain = out.catch(() => {});
      return out;
    }
    const pairM = url.pathname.match(/^\/pair(?:\/([A-Z2-9]{6}))?$/);
    if (pairM) return this.pair(req, pairM[1]);
    if (url.pathname === '/events' && req.method === 'GET') {
      const { results } = await this.env.DB.prepare('select id, at, kind, hand_id, data from event order by id desc limit 100').all();
      return Response.json({ events: results.map((e) => ({ ...e, data: JSON.parse(e.data ?? 'null') })) });
    }
    if (url.pathname === '/watersheds' && req.method === 'GET') {
      const { results } = await this.env.DB.prepare('select hand_a, hand_b from confluence').all();
      return Response.json({ pairs: results.map((r) => [r.hand_a, r.hand_b]) });
    }
    if (url.pathname === '/community' && req.method === 'GET') return Response.json(await this.community());
    if (url.pathname === '/community' && req.method === 'POST') { const out = this.chain.then(() => this.donate(req)); this.chain = out.catch(() => {}); return out; }
    if (url.pathname === '/names' && req.method === 'GET') {
      const { results } = await this.env.DB.prepare('select hand_id, feature, name from place_name').all();
      const names = {};
      for (const r of results) (names[r.hand_id] ??= {})[r.feature] = r.name;
      return Response.json({ names });
    }
    if (url.pathname === '/names' && req.method === 'POST') { const out = this.chain.then(() => this.nameIt(req)); this.chain = out.catch(() => {}); return out; }
    if (url.pathname === '/stats') {
      const now = Date.now();
      let flying = 0;
      for (const [k, c] of this.counts) { if (now - c.at > 30000) this.counts.delete(k); else flying += c.n; }
      const hands = this.cache ? JSON.parse(this.cache.body).hands.length : (await this.env.DB.prepare('select count(*) as n from hand where placed_at is not null').first()).n;
      return Response.json({ hands, flying });
    }
    if (url.pathname === '/rooms/count' && req.method === 'POST') {
      const { name, n } = await req.json().catch(() => ({}));
      if (typeof name === 'string' && Number.isInteger(n) && n >= 0 && n <= 200) this.counts.set(name.slice(0, 32), { n, at: Date.now() });
      return new Response(null, { status: 204 });
    }
    if (url.pathname === '/rooms' && req.method === 'POST') {
      const name = (await req.text()).slice(0, 32);
      if (!this.rooms.has(name)) { this.rooms.add(name); await this.ctx.storage.put('rooms', [...this.rooms]); }
      return new Response(null, { status: 204 });
    }
    return Response.json({ error: 'not found' }, { status: 404 });
  }

  // validate, one Hand per token, then the overlap check, then the rate limit, then keep it (pre-flight Ruling A)
  async lay(req) {
    let body;
    try { body = await req.json(); } catch { return Response.json({ error: 'bad json' }, { status: 400 }); }
    const token = typeof body?.token === 'string' && /^[A-Za-z0-9_-]{32,64}$/.test(body.token) ? body.token : null;
    const hand = checkHand(body);
    if (!token || !hand) return Response.json({ error: 'not a Hand' }, { status: 400 });
    const cleaned = cleanName(hand.name);
    if (!cleaned) return Response.json({ error: 'that name is not available' }, { status: 400 });
    hand.name = cleaned; // what is stored, served and drawn is the cleaned name (review finding 2)
    const tokenHash = await sha(token);
    const mine = await this.env.DB.prepare(`${SELECT} where p.token_hash = ?`).bind(tokenHash).first();
    if (mine) return Response.json(row(mine), { status: 409 }); // a retry, a lost answer, or a forgotten Hand: the one already there, whole
    const laid = await this.hands();
    const world = laid.map((h) => ({ pose: h.pose, shape: handShape(unpackPalm(fromB64(h.palm))), name: h.name }));
    const shape = handShape(unpackPalm(hand.palm));
    if (overlaps(world, shape, hand.pose)) {
      const fits = findFits(world, shape).map((f) => ({ ...f, names: f.next.map((i) => (i < 0 ? 'the Source' : world[i].name)) }));
      return Response.json({ conflict: true, fits });
    }
    const ip = req.headers.get('CF-Connecting-IP') ?? 'local', now = Date.now(), rate = Number(this.env.RATE_MS ?? 60000);
    if (now - (this.lastByIp.get(ip) ?? -Infinity) < rate) return Response.json({ error: 'one Hand a minute' }, { status: 429 });
    this.lastByIp.set(ip, now);
    const pid = crypto.randomUUID(), hid = crypto.randomUUID(), palm = unpackPalm(hand.palm), prints = Uint8Array.from(hand.prints.flatMap((p) => [...p]));
    await this.env.DB.batch([
      this.env.DB.prepare('insert into player (id, token_hash, created_at, name, palette) values (?, ?, ?, ?, ?)').bind(pid, tokenHash, now, hand.name, palm.palette),
      this.env.DB.prepare("insert into hand (id, player_id, side, palm_dna, prints, route, gen, x, z, rot, placed_at, founder) values (?, ?, ?, ?, ?, 'eye', 1, ?, ?, ?, ?, 0)").bind(hid, pid, palm.side, ab(hand.palm), ab(prints), hand.pose.x, hand.pose.z, hand.pose.rot, now),
    ]);
    this.cache = null;
    // the journal: who joined, beside whom, and whose rivers they now reach (watersheds)
    const meets = confluences(world, shape, hand.pose).map((i) => laid[i]);
    const ctr = toWorld(hand.pose, 0, 230), nextTo = laid.map((h) => [h.name, Math.hypot(...toWorld(h.pose, 0, 230).map((v, k) => v - ctr[k]))]).filter(([, d]) => d < 9000).sort((a, b) => a[1] - b[1]).slice(0, 2).map(([n]) => n); // the nearest one or two
    await this.event('laid', hid, { name: hand.name, next: nextTo });
    for (const h of meets) {
      await this.env.DB.prepare('insert or ignore into confluence (hand_a, hand_b, at) values (?, ?, ?)').bind(hid, h.id, now).run();
      await this.event('confluence', hid, { name: hand.name, with: h.name });
    }
    const out = { id: hid, name: hand.name, palette: palm.palette, side: palm.side, palm: toB64(hand.palm), prints: hand.prints.map(toB64), pose: hand.pose, founder: false, placed_at: now };
    this.ctx.waitUntil(this.tell({ laid: out }));
    return Response.json({ id: hid, pose: hand.pose });
  }

  // the pairing relay: nothing stored, nothing kept past ten minutes or past its one collection
  async pair(req, code) {
    const now = Date.now();
    for (const [k, v] of this.pairs) if (now - v.at > PAIR_TTL) this.pairs.delete(k);
    if (!code && req.method === 'POST') {
      // at most 10 codes a minute from one address (review finding 6)
      const ip = req.headers.get('CF-Connecting-IP') ?? 'local', mine = (this.pairsBy ??= new Map()).get(ip)?.filter((t) => now - t < 60000) ?? [];
      if (mine.length >= 10) return Response.json({ error: 'too many codes: wait a minute' }, { status: 429 });
      this.pairsBy.set(ip, [...mine, now]);
      if (this.pairsBy.size > 10000) this.pairsBy.clear();
      if (this.pairs.size > 5000) return Response.json({ error: 'busy' }, { status: 503 });
      let c;
      do { c = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => PAIR_ABC[b % PAIR_ABC.length]).join(''); } while (this.pairs.has(c));
      this.pairs.set(c, { at: now, dna: null });
      return Response.json({ code: c });
    }
    const p = code && this.pairs.get(code);
    if (!p) return Response.json({ error: 'no such code' }, { status: 404 });
    if (req.method === 'POST') {
      let b;
      try { b = await req.json(); } catch { return Response.json({ error: 'bad json' }, { status: 400 }); }
      const h = checkHand({ palm: b?.palm, prints: b?.prints, pose: { x: 0, z: 0, rot: 0 }, name: 'paired' });
      if (!h) return Response.json({ error: 'not a Hand' }, { status: 400 });
      p.dna = { palm: b.palm, prints: b.prints, name: cleanName(b.name ?? '') };
      return Response.json({ ok: true });
    }
    if (!p.dna) return new Response(null, { status: 204 });
    this.pairs.delete(code);
    return Response.json(p.dna);
  }

  async communityNo() { return (await this.ctx.storage.get('community')) ?? 1; }
  async community() {
    const no = await this.communityNo();
    const { results } = await this.env.DB.prepare('select slot, hand_id, code, palette from community_slot where community_no = ?').bind(no).all();
    return { no, sealed: no - 1, slots: results };
  }
  // one handbit of your own Hand into its slot of the Community Hand; the 22nd seals it (spec 6.4)
  async donate(req) {
    let b;
    try { b = await req.json(); } catch { return Response.json({ error: 'bad json' }, { status: 400 }); }
    const slot = slotFor(String(b?.code ?? ''));
    if (!slot || typeof b?.token !== 'string') return Response.json({ error: 'not a slot' }, { status: 400 });
    const me = await this.env.DB.prepare('select p.id as pid, h.id as hid, p.palette from player p join hand h on h.player_id = p.id where p.token_hash = ? and h.placed_at is not null').bind(await sha(b.token)).first();
    if (!me) return Response.json({ error: 'lay your Hand first' }, { status: 403 });
    const no = await this.communityNo();
    const r = await this.env.DB.prepare('insert or ignore into community_slot (community_no, slot, hand_id, player_id, code, palette, at) values (?, ?, ?, ?, ?, ?, ?)').bind(no, slot, me.hid, me.pid, slot, me.palette, Date.now()).run();
    if (!r.meta.changes) {
      const mine = await this.env.DB.prepare('select 1 from community_slot where community_no = ? and player_id = ?').bind(no, me.pid).first();
      return Response.json({ error: mine ? 'you have given to this one' : 'that slot is taken' }, { status: 409 });
    }
    await this.event('donated', me.hid, { no, slot, name: (await this.env.DB.prepare('select name from player where id = ?').bind(me.pid).first())?.name });
    const now = await this.community();
    if (isSealed(now.slots)) {
      await this.ctx.storage.put('community', no + 1);
      await this.event('sealed', null, { no });
      this.ctx.waitUntil(this.tell({ sealed: no }));
    } else this.ctx.waitUntil(this.tell({ donated: { no, slot, hand_id: me.hid, palette: me.palette } }));
    return Response.json({ no, slot });
  }
  async event(kind, handId, data) { await this.env.DB.prepare('insert into event (at, kind, hand_id, data) values (?, ?, ?, ?)').bind(Date.now(), kind, handId, JSON.stringify(data ?? null)).run(); }

  // a name for a place: handbits by the Hand's owner, summits by anyone with a Hand, first come (spec 6.4)
  async nameIt(req) {
    let b;
    try { b = await req.json(); } catch { return Response.json({ error: 'bad json' }, { status: 400 }); }
    const name = cleanName(b?.name), feature = String(b?.feature ?? ''), handId = String(b?.hand_id ?? '').slice(0, 64);
    if (!name || !(HANDBIT_FEATURE.test(feature) || SUMMIT_FEATURE.test(feature)) || typeof b?.token !== 'string') return Response.json({ error: 'that name is not available' }, { status: 400 });
    const me = await this.env.DB.prepare('select id from player where token_hash = ?').bind(await sha(b.token)).first();
    if (!me) return Response.json({ error: 'lay your Hand first' }, { status: 403 });
    const hand = await this.env.DB.prepare('select player_id from hand where id = ? and placed_at is not null').bind(handId).first();
    if (!hand) return Response.json({ error: 'no such Hand' }, { status: 404 });
    if (HANDBIT_FEATURE.test(feature)) {
      if (hand.player_id !== me.id) return Response.json({ error: 'only its owner names a handbit' }, { status: 403 });
      const first = !(await this.env.DB.prepare('select 1 from place_name where hand_id = ? and feature = ?').bind(handId, feature).first());
      await this.env.DB.prepare('insert or replace into place_name (hand_id, feature, name, by_player, at) values (?, ?, ?, ?, ?)').bind(handId, feature, name, me.id, Date.now()).run();
      if (first) await this.event('named', handId, { name, hand: (await this.env.DB.prepare('select p.name from hand h join player p on p.id = h.player_id where h.id = ?').bind(handId).first())?.name });
    } else {
      const r = await this.env.DB.prepare('insert or ignore into place_name (hand_id, feature, name, by_player, at) values (?, ?, ?, ?, ?)').bind(handId, feature, name, me.id, Date.now()).run();
      if (!r.meta.changes) return Response.json({ error: 'already named' }, { status: 409 });
      await this.event('named', handId, { name, hand: (await this.env.DB.prepare('select p.name from hand h join player p on p.id = h.player_id where h.id = ?').bind(handId).first())?.name });
    }
    return Response.json({ ok: true });
  }

  // "Wash your hands" for what exists in M3: the player and their Hand are deleted
  async wash(id, req) {
    let body;
    try { body = await req.json(); } catch { return Response.json({ error: 'bad json' }, { status: 400 }); }
    if (typeof body?.token !== 'string') return Response.json({ error: 'no token' }, { status: 400 });
    const who = await this.env.DB.prepare('select h.player_id, p.name from hand h join player p on p.id = h.player_id where h.id = ? and h.founder = 0 and p.token_hash = ?').bind(id, await sha(body.token)).first(), pid = who?.player_id;
    if (!pid) return Response.json({ error: 'not yours' }, { status: 404 });
    await this.env.DB.batch([this.env.DB.prepare('delete from place_name where hand_id = ? or by_player = ?').bind(id, pid), this.env.DB.prepare('delete from community_slot where player_id = ?').bind(pid), this.env.DB.prepare('delete from confluence where hand_a = ? or hand_b = ?').bind(id, id), this.env.DB.prepare('delete from event where hand_id = ? and kind != ?').bind(id, 'sealed'), this.env.DB.prepare('delete from hand where player_id = ?').bind(pid), this.env.DB.prepare('delete from player where id = ?').bind(pid)]);
    this.cache = null;
    // the journal keeps only that someone left: their name goes from every line that carried it (spec 8.5, review finding 5)
    if (who.name) await this.env.DB.prepare('update event set data = replace(data, ?, ?) where instr(data, ?) > 0').bind(JSON.stringify(who.name), JSON.stringify('a Hand that left'), JSON.stringify(who.name)).run();
    await this.event('washed', null, { name: 'Someone' });
    this.ctx.waitUntil(this.tell({ left: id }));
    return new Response(null, { status: 204 });
  }

  // every known Room hears of a lay or a wash; a Room that fails twice is forgotten
  async tell(event) {
    const text = JSON.stringify(event);
    let forgot = false;
    await Promise.all([...this.rooms].map(async (name) => {
      const stub = this.env.ROOM.get(this.env.ROOM.idFromName(name));
      for (let i = 0; i < 2; i++) { try { if ((await stub.fetch(new Request('https://room/event', { method: 'POST', body: text }))).ok) return; } catch {} }
      this.rooms.delete(name);
      forgot = true;
    }));
    if (forgot) await this.ctx.storage.put('rooms', [...this.rooms]);
  }
}
