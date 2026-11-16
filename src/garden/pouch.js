// src/garden/pouch.js
// What a gardener carries: seeds by kind, water (five pours, refilled by skimming a river), the kinds
// they have found (the herbarium), what they planted (it decorates their whorl) and experience. Kept
// on this device under pwc.garden.v1. Pure.
import { logPlanting, signature } from './bouquet.js';

const KEY = 'pwc.garden.v1';
const XP = { sprig: 1, plant: 5, tend: 3, gather: 1, discover: 15, bloom: 40, golden: 60, clear: 2 };

export function createPouch(storage, species, starters) {
  let s = null;
  try { s = JSON.parse(storage?.getItem(KEY) ?? 'null'); } catch {}
  if (!s || typeof s !== 'object' || !s.seeds) s = { seeds: Object.fromEntries(starters.map((id) => [id, 10])), sel: starters[0], water: 0, xp: 0, planted: {}, found: [...starters] };
  s.log ??= Object.entries(s.planted ?? {}).map(([id, n]) => [+id, n, 0]); // gardens from before the log: what was sown, in no order
  const found = new Set(s.found);
  const save = () => { s.found = [...found]; try { storage?.setItem(KEY, JSON.stringify(s)); } catch {} };
  const carried = () => Object.keys(s.seeds).map(Number).filter((id) => s.seeds[id] > 0 && species[id]).sort((a, b) => a - b);
  return {
    found,
    get selected() { return s.sel; },
    get total() { return carried().reduce((n, id) => n + s.seeds[id], 0); },
    get water() { return s.water; },
    get xp() { return s.xp; },
    get level() { return 1 + Math.floor(Math.sqrt(s.xp / 50)); },
    get plantedTotal() { return Object.values(s.planted).reduce((a, b) => a + b, 0); },
    has: (id) => s.seeds[id] ?? 0,
    carried,
    // true when this kind is new to you
    gather(id, n = 1) { s.seeds[id] = (s.seeds[id] ?? 0) + n; const fresh = !found.has(id); found.add(id); if (!carried().includes(s.sel)) s.sel = id; save(); return fresh; },
    see(id) { if (found.has(id)) return false; found.add(id); save(); return true; }, // wildlife you met
    select(id) { if (s.seeds[id] > 0) { s.sel = id; save(); } return s.sel; },
    next(dir = 1) { const c = carried(); if (!c.length) return null; const i = c.indexOf(s.sel); s.sel = c[(i + dir + c.length) % c.length]; save(); return s.sel; },
    // one seed of the selected kind (or the next kind you carry), or null with an empty pouch
    take() {
      const c = carried();
      if (!c.length) return null;
      if (!(s.seeds[s.sel] > 0)) s.sel = c.find((id) => id > s.sel) ?? c[0];
      s.seeds[s.sel]--;
      save();
      return s.sel;
    },
    giveBack(id) { s.seeds[id] = (s.seeds[id] ?? 0) + 1; save(); }, // a planting the map refused
    planted(id) { s.planted[id] = (s.planted[id] ?? 0) + 1; s.log = logPlanting(s.log, id, Math.floor(Date.now() / 86400000)); save(); },
    log: () => s.log, // everything you sowed, in order: your bouquet (bouquet.js)
    signature: () => signature(s.log),
    deco: (n = 12) => Object.keys(s.planted).map(Number).filter((id) => species[id]).sort((a, b) => s.planted[b] - s.planted[a] || a - b).slice(0, n),
    fill() { s.water = 5; save(); },
    pour() { if (s.water <= 0) return false; s.water--; save(); return true; },
    // the whole pouch, to keep on the map; and taking one in from the map, when it holds more than this one
    dump: () => ({ ...s, found: [...found] }),
    adopt(d) {
      if (!d || typeof d !== 'object' || typeof d.seeds !== 'object' || !d.seeds || !Array.isArray(d.found) || !Array.isArray(d.log) || !(d.xp > s.xp)) return false;
      s = { seeds: d.seeds, sel: d.sel, water: Math.max(0, Math.min(5, d.water | 0)), xp: d.xp, planted: d.planted ?? {}, found: d.found, log: d.log };
      found.clear();
      for (const id of d.found) if (species[id]) found.add(id);
      save();
      return true;
    },
    credit(what) { const before = this.level; s.xp += XP[what] ?? 0; save(); return this.level > before; }, // true on a new level
  };
}
