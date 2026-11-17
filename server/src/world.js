// server/src/world.js
// The World: every laid Hand, in D1. One object, so two players laying Hands at the same moment are
// checked one after the other (spec 6.3). It also remembers which Rooms exist, to tell them of a lay.
import { DurableObject } from 'cloudflare:workers';
import { checkHand } from '../../src/world/mine.js';

const PAIR_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', PAIR_TTL = 10 * 60 * 1000, SUMMITS_EACH = 5;
const TOKEN = /^[A-Za-z0-9_-]{32,64}$/, HABS = ['dune', 'bank', 'ridge'], PLOT_UNITS = 400, TEND_MS = 1000, DEAD_MS = 96 * 3600e3; // ponytail: TEND_MS is short so a garden grows in one sitting; raise it when gardens should take days
import { overlaps, findFits, confluences } from '../../src/world/fit.js';
import { handShape } from '../../src/hand/shape.js';
import { unpackPalm, toB64, fromB64 } from '../../src/hand/dna.js';
import { cleanName, HANDBIT_FEATURE, SUMMIT_FEATURE } from '../../src/world/names.js';
import { verifyFacebook } from '../../src/net/facebook.js';
import { verifyGoogle, cleanPicture } from '../../src/net/google.js';
import { afterQuest, afterAnnoy } from '../../src/gnomes/gnomes.js';
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
    this.recent = null; // the latest 100 events, kept here: /events is polled every few seconds by every player, a query each time cost a million row reads a day
    this.memos = new Map(); // key -> { at, v }: boards and counts every player asks for, computed once a little while, not once a call
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
      if (!this.cache) { const hands = await this.hands(); this.cache = { etag: `"${hands.at(-1)?.placed_at ?? 0}-${hands.length}"`, body: JSON.stringify({ gen: 1, hands }), n: hands.length }; }
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
      const since = Math.max(0, Number.parseInt(url.searchParams.get('since') ?? '0', 10) || 0);
      this.recent ??= (await this.env.DB.prepare('select id, at, kind, hand_id, data from event order by id desc limit 100').all()).results;
      const results = this.recent.filter((e) => e.id > since);
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
    // the garden (Bloom): groves on the Hands, watered by anyone, and the golden seed
    if (url.pathname === '/plants' && req.method === 'GET') {
      // the garden is read Hand by Hand (?hand=): a Hand holds at most 34 plots of 400 units, so an answer is bounded
      // however large the world grows. ?top: only the gardeners' board. Neither: everything, up to 60000 (small worlds, tests)
      const one = url.searchParams.get('hand'), cols = 'select id, hand_id, bit, x, y, sp, stage, tended, big, hab from plant';
      const { results } = url.searchParams.has('top') ? { results: [] } : one ? await this.env.DB.prepare(`${cols} where hand_id = ? order by id`).bind(one.slice(0, 64)).all() : await this.env.DB.prepare(`${cols} order by id limit 60000`).all();
      if (one) return Response.json({ plants: results.map((r) => [r.id, r.hand_id, r.bit, r.x, r.y, r.sp, r.stage, r.tended, r.big, r.hab]) });
      const top = await this.memo('top-gardeners', 300000, () => this.env.DB.prepare("select coalesce(p.name, 'A traveller') as name, count(*) as n from plant q left join player p on p.token_hash = q.by_hash group by q.by_hash order by n desc limit 5").all());
      return Response.json({ plants: results.map((r) => [r.id, r.hand_id, r.bit, r.x, r.y, r.sp, r.stage, r.tended, r.big, r.hab]), top: top.results });
    }
    const plantM = url.pathname.match(/^\/plants(?:\/(\d{1,12})(\/tend)?)?$/);
    if (plantM && req.method !== 'GET') { const out = this.chain.then(() => (!plantM[1] ? this.plant(req) : plantM[2] ? this.tend(+plantM[1], req) : this.uproot(+plantM[1], req))); this.chain = out.catch(() => {}); return out; }
    if (url.pathname === '/golden' && req.method === 'POST') return this.golden(req);
    // gnomes: whose team each is on (a gnome is the id of the mushroom grove it lives in), and who converted most
    if (url.pathname === '/gnomes' && req.method === 'GET') {
      const { results } = await this.env.DB.prepare("select g.id, g.owner_hash, coalesce(p.name, 'A traveller') as name, g.loyalty from gnome g left join player p on p.token_hash = g.owner_hash limit 20000").all();
      const top = await this.memo('top-converters', 10000, () => this.env.DB.prepare("select coalesce(p.name, 'A traveller') as name, s.converted as n from gnome_score s left join player p on p.token_hash = s.token_hash where s.converted > 0 order by s.converted desc limit 5").all());
      return Response.json({ gnomes: results.map((r) => [r.id, r.owner_hash.slice(0, 12), r.name, r.loyalty]), top: top.results });
    }
    const gnomeM = url.pathname.match(/^\/gnomes\/(me|\d{1,12})(?:\/(quest|annoy))?$/);
    if (gnomeM && req.method === 'POST') { const out = this.chain.then(() => this.gnome(gnomeM[1], gnomeM[2], req)); this.chain = out.catch(() => {}); return out; }
    if ((url.pathname.startsWith('/profile') || url.pathname === '/login/facebook' || url.pathname === '/login/google') && req.method === 'POST') return this.profile(url.pathname, req);
    if (url.pathname === '/avatars' && req.method === 'GET') { // the pictures of signed-in players who have a name (a Hand), by that name
      const { results } = await this.memo('avatars', 30000, () => this.env.DB.prepare('select p.name as name, a.url as url from avatar a join player p on p.token_hash = a.token_hash where p.name is not null order by a.at desc limit 500').all());
      return Response.json({ avatars: results.map((r) => [r.name, r.url]) });
    }
    if (url.pathname === '/stats') {
      const now = Date.now();
      let flying = 0;
      for (const [k, c] of this.counts) { if (now - c.at > 30000) this.counts.delete(k); else flying += c.n; }
      const hands = this.cache ? this.cache.n : (await this.env.DB.prepare('select count(*) as n from hand where placed_at is not null').first()).n;
      const plants = (await this.memo('plant-count', 600000, () => this.env.DB.prepare('select count(*) as n from plant').first())).n;
      return Response.json({ hands, flying, plants });
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
    try { // the Hand is laid: a journal that fails to write must not turn that into an error
      await this.event('laid', hid, { name: hand.name, next: nextTo });
      for (const h of meets) {
        await this.env.DB.prepare('insert or ignore into confluence (hand_a, hand_b, at) values (?, ?, ?)').bind(hid, h.id, now).run();
        await this.event('confluence', hid, { name: hand.name, with: h.name });
      }
    } catch (e) { console.error('journal', e); }
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
  // ---- the garden ----
  async body(req) { try { const b = await req.json(); return TOKEN.test(b?.token ?? '') ? b : null; } catch { return null; } }
  // a grove on a handbit: any device may plant. A plot holds 400 units: a grove (or a double) is 5, a sprig
  // (big = 2: one plant, from a hyper sow) is 1. One at a time, a few a second; or up to 40 in a batch.
  async plant(req) {
    const b = await this.body(req), num = (v, lim) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;
    const ok = (q) => q && typeof q.hand_id === 'string' && Number.isInteger(q.bit) && q.bit >= 0 && q.bit <= 33 && num(q.x, 3000) && num(q.y, 3000) && Number.isInteger(q.sp) && q.sp >= 0 && q.sp < 65533 && HABS.includes(q.hab);
    const many = Array.isArray(b?.batch), list = many ? b.batch : [b];
    if (!b || !list.length || list.length > 40 || !list.every(ok)) return Response.json({ error: 'not a grove' }, { status: 400 });
    const names = new Map();
    for (const id of new Set(list.map((q) => q.hand_id.slice(0, 64)))) {
      const hand = await this.env.DB.prepare('select p.name from hand h join player p on p.id = h.player_id where h.id = ? and h.placed_at is not null').bind(id).first();
      if (!hand) return Response.json({ error: 'no such Hand' }, { status: 404 });
      names.set(id, hand.name);
    }
    const by = await sha(b.token), now = Date.now(), gap = Number(this.env.RATE_MS ?? 60000) === 0 ? 0 : many ? 500 : 250;
    if (now - ((this.plantAt ??= new Map()).get(by) ?? -Infinity) < gap) return Response.json({ error: 'slower' }, { status: 429 });
    this.plantAt.set(by, now);
    if (this.plantAt.size > 20000) this.plantAt.clear();
    const room = new Map(), fits = []; // "hand:bit" -> { units, n } as this request fills it
    for (const q of list) {
      const k = `${q.hand_id}:${q.bit}`, big = q.big === 2 ? 2 : q.big ? 1 : 0, cost = big === 2 ? 1 : 5;
      if (!room.has(k)) { const r = await this.env.DB.prepare('select coalesce(sum(case when big = 2 then 1 else 5 end), 0) as units, count(*) as n from plant where hand_id = ? and bit = ?').bind(q.hand_id, q.bit).first(); room.set(k, { units: r.units, n: r.n, was: r.n }); }
      const pl = room.get(k), fit = pl.units + cost <= PLOT_UNITS;
      if (fit) { pl.units += cost; pl.n++; }
      fits.push(fit ? { ...q, big } : null);
    }
    const put = fits.filter(Boolean);
    if (!put.length) return Response.json(many ? { ids: fits.map(() => null) } : { error: 'full' }, { status: many ? 200 : 409 });
    const done = await this.env.DB.batch(put.map((q) => this.env.DB.prepare('insert into plant (hand_id, bit, x, y, sp, stage, tended, big, hab, by_hash, at) values (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)').bind(q.hand_id, q.bit, q.x, q.y, q.sp, now, q.big, q.hab, by, now)));
    put.forEach((q, i) => { q.id = done[i].meta.last_row_id; });
    const rows = put.map((q) => [q.id, q.hand_id, q.bit, q.x, q.y, q.sp, 0, now, q.big, q.hab]), bloomed = [];
    for (const [k, pl] of room) if (pl.was < 30 && pl.n >= 30) { const i = k.lastIndexOf(':'), hand_id = k.slice(0, i), bit = +k.slice(i + 1); bloomed.push({ hand: names.get(hand_id), hand_id, bit }); try { await this.event('bloomed', hand_id, { hand: names.get(hand_id), bit }); } catch (e) { console.error('journal', e); } }
    this.ctx.waitUntil(this.tell({ ...(many ? { plantedMany: rows } : { planted: rows[0] }), ...(bloomed.length ? { bloomed: bloomed[0] } : {}) }));
    return Response.json(many ? { ids: fits.map((q) => q?.id ?? null), tended: now } : { id: put[0].id, tended: now });
  }
  // water: anyone, a stage up (to 3) and fresh again; a grove takes water once in a while
  async tend(id, req) {
    const b = await this.body(req);
    if (!b) return Response.json({ error: 'no token' }, { status: 400 });
    const p = await this.env.DB.prepare('select stage, tended from plant where id = ?').bind(id).first();
    if (!p) return Response.json({ error: 'gone' }, { status: 404 });
    const now = Date.now();
    if (now - p.tended < TEND_MS) return Response.json({ error: 'it has had its water' }, { status: 429 });
    const stage = Math.min(3, p.stage + 1);
    await this.env.DB.prepare('update plant set stage = ?, tended = ? where id = ?').bind(stage, now, id).run();
    this.ctx.waitUntil(this.tell({ tended: [id, stage, now] }));
    return Response.json({ stage, tended: now });
  }
  // uproot: whoever planted it, the owner of the Hand it stands on, or anyone once it is dead
  async uproot(id, req) {
    const b = await this.body(req);
    if (!b) return Response.json({ error: 'no token' }, { status: 400 });
    const p = await this.env.DB.prepare('select q.by_hash, q.tended, pl.token_hash as owner from plant q left join hand h on h.id = q.hand_id left join player pl on pl.id = h.player_id where q.id = ?').bind(id).first();
    if (!p) return Response.json({ error: 'gone' }, { status: 404 });
    const by = await sha(b.token);
    if (p.by_hash !== by && p.owner !== by && Date.now() - p.tended <= DEAD_MS) return Response.json({ error: 'not yours to clear' }, { status: 403 });
    await this.env.DB.prepare('delete from plant where id = ?').bind(id).run();
    this.ctx.waitUntil(this.tell({ uprooted: id }));
    return new Response(null, { status: 204 });
  }
  // the golden seed of this round (drift.js: one every four minutes): the first claim wins it
  async golden(req) {
    const b = await this.body(req), epoch = Math.floor(Date.now() / 240000);
    if (!b || b.epoch !== epoch) return Response.json({ error: 'not this round' }, { status: 400 });
    const held = (this.gold ??= new Map()).get(epoch);
    if (held) return Response.json({ won: false, name: held });
    const name = (await this.env.DB.prepare('select name from player where token_hash = ?').bind(await sha(b.token)).first())?.name ?? 'A traveller';
    this.gold.set(epoch, name);
    for (const k of this.gold.keys()) if (k < epoch - 2) this.gold.delete(k);
    try { await this.event('golden', null, { name }); } catch (e) { console.error('journal', e); }
    this.ctx.waitUntil(this.tell({ golden: { epoch, name } }));
    return Response.json({ won: true, name });
  }

  // ---- gnome teams (rules in src/gnomes/gnomes.js): a quest done for a gnome, or a gnome annoyed ----
  async gnome(which, what, req) {
    const b = await this.body(req);
    if (!b) return Response.json({ error: 'no token' }, { status: 400 });
    const me = await sha(b.token), score = async () => (await this.env.DB.prepare('select converted from gnome_score where token_hash = ?').bind(me).first())?.converted ?? 0;
    const team = async () => (await this.env.DB.prepare('select count(*) as n from gnome where owner_hash = ?').bind(me).first()).n;
    if (which === 'me') return Response.json({ tag: me.slice(0, 12), converted: await score(), team: await team() });
    if (!what) return Response.json({ error: 'not found' }, { status: 404 });
    const id = +which, now = Date.now(), key = `${what}:${me}:${id}`, gap = what === 'quest' ? 60000 : 20000;
    if (now - ((this.gnomeAt ??= new Map()).get(key) ?? -Infinity) < gap) return Response.json({ error: what === 'quest' ? 'it is still telling everyone about the last one' : 'it is already cross' }, { status: 429 });
    this.gnomeAt.set(key, now);
    if (this.gnomeAt.size > 20000) this.gnomeAt.clear();
    const row = await this.env.DB.prepare('select owner_hash, loyalty from gnome where id = ?').bind(id).first();
    const next = (what === 'quest' ? afterQuest : afterAnnoy)(row ? { owner: row.owner_hash, loyalty: row.loyalty } : null, me);
    if (!next.owner) await this.env.DB.prepare('delete from gnome where id = ?').bind(id).run();
    else await this.env.DB.prepare('insert into gnome (id, owner_hash, loyalty, at) values (?, ?, ?, ?) on conflict (id) do update set owner_hash = excluded.owner_hash, loyalty = excluded.loyalty, at = excluded.at').bind(id, next.owner, next.loyalty, now).run();
    if (next.event === 'converted') await this.env.DB.prepare('insert into gnome_score (token_hash, converted) values (?, 1) on conflict (token_hash) do update set converted = converted + 1').bind(me).run();
    const name = next.owner ? (await this.env.DB.prepare('select name from player where token_hash = ?').bind(next.owner).first())?.name ?? 'A traveller' : null;
    if (next.event === 'converted') { try { await this.event('gnome', null, { name }); } catch (e) { console.error('journal', e); } }
    this.ctx.waitUntil(this.tell({ gnome: [id, next.owner ? next.owner.slice(0, 12) : null, name, next.loyalty, next.event] }));
    return Response.json({ event: next.event, tag: next.owner ? next.owner.slice(0, 12) : null, loyalty: next.loyalty, converted: await score(), team: await team() });
  }

  // the same answer for `ttl` ms: the leaderboards, the avatars and the planted count are asked for by every player
  // every couple of minutes, and each is a scan of a table that only grows
  async memo(key, ttl, fn) {
    const hit = this.memos.get(key), now = Date.now();
    if (hit && now - hit.at < ttl) return hit.v;
    const v = await fn();
    this.memos.set(key, { at: now, v });
    return v;
  }

  // ---- profiles: a gardener's pouch (seeds, herbarium, sowing log) kept on the map ----
  // Every device has one, under the hash of its token. Signing in with Facebook links the device to an account
  // (the hash of the app-scoped user id: no name, no e-mail is asked for or kept), so every device signed in to
  // it shares one pouch. /profile/delete forgets the pouch and the link.
  async profile(path, req) {
    const b = await this.body(req);
    if (!b) return Response.json({ error: 'no token' }, { status: 400 });
    const dev = await sha(b.token), link = await this.env.DB.prepare('select account from account where token_hash = ?').bind(dev).first(), id = link?.account ?? `dev:${dev}`;
    const read = async (key) => { const r = await this.env.DB.prepare('select data from profile where id = ?').bind(key).first(); try { return r ? JSON.parse(r.data) : null; } catch { return null; } };
    if (path === '/profile/get') return Response.json({ data: await read(id), linked: !!link });
    if (path === '/profile/delete') {
      await this.env.DB.batch([this.env.DB.prepare('delete from profile where id = ? or id = ?').bind(id, `dev:${dev}`), this.env.DB.prepare('delete from account where token_hash = ?').bind(dev), this.env.DB.prepare('delete from avatar where token_hash = ?').bind(dev)]);
      return new Response(null, { status: 204 });
    }
    if (path === '/profile') {
      const d = b.data;
      if (!d || typeof d !== 'object' || Array.isArray(d) || typeof d.seeds !== 'object' || !Array.isArray(d.found) || !Array.isArray(d.log) || !Number.isFinite(d.xp)) return Response.json({ error: 'not a pouch' }, { status: 400 });
      const text = JSON.stringify({ seeds: d.seeds, sel: d.sel, water: d.water, xp: d.xp, planted: d.planted, found: d.found, log: d.log });
      if (text.length > 24000) return Response.json({ error: 'too big' }, { status: 413 });
      await this.env.DB.prepare('insert into profile (id, data, updated) values (?, ?, ?) on conflict (id) do update set data = excluded.data, updated = excluded.updated').bind(id, text, Date.now()).run();
      return new Response(null, { status: 204 });
    }
    if (path === '/login/facebook' || path === '/login/google') { // only a hash of the provider's own user id is kept: no name, no e-mail
      const g = path === '/login/google', who = g ? 'Google' : 'Facebook';
      if (g ? !this.env.GOOGLE_CLIENT_ID : !this.env.FB_APP_ID || !this.env.FB_APP_SECRET) return Response.json({ error: `${who} login is not set up on this map` }, { status: 501 });
      const seen = g ? await verifyGoogle(fetch, this.env.GOOGLE_CLIENT_ID, b.id_token) : await verifyFacebook(fetch, this.env.FB_APP_ID, this.env.FB_APP_SECRET, b.access_token);
      const user = g ? seen?.id : seen, picture = g ? cleanPicture(seen?.picture) : null;
      if (!user) return Response.json({ error: `${who} did not vouch for that sign-in` }, { status: 403 });
      const tag = g ? 'g' : 'fb', account = `${tag}:${await sha(`${tag}:${user}`)}`, mine = await read(`dev:${dev}`), theirs = await read(account);
      await this.env.DB.prepare('insert into account (token_hash, account, at) values (?, ?, ?) on conflict (token_hash) do update set account = excluded.account, at = excluded.at').bind(dev, account, Date.now()).run();
      // the first sign-in brings this device's pouch along; later ones find the account's own (the client keeps the richer)
      if (!theirs && mine) await this.env.DB.prepare('insert or ignore into profile (id, data, updated) values (?, ?, ?)').bind(account, JSON.stringify(mine), Date.now()).run();
      if (picture) await this.env.DB.prepare('insert into avatar (token_hash, url, at) values (?, ?, ?) on conflict (token_hash) do update set url = excluded.url, at = excluded.at').bind(dev, picture, Date.now()).run(); // shown beside your name
      return Response.json({ ok: true, data: theirs ?? mine, picture });
    }
    return Response.json({ error: 'not found' }, { status: 404 });
  }

  async event(kind, handId, data) {
    const at = Date.now(), json = JSON.stringify(data ?? null);
    const r = await this.env.DB.prepare('insert into event (at, kind, hand_id, data) values (?, ?, ?, ?)').bind(at, kind, handId, json).run();
    if (this.recent) this.recent = [{ id: r.meta.last_row_id, at, kind, hand_id: handId, data: json }, ...this.recent].slice(0, 100);
  }

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
      const mineN = (await this.env.DB.prepare("select count(*) as n from place_name where by_player = ? and feature like 'summit:%'").bind(me.id).first()).n;
      if (mineN >= SUMMITS_EACH) return Response.json({ error: `${SUMMITS_EACH} summits each: leave some for others` }, { status: 429 });
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
    await this.env.DB.batch([this.env.DB.prepare('delete from plant where hand_id = ?').bind(id), this.env.DB.prepare('delete from place_name where hand_id = ? or by_player = ?').bind(id, pid), this.env.DB.prepare('delete from community_slot where player_id = ?').bind(pid), this.env.DB.prepare('delete from confluence where hand_a = ? or hand_b = ?').bind(id, id), this.env.DB.prepare('delete from event where hand_id = ? and kind != ?').bind(id, 'sealed'), this.env.DB.prepare('delete from hand where player_id = ?').bind(pid), this.env.DB.prepare('delete from player where id = ?').bind(pid)]);
    this.cache = null;
    // the journal keeps only that someone left: their name goes from every line that carried it (spec 8.5, review finding 5)
    if (who.name) await this.env.DB.prepare('update event set data = replace(data, ?, ?) where instr(data, ?) > 0').bind(JSON.stringify(who.name), JSON.stringify('a Hand that left'), JSON.stringify(who.name)).run();
    this.recent = null; // names in the news changed: read them again
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
