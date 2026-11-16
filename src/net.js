// src/net.js
// The game's one door to the server: the world's Hands, laying yours, and the live room. Only DNA,
// pose, name and a random device token go out. Everything degrades to "playing alone" when the
// server is away. No three.js here (tests run it in node).
import { founders } from './world/founders.js';
import { fromB64, toB64 } from './hand/dna.js';
import { encodePose, decodeSnapshot } from './net/wire.js';
import { cleanName } from './world/names.js';

export const API = 'https://pwc.pwc-server.workers.dev'; // ?api= overrides (wrangler dev is http://localhost:8787)
const TOKEN_KEY = 'pwc.token.v1';

export const rowToHand = (r) => ({ id: r.id, name: cleanName(r.name) ?? 'a Hand', palm: fromB64(r.palm), prints: r.prints.map(fromB64), pose: { x: r.pose.x, z: r.pose.z, rot: r.pose.rot, mirror: false }, founder: !!r.founder, placed_at: r.placed_at ?? null });

export const rowToGrove = ([id, hand, bit, x, y, sp, stage, tended, big, hab]) => ({ id, hand, bit, x, y, sp, stage, tended, big, hab });
const makeToken = () => { const b = new Uint8Array(32); crypto.getRandomValues(b); return toB64(b); };

export function createNet({ api = API, storage = null, fetchFn = globalThis.fetch?.bind(globalThis), timeout = 4000 } = {}) {
  let token = null;
  try { token = storage?.getItem(TOKEN_KEY); } catch {}
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) { token = makeToken(); try { storage?.setItem(TOKEN_KEY, token); } catch {} }

  // a request and its JSON body, given up after `timeout` ms even when the fetch or the body never settles
  const call = (path, init = {}) => {
    const ctl = new AbortController();
    let timer;
    const late = new Promise((_, reject) => { timer = setTimeout(() => { ctl.abort(); reject(new Error('timeout')); }, timeout); });
    const go = (async () => {
      const r = await fetchFn(api + path, { ...init, signal: ctl.signal, headers: init.body ? { 'Content-Type': 'application/json' } : {} }); // a plain GET needs no preflight
      return { status: r.status, body: r.status === 204 ? null : await r.json().catch(() => ({})) };
    })();
    return Promise.race([go, late]).finally(() => clearTimeout(timer));
  };

  return {
    token,
    async fetchWorld() {
      try {
        const { status, body } = await call('/world');
        if (status !== 200 || !Array.isArray(body?.hands) || !body.hands.length) throw new Error(status);
        return { hands: body.hands.map(rowToHand), online: true };
      } catch {
        return { hands: founders().map((f, i) => ({ ...f, id: `hand-founder-${i}`, founder: true })), online: false };
      }
    },
    // { id, pose } laid; { existing, ...Hand } when this device already has one on the map (409); { conflict, fits }; or { error }
    async layHand({ palm, prints, pose, name }) {
      try {
        const { status, body } = await call('/hands', { method: 'POST', body: JSON.stringify({ token, name, palm: toB64(palm), prints: prints.map(toB64), pose: { x: pose.x, z: pose.z, rot: pose.rot, mirror: false } }) });
        if (status === 409) return body?.palm ? { existing: true, ...rowToHand(body) } : { error: 'server 409' };
        if (status === 200) return body;
        return { error: body?.error ?? `server ${status}` };
      } catch {
        return { error: 'offline' };
      }
    },
    async community() {
      try {
        const { status, body } = await call('/community');
        return status === 200 && Number.isInteger(body?.no) && Array.isArray(body.slots) ? body : null;
      } catch {
        return null;
      }
    },
    async donate(code) {
      try {
        const { status, body } = await call('/community', { method: 'POST', body: JSON.stringify({ token, code }) });
        return status === 200 ? body : { error: body?.error ?? `server ${status}` };
      } catch {
        return { error: 'offline' };
      }
    },
    // pairing (spec 10): the headset asks for a code, the phone sends its finished DNA to it, the headset collects it
    async pair() {
      try { const { status, body } = await call('/pair', { method: 'POST', body: '{}' }); return status === 200 && /^[A-Z2-9]{6}$/.test(body?.code) ? { code: body.code } : null; } catch { return null; }
    },
    async sendPair(code, { palm, prints, name = null }) {
      try {
        const { status, body } = await call(`/pair/${code}`, { method: 'POST', body: JSON.stringify({ palm: toB64(palm), prints: prints.map(toB64), name }) });
        return status === 200 ? { ok: true } : { error: body?.error ?? `server ${status}` };
      } catch {
        return { error: 'offline' };
      }
    },
    async waitPair(code, { every = 2000, signal = null } = {}) {
      const nap = () => new Promise((r) => setTimeout(r, every));
      while (!signal?.aborted) {
        try {
          const { status, body } = await call(`/pair/${code}`);
          if (status === 200) return { palm: fromB64(body.palm), prints: body.prints.map(fromB64), name: body.name ?? null };
          if (status !== 204) return null; // expired or unknown
        } catch {} // the map blinked: keep waiting
        await nap();
      }
      return null;
    },
    async events() {
      try {
        const { status, body } = await call('/events');
        return status === 200 && Array.isArray(body?.events) ? body.events : null;
      } catch {
        return null;
      }
    },
    async watersheds() {
      try {
        const { status, body } = await call('/watersheds');
        return status === 200 && Array.isArray(body?.pairs) ? body.pairs : [];
      } catch {
        return [];
      }
    },
    async names() {
      try {
        const { status, body } = await call('/names');
        return status === 200 && body?.names && typeof body.names === 'object' ? body.names : {};
      } catch {
        return {};
      }
    },
    async nameIt({ handId, feature, name }) {
      try {
        const { status, body } = await call('/names', { method: 'POST', body: JSON.stringify({ token, hand_id: handId, feature, name }) });
        return status === 200 ? { ok: true } : { error: body?.error ?? `server ${status}` };
      } catch {
        return { error: 'offline' };
      }
    },
    async stats() {
      try {
        const { status, body } = await call('/stats');
        return status === 200 && Number.isInteger(body?.hands) && Number.isInteger(body?.flying) ? { hands: body.hands, flying: body.flying, ...(Number.isInteger(body.plants) ? { plants: body.plants } : {}) } : null;
      } catch {
        return null;
      }
    },
    async washHand(id) {
      try { return (await call(`/hands/${id}`, { method: 'DELETE', body: JSON.stringify({ token }) })).status === 204; } catch { return false; }
    },
    // ---- the garden: groves on the Hands ----
    // one Hand's groves (the garden is read Hand by Hand, as you come near), or with no Hand the gardeners' board
    async plants(hand = null) {
      try {
        const { status, body } = await call(hand ? `/plants?hand=${encodeURIComponent(hand)}` : '/plants?top=1');
        return status === 200 && Array.isArray(body?.plants) ? { plants: body.plants.map(rowToGrove), top: Array.isArray(body.top) ? body.top : [] } : null;
      } catch { return null; }
    },
    // a hyper sow's sprigs, up to 40 at once: { ids: [id or null (no room), ...], tended } or { error }
    async plantMany(list) {
      try {
        const { status, body } = await call('/plants', { method: 'POST', body: JSON.stringify({ token, batch: list.map((p) => ({ hand_id: p.hand, bit: p.bit, x: p.x, y: p.y, sp: p.sp, hab: p.hab, big: p.big })) }) });
        return status === 200 && Array.isArray(body?.ids) ? { ids: body.ids, tended: body.tended } : { error: body?.error ?? String(status) };
      } catch { return { error: 'offline' }; }
    },
    async plant({ hand, bit, x, y, sp, hab, big }) {
      try {
        const { status, body } = await call('/plants', { method: 'POST', body: JSON.stringify({ token, hand_id: hand, bit, x, y, sp, hab, big: big === 2 ? 2 : big ? 1 : 0 }) });
        return status === 200 ? { id: body.id, tended: body.tended } : { error: body?.error ?? String(status) };
      } catch { return { error: 'offline' }; }
    },
    async tend(id) {
      try {
        const { status, body } = await call(`/plants/${id}/tend`, { method: 'POST', body: JSON.stringify({ token }) });
        return status === 200 ? { stage: body.stage, tended: body.tended } : { error: body?.error ?? String(status) };
      } catch { return { error: 'offline' }; }
    },
    async uproot(id) {
      try { return (await call(`/plants/${id}`, { method: 'DELETE', body: JSON.stringify({ token }) })).status === 204; } catch { return false; }
    },
    async claimGolden(epoch) {
      try { const { status, body } = await call('/golden', { method: 'POST', body: JSON.stringify({ token, epoch }) }); return status === 200 ? body : null; } catch { return null; }
    },
    // ---- the pouch on the map, and signing in ----
    async profileGet() { try { const { status, body } = await call('/profile/get', { method: 'POST', body: JSON.stringify({ token }) }); return status === 200 ? body : null; } catch { return null; } },
    async profilePut(data) { try { return (await call('/profile', { method: 'POST', body: JSON.stringify({ token, data }) })).status === 204; } catch { return false; } },
    async profileDelete() { try { return (await call('/profile/delete', { method: 'POST', body: JSON.stringify({ token }) })).status === 204; } catch { return false; } },
    // { ok, data } or { error }: the map checks the token with Facebook itself
    async loginFacebook(accessToken) { try { const { status, body } = await call('/login/facebook', { method: 'POST', body: JSON.stringify({ token, access_token: accessToken }) }); return status === 200 ? body : { error: body?.error ?? String(status) }; } catch { return { error: 'offline' }; } },
    // the live room: poses out (at most 5 a second), snapshots and lay events in; reconnects by itself
    openRoom({ name = null, deco = null, onHello, onNames, onSnapshot, onLaid, onLeft, onState, onCommunity, onGarden, onDecos } = {}) {
      let ws = null, closed = false, wait = 1000, lastSent = 0, shard = 0, followed = false;
      const retry = () => { if (closed) return; setTimeout(connect, followed ? 0 : wait); wait = Math.min(30000, wait * 2); };
      function connect() {
        if (closed) return;
        try { ws = new WebSocket(api.replace(/^http/, 'ws') + `/room?shard=${shard}`); } catch { return retry(); }
        ws.binaryType = 'arraybuffer';
        ws.onopen = () => { wait = 1000; followed = false; onState?.('open'); if (name) ws.send(JSON.stringify({ name })); if (deco?.length) ws.send(JSON.stringify({ deco })); };
        ws.onmessage = (e) => {
          if (typeof e.data !== 'string') return onSnapshot?.(decodeSnapshot(new Uint8Array(e.data)));
          let m;
          try { m = JSON.parse(e.data); } catch { return; }
          if (m.names) onNames?.(m.names);
          if (m.decos) onDecos?.(m.decos);
          if (m.planted || m.plantedMany || m.tended || m.uprooted !== undefined || m.golden || m.bloomed) onGarden?.({ ...m, ...(m.planted ? { planted: rowToGrove(m.planted) } : {}), ...(m.plantedMany ? { plantedMany: m.plantedMany.map(rowToGrove) } : {}) });
          if (m.hello !== undefined) onHello?.(m.hello);
          else if (m.laid) onLaid?.(rowToHand(m.laid));
          else if (m.left) onLeft?.(m.left);
          else if (m.sealed || m.donated) onCommunity?.(m);
          else if (m.full && !followed) { followed = true; shard = +m.full.split('-').pop() || 0; } // the close that follows reconnects to the next shard
        };
        ws.onclose = () => { onState?.('closed'); retry(); };
        ws.onerror = () => {};
      }
      connect();
      return {
        deco(list) { deco = list; if (ws?.readyState === 1 && list.length) ws.send(JSON.stringify({ deco: list })); },
        rename(n) { name = n; if (ws?.readyState === 1) ws.send(JSON.stringify({ name })); },
        send(pose) { const now = Date.now(); if (ws?.readyState === 1 && now - lastSent >= 200) { lastSent = now; ws.send(encodePose(pose)); } },
        close() { closed = true; ws?.close(); },
      };
    },
  };
}

// a Hand laid without anyone choosing (sent again at start): laid; adopted, when the map already holds this device's
// Hand; moved once to the fresh fit the map offers when its place was taken (spec 6.3); or still pending. Never
// left overlapping someone. `note` says which.
export async function settleLay(net, hand) {
  const done = (r, note) => ({ hand: { ...hand, id: r.id, pose: r.pose, pending: false }, note });
  let r = await net.layHand(hand);
  if (r.existing) { const { existing, ...h } = r; return { hand: { ...h, pending: false }, note: 'existing' }; }
  if (r.id) return done(r, 'joined');
  if (r.conflict) {
    const fit = r.fits?.[0];
    if (!fit) return { hand: { ...hand, pending: true }, note: 'pending' };
    const moved = { ...hand, pose: fit.pose };
    r = await net.layHand(moved);
    if (r.id) return { hand: { ...moved, id: r.id, pose: r.pose, pending: false }, note: 'moved' };
    return { hand: { ...moved, pending: true }, note: 'pending' };
  }
  return { hand: { ...hand, pending: true }, note: 'pending' };
}
