// src/garden/foxfire.js
// Mushrooms, and the foxfire they bring. Fungi feed on what died: every dead grove grows a wild mushroom,
// and gardeners can plant and grow their own. Eat one (fly through it) and for a while you see the world
// as the glowing fungi do: the Bioluminescent Synthwave state. It rises in a second and a half, holds,
// and fades in three. Eating more while it lasts chains: more time, a higher multiplier on everything
// you earn. A mushroom you ate takes five minutes to fruit again for you. Pure.
export const FOXFIRE = { first: 25000, more: 15000, max: 60000, rise: 1500, fade: 3000, maxMult: 5, regrow: 300000 };
const mix = (a) => { a = Math.imul(a ^ (a >>> 16), 2246822507); a = Math.imul(a ^ (a >>> 13), 3266489909); return (a ^ (a >>> 16)) >>> 0; };

// the wild mushroom a grove grows: only when it is dead (dry === 2), always the same kind for that grove
export const wildMushroom = (grove, fungi) => (grove.dry === 2 && fungi.length ? fungi[mix(grove.id | 0) % fungi.length] : null);

export function createFoxfire() {
  let from = -Infinity, until = -Infinity, chain = 0;
  const eaten = new Map(); // grove id -> when you ate it
  return {
    // returns the place in the chain (1 for the first)
    eat(now) {
      if (now > until + FOXFIRE.fade) { chain = 0; from = now; until = now + FOXFIRE.first; } else until = Math.min(now + FOXFIRE.max, Math.max(until, now) + FOXFIRE.more);
      chain = Math.min(FOXFIRE.maxMult - 1, chain + 1);
      return chain;
    },
    // 0 calm .. 1 full foxfire: how far the world has turned
    level: (now) => Math.max(0, Math.min(1, (now - from) / FOXFIRE.rise, 1 - (now - until) / FOXFIRE.fade)),
    active: (now) => now >= from && now < until, // while the rewards count
    left: (now) => Math.max(0, Math.ceil((until - now) / 1000)),
    mult: (now) => (now >= from && now < until + FOXFIRE.fade ? 1 + chain : 1),
    get chain() { return chain; },
    canEat: (id, now) => now - (eaten.get(id) ?? -Infinity) > FOXFIRE.regrow,
    ate(id, now) { eaten.set(id, now); if (eaten.size > 2000) eaten.clear(); },
  };
}

// Wild mushrooms that stand on every Hand from its first day, so the foxfire (and its music, and the gnomes) can be
// found before any grove has had time to die. Three long-dead groves per Hand, each near the middle of a plot of
// its own, the same for every player (from the Hand's id), and never written to the map: their ids start at
// WILD_BASE, above any planted grove's and still small enough for the room to pass on (24 bits).
export const WILD_BASE = 16000000;
const hashOf = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
export function wildRings(hand, species) {
  const bits = hand.data?.handbits ?? [], h = hashOf(hand.id), out = [], n = Math.min(3, bits.length);
  for (let k = 0; k < n; k++) {
    const bit = (h + k * Math.max(1, Math.floor(bits.length / 3))) % bits.length, a = ((h >>> (k * 5)) % 628) / 100;
    out.push({ id: WILD_BASE + (h % 19000) * 40 + k, hand: hand.id, bit, x: bits[bit].cx + Math.cos(a) * 4, y: bits[bit].cy + Math.sin(a) * 4, sp: (h + k * 97) % species, stage: 2, tended: 0, big: 0, hab: 'dune', wild: true });
  }
  return out;
}
