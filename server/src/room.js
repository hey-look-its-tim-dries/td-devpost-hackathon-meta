// server/src/room.js
// A live room: up to 200 players' poses, 5 Hz in, one snapshot out at most every 250 ms, and the
// World's lay events relayed as text. Hibernatable sockets, so an empty room costs nothing. Nothing
// here is stored; ids are per-room session numbers.
import { DurableObject } from 'cloudflare:workers';
import { encodeSnapshot, decodePose, POSE_BYTES } from '../../src/net/wire.js';
import { cleanName } from '../../src/world/names.js';

const TICK = 250, STALE = 5000, FLOOD = 20; // ms, ms, messages per second

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.live = new Map(); // id -> { pose, at }
    this.counts = new Map(); // id -> { n, second }: messages this second, for the flood guard
    this.timer = null;
    this.next = 1;
    for (const ws of ctx.getWebSockets()) { const a = ws.deserializeAttachment(); if (a) this.next = Math.max(this.next, a.id + 1); }
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/event') { this.broadcast(await req.text()); return new Response(null, { status: 204 }); }
    const name = url.searchParams.get('name'), cap = +(url.searchParams.get('cap') ?? 200);
    const [client, server] = Object.values(new WebSocketPair());
    if (this.ctx.getWebSockets().length >= cap) { // full: point at the next shard and close
      server.accept();
      server.send(JSON.stringify({ full: name.replace(/-(\d+)$/, (_, n) => `-${+n + 1}`) }));
      server.close(1000, 'full');
      return new Response(null, { status: 101, webSocket: client });
    }
    const id = this.next++ & 0xffff;
    this.ctx.waitUntil(this.env.WORLD.get(this.env.WORLD.idFromName('world')).fetch(new Request('https://world/rooms', { method: 'POST', body: name })));
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id, name: null, room: name });
    server.send(JSON.stringify({ hello: id, names: this.names() }));
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, msg) {
    const a = ws.deserializeAttachment();
    if (!a) return;
    const now = Date.now(), second = Math.floor(now / 1000), c = this.counts.get(a.id) ?? { n: 0, second };
    if (second !== c.second) { c.second = second; c.n = 0; }
    this.counts.set(a.id, c);
    if (++c.n > FLOOD) { this.live.delete(a.id); this.counts.delete(a.id); return ws.close(1008, 'too fast'); } // poses and names alike (review finding 6)
    if (typeof msg === 'string') { // { name }: once, or when it changes; everyone hears it
      if (msg.length > 200) return;
      let name = null;
      try { name = cleanName(JSON.parse(msg).name); } catch {}
      if (!name || name === a.name) return;
      ws.serializeAttachment({ ...a, name });
      return this.broadcast(JSON.stringify({ names: { [a.id]: name } }));
    }
    if (msg.byteLength !== POSE_BYTES) return;
    const e = this.live.get(a.id) ?? {};
    e.pose = decodePose(new Uint8Array(msg));
    e.at = now;
    this.live.set(a.id, e);
    this.timer ??= setTimeout(() => this.tick(), TICK);
  }

  webSocketClose(ws) {
    const a = ws.deserializeAttachment();
    if (a) { this.live.delete(a.id); this.counts.delete(a.id); }
    try { ws.close(); } catch {}
  }
  webSocketError(ws) { this.webSocketClose(ws); }

  names() { const out = {}; for (const ws of this.ctx.getWebSockets()) { const a = ws.deserializeAttachment(); if (a?.name) out[a.id] = a.name; } return out; }

  tick() {
    this.timer = null;
    const now = Date.now();
    if (now - (this.told ?? 0) > 10000) { // the World learns how many fly here, every 10 s at most
      this.told = now;
      const room = this.ctx.getWebSockets()[0]?.deserializeAttachment()?.room;
      if (room) this.ctx.waitUntil(this.env.WORLD.get(this.env.WORLD.idFromName('world')).fetch(new Request('https://world/rooms/count', { method: 'POST', body: JSON.stringify({ name: room, n: this.live.size }) })).catch(() => {}));
    }
    for (const [id, e] of this.live) if (now - e.at > STALE) this.live.delete(id);
    this.broadcast(encodeSnapshot([...this.live].map(([id, e]) => ({ id, pose: e.pose }))));
  }

  broadcast(data) { for (const ws of this.ctx.getWebSockets()) { try { ws.send(data); } catch {} } }
}
