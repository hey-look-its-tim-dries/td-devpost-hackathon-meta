// src/garden/drift.js
// Seeds on the wind: clouds of seed drift near every Hand, new ones every three minutes, and now and
// then one golden seed for the whole world. Where and what they are comes from the clock and the Hands
// alone, so every player sees the same clouds without the map having to say so. Pure.
import { rng } from '../hand/dna.js';

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const sorted = (anchors) => [...anchors].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const WEIGHT = [0, 6, 3, 1, 0]; // by rarity: legends never drift in a common cloud

// anchors: [{ id, x, z }] (the Hands); flora: ids of what can be planted
export function clouds(now, anchors, species, flora, { period = 180000, per = 2, spread = 1200 } = {}) {
  const epoch = Math.floor(now / period), bag = flora.flatMap((id) => Array(WEIGHT[species[id].rarity] ?? 0).fill(id)), out = [];
  if (!bag.length) return out;
  for (const a of sorted(anchors)) for (let k = 0; k < per; k++) {
    const id = `${epoch}:${a.id}:${k}`, r = rng(hash(id)), ang = r() * Math.PI * 2, d = 200 + r() * (spread - 200);
    out.push({ id, x: a.x + Math.cos(ang) * d, z: a.z + Math.sin(ang) * d, up: 50 + r() * 90, sp: bag[Math.floor(r() * bag.length)], n: 8 + Math.floor(r() * 8), until: (epoch + 1) * period });
  }
  return out;
}
// the one golden seed: a legend, over one Hand, for four minutes; first to reach it wins it
export function golden(now, anchors, species, flora, { period = 240000 } = {}) {
  if (!anchors.length) return null;
  const epoch = Math.floor(now / period), r = rng(hash(`gold:${epoch}`)), list = sorted(anchors), a = list[Math.floor(r() * list.length)];
  const top = Math.max(...flora.map((id) => species[id].rarity)), rare = flora.filter((id) => species[id].rarity === top);
  const ang = r() * Math.PI * 2, d = 300 + r() * 900;
  return { epoch, id: `gold:${epoch}`, x: a.x + Math.cos(ang) * d, z: a.z + Math.sin(ang) * d, up: 120 + r() * 120, sp: rare[Math.floor(r() * rare.length)], n: 3, until: (epoch + 1) * period, hand: a.id };
}

// The sandstorm: every ten minutes one blows across the world for four, along a line through one Hand.
// Groves it passes over are parched until someone waters them. Like the clouds it comes from the clock,
// so every player sees the same storm and the same damage, with nothing kept on the map.
export const STORM = { period: 600000, blows: 240000, r: 900, reach: 9000, lookback: 36 };
function track(epoch, anchors) {
  if (!anchors.length) return null;
  const r = rng(hash(`storm:${epoch}`)), list = sorted(anchors), a = list[Math.floor(r() * list.length)], ang = r() * Math.PI * 2, off = (r() - 0.5) * 1600;
  const dx = Math.cos(ang), dz = Math.sin(ang), cx = a.x - dz * off, cz = a.z + dx * off, h = STORM.reach / 2;
  return { x0: cx - dx * h, z0: cz - dz * h, x1: cx + dx * h, z1: cz + dz * h, t0: epoch * STORM.period };
}
// where the storm is now ({ epoch, x, z, r, k: 0..1 along its way }), or null when the air is calm
export function storm(now, anchors) {
  const epoch = Math.floor(now / STORM.period), tr = track(epoch, anchors), k = tr && (now - tr.t0) / STORM.blows;
  return tr && k <= 1 ? { epoch, x: tr.x0 + (tr.x1 - tr.x0) * k, z: tr.z0 + (tr.z1 - tr.z0) * k, r: STORM.r, k } : null;
}
// did a storm pass over (x, z) after the grove there was last tended (and before now)?
export function stormDried(x, z, tended, now, anchors) {
  const epoch = Math.floor(now / STORM.period);
  for (let e = epoch; e > epoch - STORM.lookback; e--) {
    const tr = track(e, anchors);
    if (!tr || tr.t0 + STORM.blows < tended) break; // older storms all passed before it was tended
    const vx = tr.x1 - tr.x0, vz = tr.z1 - tr.z0, u = Math.max(0, Math.min(1, ((x - tr.x0) * vx + (z - tr.z0) * vz) / (vx * vx + vz * vz)));
    const at = tr.t0 + u * STORM.blows;
    if (Math.hypot(x - tr.x0 - vx * u, z - tr.z0 - vz * u) <= STORM.r && at > tended && at <= now) return true;
  }
  return false;
}
