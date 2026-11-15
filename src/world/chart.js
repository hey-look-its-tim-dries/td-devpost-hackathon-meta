// src/world/chart.js
// Charting (spec 6.4): every handbit starts as blank parchment and is inked in when you fly over it.
// Chart all of a Hand's handbits and it is sealed. Kept on this device under pwc.chart.v1 as one
// bit mask per Hand (handbit indices 0..30); in memory when the browser keeps nothing. Pure.
const KEY = 'pwc.chart.v1';

export function createChart(storage) {
  let seen = {}; // handId -> { m: mask, n: how many handbits it has }
  try { seen = JSON.parse(storage?.getItem(KEY) ?? '{}') ?? {}; } catch { seen = {}; }
  const save = () => { try { storage?.setItem(KEY, JSON.stringify(seen)); } catch {} };
  const bits = (m) => { let n = 0; for (; m; m &= m - 1) n++; return n; };
  return {
    // you flew over handbit `index` of a Hand with `total` handbits: 'new', 'sealed' (the last one), or null
    visit(handId, index, total) {
      if (index < 0 || index > 30) return null;
      const e = (seen[handId] ??= { m: 0, n: total });
      e.n = total;
      if (e.m & (1 << index)) return null;
      e.m |= 1 << index;
      save();
      return bits(e.m) >= total ? 'sealed' : 'new';
    },
    has: (handId, index) => !!((seen[handId]?.m ?? 0) & (1 << index)),
    count: (handId) => bits(seen[handId]?.m ?? 0),
    sealed: (handId) => !!seen[handId] && bits(seen[handId].m) >= seen[handId].n,
    mask: (handId) => seen[handId]?.m ?? 0,
    fill(handId, total) { seen[handId] = { m: total >= 31 ? 0x7fffffff : (1 << total) - 1, n: total }; save(); },
    forget(handId) { delete seen[handId]; save(); },
    ids: () => Object.keys(seen),
    sealedCount: () => Object.values(seen).filter((e) => bits(e.m) >= e.n).length,
  };
}
