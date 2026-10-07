// src/net.js
// The game's one door to the server: the world's Hands, laying yours, and the live room. Only DNA,
// pose, name and a random device token go out. Everything degrades to "playing alone" when the
// server is away. No three.js here (tests run it in node).
import { founders } from './world/founders.js';
import { fromB64, toB64 } from './hand/dna.js';
import { encodePose, decodeSnapshot } from './net/wire.js';

export const API = 'https://pwc.hey-look-its-tim-dries.workers.dev'; // ?api= overrides (wrangler dev is http://localhost:8787)
const TOKEN_KEY = 'pwc.token.v1';

export const rowToHand = (r) => ({ id: r.id, name: r.name, palm: fromB64(r.palm), prints: r.prints.map(fromB64), pose: { x: r.pose.x, z: r.pose.z, rot: r.pose.rot, mirror: false }, founder: !!r.founder });

const makeToken = () => { const b = new Uint8Array(32); crypto.getRandomValues(b); return toB64(b); };

export function createNet({ api = API, storage = null, fetchFn = globalThis.fetch?.bind(globalThis), timeout = 4000 } = {}) {
  let token = null;
  try { token = storage?.getItem(TOKEN_KEY); } catch {}
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) { token = makeToken(); try { storage?.setItem(TOKEN_KEY, token); } catch {} }

  // a request that gives up after `timeout` ms even when the fetch never settles
  const call = (path, init = {}) => {
    const ctl = new AbortController();
    let timer;
    const late = new Promise((_, reject) => { timer = setTimeout(() => { ctl.abort(); reject(new Error('timeout')); }, timeout); });
    const go = fetchFn(api + path, { ...init, signal: ctl.signal, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
    return Promise.race([go, late]).finally(() => clearTimeout(timer));
  };

  return {
    token,
    async fetchWorld() {
      try {
        const r = await call('/world');
        if (!r.ok) throw new Error(r.status);
        const { hands } = await r.json();
        if (!Array.isArray(hands) || !hands.length) throw new Error('empty');
        return { hands: hands.map(rowToHand), online: true };
      } catch {
        return { hands: founders().map((f, i) => ({ ...f, id: `hand-founder-${i}`, founder: true })), online: false };
      }
    },
    async layHand({ palm, prints, pose, name }) {
      try {
        const r = await call('/hands', { method: 'POST', body: JSON.stringify({ token, name, palm: toB64(palm), prints: prints.map(toB64), pose: { x: pose.x, z: pose.z, rot: pose.rot, mirror: false } }) });
        const body = await r.json().catch(() => ({}));
        if (r.status === 200 || r.status === 409) return body; // 409: this device's Hand is already on the map
        return { error: body.error ?? `server ${r.status}` };
      } catch {
        return { error: 'offline' };
      }
    },
    async washHand(id) {
      try { return (await call(`/hands/${id}`, { method: 'DELETE', body: JSON.stringify({ token }) })).status === 204; } catch { return false; }
    },
    // the live room: poses out (at most 5 a second), snapshots and lay events in; reconnects by itself
    openRoom({ onHello, onSnapshot, onLaid, onLeft, onState } = {}) {
      let ws = null, closed = false, wait = 1000, lastSent = 0, shard = 0, followed = false;
      const retry = () => { if (closed) return; setTimeout(connect, followed ? 0 : wait); wait = Math.min(30000, wait * 2); };
      function connect() {
        if (closed) return;
        try { ws = new WebSocket(api.replace(/^http/, 'ws') + `/room?shard=${shard}`); } catch { return retry(); }
        ws.binaryType = 'arraybuffer';
        ws.onopen = () => { wait = 1000; followed = false; onState?.('open'); };
        ws.onmessage = (e) => {
          if (typeof e.data !== 'string') return onSnapshot?.(decodeSnapshot(new Uint8Array(e.data)));
          let m;
          try { m = JSON.parse(e.data); } catch { return; }
          if (m.hello !== undefined) onHello?.(m.hello);
          else if (m.laid) onLaid?.(rowToHand(m.laid));
          else if (m.left) onLeft?.(m.left);
          else if (m.full && !followed) { followed = true; shard = +m.full.split('-').pop() || 0; } // the close that follows reconnects to the next shard
        };
        ws.onclose = () => { onState?.('closed'); retry(); };
        ws.onerror = () => {};
      }
      connect();
      return {
        send(pose) { const now = Date.now(); if (ws?.readyState === 1 && now - lastSent >= 200) { lastSent = now; ws.send(encodePose(pose)); } },
        close() { closed = true; ws?.close(); },
      };
    },
  };
}
