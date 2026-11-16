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
