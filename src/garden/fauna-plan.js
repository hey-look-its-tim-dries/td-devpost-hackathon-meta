// src/garden/fauna-plan.js
// Who lives where: turns the blooming plots and the species index into a flat list of individuals, the
// same for everyone (every number is seeded from the plot's place and the species' id). Pure: no three.js.
export const KIND_KEY = { bird: 'birds', insect: 'insects', fish: 'fish', animal: 'animals' };
export const DEFAULT_MAX = { birds: 400, insects: 500, fish: 100, animals: 60 };
const KINDS = ['bird', 'insect', 'fish', 'animal'];

// a 32-bit mix of two integers, and a string as an integer
export function hash32(a, b = 0) {
  let h = (a ^ Math.imul(b | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
// the seed of one species on one plot: its place to the metre, and the species' id
export const groupSeed = (x, z, id) => hash32(hash32(Math.round(x) | 0, Math.round(z) | 0), hashStr(String(id)));

// how many individuals of a species a plot of a given bloom level (1..4) holds; 0 below a first bloom
export function herdSize(kind, level) {
  const l = Math.min(4, Math.floor(level));
  if (!(l >= 1)) return 0;
  switch (kind) {
    case 'bird': return 1 + 2 * l; // a flock of 3, 5, 7, 9
    case 'insect': return 4 + 4 * l; // a cloud of 8, 12, 16, 20
    case 'fish': return 1 + l; // 2 .. 5 leaping
    case 'animal': return 2 + l; // a herd of 3 .. 6
    default: return 0;
  }
}

// plots: [{ x, z, r, level, fauna: [speciesId], water: [[x, z]] }], species: the game's index, max: { birds, insects, fish, animals }.
// Returns the individuals, kind by kind and plot by plot: { sp (index into species), plot (index into plots), kind,
// seed (its own), group (the seed its flock or herd shares), i (its place in the group), n (the group's size) }.
// When a kind asks for more than its cap, the groups are dealt one individual each in turn (in seed order,
// whatever the order of the list), so every flock thins evenly and none vanishes before the others.
export function planFauna(plots, species, max = DEFAULT_MAX) {
  const byId = new Map();
  species.forEach((s, i) => { if (s && KIND_KEY[s.kind] && !byId.has(s.id)) byId.set(s.id, i); });
  const groups = { bird: [], insect: [], fish: [], animal: [] };
  (plots || []).forEach((p, pi) => {
    const seen = new Set();
    for (const id of p.fauna || []) {
      const si = byId.get(id);
      if (si === undefined || seen.has(si)) continue;
      seen.add(si);
      const kind = species[si].kind, want = herdSize(kind, p.level);
      if (!want || (kind === 'fish' && !(p.water && p.water.length))) continue; // a fish needs a river
      groups[kind].push({ sp: si, plot: pi, seed: groupSeed(p.x, p.z, id), want, n: 0 });
    }
  });
  const out = [];
  for (const kind of KINDS) {
    const gs = groups[kind], cap = Math.max(0, Math.floor(max?.[KIND_KEY[kind]] ?? DEFAULT_MAX[KIND_KEY[kind]]));
    const order = gs.slice().sort((a, b) => a.seed - b.seed || a.plot - b.plot || a.sp - b.sp);
    for (let round = 0, left = cap, any = true; left > 0 && any; round++) {
      any = false;
      for (const g of order) if (g.want > round && left > 0) { g.n++; left--; any = true; }
    }
    for (const g of gs) for (let i = 0; i < g.n; i++) out.push({ sp: g.sp, plot: g.plot, kind, seed: hash32(g.seed, i + 1), group: g.seed, i, n: g.n });
  }
  return out;
}
