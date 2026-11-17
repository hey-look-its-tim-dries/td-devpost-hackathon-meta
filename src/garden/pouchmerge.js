// src/garden/pouchmerge.js
// Two copies of one gardener's pouch meet: the map's and a device's. Neither replaces the other. What is
// earned only grows (experience, the herbarium, how much of each kind was ever planted); what is spent
// (seeds, water, the selected kind) and the sowing log follow the copy that played most (ties: `b`, the
// incoming one). Used by the map on every save and by the device on every answer. Pure.
// ponytail: the log is not interleaved across devices: the most-played copy's wins whole. Merge by day if
// people really play one account on two devices at the same time.
const ok = (p) => p && typeof p === 'object' && p.seeds && typeof p.seeds === 'object' && Array.isArray(p.found) && Array.isArray(p.log) && Number.isFinite(p.xp);

export function mergePouch(a, b) {
  if (!ok(a)) return b;
  if (!ok(b)) return a;
  const lead = a.xp > b.xp ? a : b, planted = { ...(a.planted ?? {}) };
  for (const [id, n] of Object.entries(b.planted ?? {})) planted[id] = Math.max(planted[id] ?? 0, n);
  return { seeds: lead.seeds, sel: lead.sel, water: lead.water, xp: Math.max(a.xp, b.xp), planted, found: [...new Set([...a.found, ...b.found])], log: lead.log };
}
