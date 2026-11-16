// src/garden/passport.js
// Your passport: who you met and what you did beyond what your pouch already keeps. Friends are the players
// your whorl braided with, rivals the ones who won a gnome of yours over, gnomes the ones that rode with you;
// and running totals of mushrooms eaten, groves watered and seed clouds caught. Kept on your device.
// profile() turns it, with your pouch and your chart, into the Me page of the atlas. Pure but for storage.
export const STATUS = ['Seedling', 'Sower', 'Gardener', 'Grower', 'Cultivator', 'Bloomkeeper', 'Legend of the desert']; // every two levels a new one
const LISTS = { friend: 'friends', rival: 'rivals', gnome: 'gnomes' }, COUNTS = ['eaten', 'tends', 'clouds'];
export function createPassport(storage, key = 'pwc.passport.v1') {
  let d = null;
  try { d = JSON.parse(storage?.getItem(key)); } catch {}
  if (!d || typeof d !== 'object') d = {};
  for (const k of Object.values(LISTS)) if (!d[k] || typeof d[k] !== 'object') d[k] = {};
  for (const k of COUNTS) d[k] = +d[k] || 0;
  const save = () => { try { storage?.setItem(key, JSON.stringify(d)); } catch {} }, seen = {};
  return {
    get data() { return d; },
    // someone met: 'friend' | 'rival' | 'gnome', by name
    note(kind, name) { const list = d[LISTS[kind]]; if (!list || !name) return; if (list[name] === undefined && Object.keys(list).length >= 60) return; list[name] = (list[name] ?? 0) + 1; save(); },
    // the game's running counts for this session ({ eaten, tends, clouds }): what is new since the last look is added
    sync(counts) { let changed = false; for (const k of COUNTS) { const n = counts[k] ?? 0, was = seen[k] ?? 0; if (n > was) { d[k] += n - was; changed = true; } seen[k] = n; } if (changed) save(); },
  };
}
const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n);
// the Me page: { name, status, level, xp, rows: [[label, value]], sown: [{ sp, n }] (most sown first), friends, rivals, gnomes: [[name, n]] }
export function profile({ pass, species, found, level, xp, planted, seeds, charted, sealed, team, converted, hand }) {
  const of = (kinds) => { let have = 0, all = 0; species.forEach((s, id) => { if (kinds.includes(s.kind)) { all++; if (found.has(id)) have++; } }); return `${have} of ${all}`; };
  const sown = Object.entries(planted).map(([sp, n]) => ({ sp: +sp, n })).sort((a, b) => b.n - a.n || a.sp - b.sp);
  return {
    name: hand?.name ?? 'A traveller', status: STATUS[Math.min(STATUS.length - 1, Math.floor((level - 1) / 2))], level, xp,
    rows: [
      ['Groves sown', sown.reduce((a, s) => a + s.n, 0)], ['Kinds sown', sown.length], ['Seeds carried', seeds],
      ['Flowers, trees found', of(['flower', 'tree'])], ['Mushrooms found', of(['mushroom'])], ['Animals met', of(['bird', 'insect', 'fish', 'animal'])],
      ['Groves watered', pass.tends], ['Seed clouds caught', pass.clouds], ['Mushrooms eaten', pass.eaten],
      ['Places charted', charted], ['Hands sealed', sealed], ['Gnomes on your team', team], ['Gnomes converted', converted],
    ],
    sown: sown.slice(0, 24), friends: top(pass.friends, 5), rivals: top(pass.rivals, 4), gnomes: top(pass.gnomes, 5),
  };
}
