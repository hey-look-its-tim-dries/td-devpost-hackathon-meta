// server/src/world.js
// The World: every laid Hand, in D1. One object, so two players laying Hands at the same moment are
// checked one after the other (spec 6.3). It also remembers which Rooms exist, to tell them of a lay.
import { DurableObject } from 'cloudflare:workers';
import { checkHand } from '../../src/world/mine.js';
import { overlaps, findFits } from '../../src/world/fit.js';
import { handShape } from '../../src/hand/shape.js';
import { unpackPalm, toB64, fromB64 } from '../../src/hand/dna.js';
import { cleanName } from '../../src/world/names.js';


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
    if (hand.name && !cleanName(hand.name)) return Response.json({ error: 'that name is not available' }, { status: 400 });
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
    const out = { id: hid, name: hand.name, palette: palm.palette, side: palm.side, palm: toB64(hand.palm), prints: hand.prints.map(toB64), pose: hand.pose, founder: false, placed_at: now };
    this.ctx.waitUntil(this.tell({ laid: out }));
    return Response.json({ id: hid, pose: hand.pose });
  }

  // "Wash your hands" for what exists in M3: the player and their Hand are deleted
  async wash(id, req) {
    let body;
    try { body = await req.json(); } catch { return Response.json({ error: 'bad json' }, { status: 400 }); }
    if (typeof body?.token !== 'string') return Response.json({ error: 'no token' }, { status: 400 });
    const pid = (await this.env.DB.prepare('select h.player_id from hand h join player p on p.id = h.player_id where h.id = ? and h.founder = 0 and p.token_hash = ?').bind(id, await sha(body.token)).first())?.player_id;
    if (!pid) return Response.json({ error: 'not yours' }, { status: 404 });
    await this.env.DB.batch([this.env.DB.prepare('delete from hand where player_id = ?').bind(pid), this.env.DB.prepare('delete from player where id = ?').bind(pid)]);
    this.cache = null;
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
