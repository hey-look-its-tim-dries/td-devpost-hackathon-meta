// The atlas of everyone's lands, and what this headset remembers of yours.
// A land is only { cls, seed }: the class you read off your own finger and a random seed. Nothing
// measured from your hand is ever part of it (Meta allows hand data for interaction only).

// ponytail: a bundled atlas until the shared one (Cloudflare Worker + D1) exists; the journey
// must never depend on the network anyway, so this stays as the fallback.
export const BUNDLED = [
  { id: 'b1', cls: 'double', seed: 4211, ink: '#2b1d52', tone: 1 },
  { id: 'b2', cls: 'whorl', seed: 907, ink: '#160d0a', tone: 4 },
  { id: 'b3', cls: 'tented', seed: 3310, ink: '#10323a', tone: 0 },
  { id: 'b4', cls: 'pocket', seed: 77, ink: '#3b2a10', tone: 2 },
  { id: 'b5', cls: 'arch', seed: 5120, ink: '#1f3a1a', tone: 1 },
  { id: 'b6', cls: 'loop', seed: 2718, ink: '#3a1030', tone: 3 },
  { id: 'b7', cls: 'whorl', seed: 6161, ink: '#1c2a4a', tone: 0 },
  { id: 'b8', cls: 'loop', seed: 8088, ink: '#120a08', tone: 3 },
];

// Where neighbouring lands lie around a land (world metres at table scale): far enough to feel
// like a journey (about 60 m once you are bird-sized), close enough to reach in half a minute.
export const SPOTS = [[0.95, -1.25], [-1.15, -1.05], [0.2, -2.1]];

// The lands you can fly to next from `home`: a stable choice per home, never the same class twice.
export function neighbours(home, n = 2, atlas = BUNDLED) {
  const pool = atlas.filter((l) => !(l.cls === home.cls && l.seed === home.seed));
  const out = [];
  const start = (Math.imul(home.seed, 2654435761) >>> 0) % pool.length;
  for (let i = 0; i < pool.length && out.length < n; i++) {
    const l = pool[(start + i) % pool.length];
    if (!out.some((o) => o.cls === l.cls)) out.push(l);
  }
  return out;
}

const KEY = 'palm-whorl-cities.v1';
export function loadSave(storage = globalThis.localStorage) {
  try {
    return JSON.parse(storage.getItem(KEY)) || null;
  } catch {
    return null; // private window, blocked storage, or a broken entry: start fresh
  }
}
export function storeSave(save, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(save));
  } catch {
    // storage full or blocked: this session still works, it just will not be remembered
  }
}
