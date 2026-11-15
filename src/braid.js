// src/braid.js
// The greeting (spec 9): when you fly within `radius` of another player, your swarms braid for a few
// seconds. k eases 0 -> 1 in 0.5 s, holds `hold` s, eases back; one braid at a time, the nearest
// player; the same player not again within `cooldown` s. Pure.
export function createBraid({ radius = 220, hold = 3, cooldown = 30, rise = 0.5 } = {}) {
  let cur = null; // { id, t }
  const last = new Map(); // id -> seconds since its braid ended
  return {
    update(dt, me, others) {
      for (const [id, t] of last) last.set(id, t + dt);
      if (cur) {
        cur.t += dt;
        if (cur.t >= rise + hold + rise) { last.set(cur.id, 0); cur = null; return null; }
        const k = cur.t < rise ? cur.t / rise : cur.t < rise + hold ? 1 : 1 - (cur.t - rise - hold) / rise;
        return { id: cur.id, k };
      }
      let best = null, bd = radius;
      for (const o of others) {
        const d = Math.hypot(o.pos[0] - me[0], o.pos[1] - me[1], o.pos[2] - me[2]);
        if (d < bd && (last.get(o.id) ?? Infinity) >= cooldown) { bd = d; best = o.id; }
      }
      if (best === null) return null;
      cur = { id: best, t: dt };
      return { id: best, k: dt / rise };
    },
  };
}
