// src/garden/bouquet.js
// "I am what I have sown." A gardener's whorl wears their whole history: every kind they planted, in
// the order they planted it, as small flowers and trees along the strands. A beginner is a bare
// scribble; over days and months it becomes a flying bouquet of hundreds. The body reads from head
// (what you sowed first) to tail (what you sowed last); a kind you sowed often has more and larger
// flowers; what you sowed on the same day rides the same strands. So the moment, the order and the
// amount all show, and no two gardeners look alike. Pure.
const mix = (a) => { a = Math.imul(a ^ (a >>> 16), 2246822507); a = Math.imul(a ^ (a >>> 13), 3266489909); return (a ^ (a >>> 16)) >>> 0; };
const unit = (a) => mix(a) / 4294967296;

// the log: [[species, how many, day], ...] in the order sown. The same kind on the same day folds into
// one entry; past `max` entries the two oldest fold together (nothing is ever dropped from the count).
export function logPlanting(log, sp, day, n = 1, max = 300) {
  const out = log.map((e) => e.slice()), last = out.at(-1);
  if (last && last[0] === sp && last[2] === day) last[1] += n; else out.push([sp, n, day]);
  while (out.length > max) { const [a, b] = out; out.splice(0, 2, [a[1] >= b[1] ? a[0] : b[0], a[1] + b[1], a[2]]); }
  return out;
}

// the ornaments of a whorl with `strands` strands: [{ sp, strand, at (0 head .. 1 tail), size, phase }]
export function bouquet(log, { strands = 24, max = 420 } = {}) {
  const total = log.reduce((a, e) => a + e[1], 0);
  if (!total) return [];
  const count = max * (1 - Math.exp(-Math.sqrt(total) / 60)), W = log.reduce((a, e) => a + Math.sqrt(e[1]), 0), out = [];
  let before = 0;
  log.forEach(([sp, n, day], k) => {
    const w = Math.sqrt(n) / W, m = Math.max(1, Math.round(count * w)), home = mix(day * 7919 + 13) % strands, big = Math.min(2.2, 0.7 + 0.18 * Math.log2(1 + n));
    for (let j = 0; j < m; j++) {
      const seed = (k * 40503 + j * 9973 + sp * 131) | 0;
      out.push({ sp, strand: (home + (j % 3) + (mix(sp) % 2)) % strands, at: Math.min(0.98, Math.max(0.02, 0.06 + 0.88 * (before + (w * (j + 0.5)) / m) + (unit(seed) - 0.5) * 0.02)), size: big * (0.85 + 0.3 * unit(seed + 1)), phase: unit(seed + 2) * Math.PI * 2 });
    }
    before += w;
  });
  if (out.length > max) out.length = max;
  return out;
}

// what a gardener tells the room so others can draw their bouquet: the first `max` kinds in the order first
// sown, each with how much (on a log scale, 0..63): [species, weight, species, weight, ...]
export function signature(log, max = 24) {
  const totals = new Map();
  for (const [sp, n] of log) totals.set(sp, (totals.get(sp) ?? 0) + n);
  return [...totals].slice(0, max).flatMap(([sp, n]) => [sp, Math.min(63, Math.round(Math.log2(n + 1) * 4))]);
}
export function fromSignature(ints) {
  if (!Array.isArray(ints) || ints.length % 2 || !ints.every((v) => Number.isInteger(v) && v >= 0 && v < 4096)) return [];
  const out = [];
  for (let i = 0; i < ints.length; i += 2) { if (ints[i + 1] > 63) return []; out.push([ints[i], Math.max(1, Math.round(2 ** (ints[i + 1] / 4)) - 1), i / 2]); }
  return out;
}
