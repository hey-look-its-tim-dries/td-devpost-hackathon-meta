// src/garden/garden.js
// The garden: groves planted on the Hands, one record each ({ id, hand, bit, x, y, sp, stage, tended, big, hab },
// x and y in the Hand's own metres). A grove grows a stage each time someone waters it (0 sprout .. 3 in flower),
// goes dry when nobody tends it and dies after that. A handbit is a plot: it blooms by how much grows
// there, how well, and how many kinds, and wildlife follows the bloom. Pure.
export const CAP = 80, UNITS = 400; // a handbit holds 400 units: 80 groves (5 each), or sprigs (single plants from a hyper sow) at 1 each
const cost = (p) => (p.big === 2 ? 1 : 5);
export const DRY_MS = 36 * 3600e3, DEAD_MS = 96 * 3600e3; // untended this long: dry (counts half, looks parched), then dead (counts nothing, anyone may clear it)
export const LEVELS = [10, 40, 110, 240]; // a plot's score for a first bloom, a meadow, a garden, a full bloom
export const habitatOf = (code, nearWater) => (nearWater ? 'bank' : /^[TIMRL]1$/.test(code) ? 'ridge' : 'dune');
export const vigour = (p, now) => (now - p.tended > DEAD_MS ? 'dead' : now - p.tended > DRY_MS ? 'dry' : 'fresh');
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const key = (hand, bit) => `${hand}:${bit}`;

export function createGarden(species) {
  const byId = new Map(), plots = new Map(), used = new Map(); // id -> grove; "hand:bit" -> Set of ids; "hand:bit" -> units taken
  const wild = { insect: [], bird: [], fish: [], animal: [] };
  for (const s of species) wild[s.kind]?.push(s);
  return {
    get count() { return byId.size; },
    all: () => byId.values(),
    get: (id) => byId.get(id) ?? null,
    units: (hand, bit) => used.get(key(hand, bit)) ?? 0,
    full: (hand, bit, need = 5) => (used.get(key(hand, bit)) ?? 0) + need > UNITS,
    // false when it is already here or its plot is full
    add(p) {
      if (byId.has(p.id) || this.full(p.hand, p.bit, cost(p))) return false;
      byId.set(p.id, p);
      const k = key(p.hand, p.bit);
      used.set(k, (used.get(k) ?? 0) + cost(p));
      if (!plots.has(k)) plots.set(k, new Set());
      plots.get(k).add(p.id);
      return true;
    },
    remove(id) { const p = byId.get(id); if (!p) return false; byId.delete(id); plots.get(key(p.hand, p.bit))?.delete(id); used.set(key(p.hand, p.bit), (used.get(key(p.hand, p.bit)) ?? 0) - cost(p)); return true; },
    removeHand(hand) { let n = 0; for (const p of [...byId.values()]) if (p.hand === hand && this.remove(p.id)) n++; return n; },
    tend(id, stage, tended) { const p = byId.get(id); if (p) { p.stage = stage; p.tended = tended; } return !!p; },
    // a plot: how many groves, its score and bloom level 0..4, the kinds growing there
    plot(hand, bit, now) {
      const ids = plots.get(key(hand, bit)), kinds = new Set();
      let score = 0, n = 0, bank = 0;
      for (const id of ids ?? []) {
        const p = byId.get(id), v = p.dry !== undefined ? ['fresh', 'dry', 'dead'][p.dry] : vigour(p, now); // the game may know better (a storm)
        n++;
        if (v === 'dead') continue;
        kinds.add(p.sp);
        if (p.hab === 'bank') bank++;
        score += (p.stage + 1) * (species[p.sp]?.habitat === p.hab ? 1.5 : 1) * (v === 'dry' ? 0.5 : 1) * (p.big === 2 ? 0.2 : p.big ? 2 : 1);
      }
      score += 4 * kinds.size;
      return { n, score, level: LEVELS.filter((l) => score >= l).length, kinds, bank };
    },
    plotKeys: () => [...plots.keys()].filter((k) => plots.get(k).size).map((k) => { const i = k.lastIndexOf(':'); return { hand: k.slice(0, i), bit: +k.slice(i + 1) }; }),
    groves: (hand, bit) => [...(plots.get(key(hand, bit)) ?? [])].map((id) => byId.get(id)),
    // the wildlife a plot of this habitat and bloom level draws, the same for everyone: insects first, then
    // birds (and fish at a bank), then animals; the rarest only come to a full bloom
    fauna(hand, bit, habitat, level) {
      const out = [], h = hash(key(hand, bit));
      const pick = (kind, n) => {
        if (n <= 0) return;
        const pool = wild[kind].filter((s) => s.habitat === habitat && s.rarity <= Math.max(2, level));
        pool.sort((a, b) => (level === 4 ? b.rarity - a.rarity : 0) || ((hash(a.name) ^ h) >>> 0) - ((hash(b.name) ^ h) >>> 0));
        for (const s of pool.slice(0, n)) out.push(s.id);
      };
      pick('insect', level); pick('bird', level - 1); pick('fish', level - 1); pick('animal', level - 2);
      return out;
    },
    // the grove of a Hand nearest to a point in the Hand's metres, within `within`, or null
    nearest(hand, x, y, within, ok = () => true) {
      let best = null, bd = within;
      for (const p of byId.values()) if (p.hand === hand && ok(p)) { const d = Math.hypot(p.x - x, p.y - y); if (d <= bd) { bd = d; best = p; } }
      return best;
    },
  };
}
