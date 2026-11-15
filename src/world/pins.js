// src/world/pins.js
// Pinned places (spec 6.4): at most five, kept on this device (pwc.pins.v1), shown on the compass;
// pins on a washed Hand are dropped. And addresses: "Yanida › I1 Index tip › 3.2 spans N of the Source". Pure.
const KEY = 'pwc.pins.v1', MAX = 5, SPAN = 6000;
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function createPins(storage) {
  let list = [];
  try { list = JSON.parse(storage?.getItem(KEY) ?? '[]'); if (!Array.isArray(list)) list = []; } catch { list = []; }
  const save = () => { try { storage?.setItem(KEY, JSON.stringify(list)); } catch {} };
  return {
    list: () => list.slice(),
    add(p) {
      if (list.some((q) => q.handId === p.handId && q.code === p.code)) return;
      list.push({ handId: p.handId, code: p.code ?? null, x: +p.x, z: +p.z, label: String(p.label).slice(0, 40) });
      while (list.length > MAX) list.shift();
      save();
    },
    remove(i) { list.splice(i, 1); save(); },
    prune(handIds) { const n = list.length; list = list.filter((q) => handIds.has(q.handId)); if (list.length !== n) save(); },
  };
}

export function address({ hand, handbit, code, x, z }) {
  const d = Math.hypot(x, z) / SPAN, a = Math.atan2(x, -z); // 0 north (-z), clockwise
  const dir = POINTS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
  return [hand, handbit ? `${code} ${handbit}` : null, `${d.toFixed(1)} spans ${dir} of the Source`].filter(Boolean).join(' › ');
}
