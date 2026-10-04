// src/hand/dna.js
// Fingerprint and palm "DNA": the only things about a hand the game keeps. A Print DNA is 44 bytes
// (pattern class, ridge count, a coarse 8 x 8 ridge flow, cores and deltas, a seed); a Palm DNA keeps
// the main lines as 8 points each in a palm frame without size. Both are coarse on purpose and get a
// small random shuffle before they leave the device. Pure: node, workers and the page.
import { printPhase } from '../print/phase.js';

export const PRINT_CLASSES = ['arch', 'tented', 'ulnar', 'radial', 'whorl', 'pocket', 'double', 'accidental'];
// the ridge pattern that draws each class, and whether it is mirrored (a right hand's ulnar side is -x)
export const PATTERN_OF = {
  arch: ['arch', false], tented: ['tented', false], ulnar: ['loop', true], radial: ['loop', false],
  whorl: ['whorl', false], pocket: ['pocket', true], double: ['double', false], accidental: ['double', true],
};
export const LINE_KINDS = ['heart', 'head', 'life', 'fate', 'sun', 'mercury', 'fused', 'other'];

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a bit cursor over a byte array, most significant bit first (safe for 32-bit values)
function bits(bytes) {
  let pos = 0;
  return {
    put(v, n) {
      for (let i = n - 1; i >= 0; i--, pos++) if (Math.floor(v / 2 ** i) % 2) bytes[pos >> 3] |= 0x80 >> (pos & 7);
    },
    get(n) {
      let v = 0;
      for (let i = 0; i < n; i++, pos++) v = v * 2 + ((bytes[pos >> 3] >> (7 - (pos & 7))) & 1);
      return v;
    },
  };
}

// ---------- Print DNA v1: 44 bytes ----------

export function packPrint(p) {
  const out = new Uint8Array(44), w = bits(out);
  w.put(1, 8);
  w.put(p.finger, 4);
  w.put(PRINT_CLASSES.indexOf(p.cls), 4);
  w.put(p.ridgeCount, 5);
  w.put(p.quality, 2);
  w.put(p.scanned ? 1 : 0, 1);
  w.put(p.freq, 4);
  w.put(p.slant, 4);
  const sp = [p.cores[0], p.cores[1], p.deltas[0], p.deltas[1]];
  for (const q of sp) w.put(q ? q[1] * 8 + q[0] : 0, 6); // [col, row] on the 8 x 8 grid
  for (const q of sp) w.put(q ? 1 : 0, 1);
  w.put(0, 4);
  for (let i = 0; i < 64; i++) w.put(p.orient[i], 4);
  w.put(p.seed >>> 0, 32);
  return out;
}

export function unpackPrint(b) {
  const r = bits(b);
  if (r.get(8) !== 1) throw new Error('unknown Print DNA version');
  const finger = r.get(4), cls = PRINT_CLASSES[r.get(4)];
  const ridgeCount = r.get(5), quality = r.get(2), scanned = r.get(1) === 1;
  const freq = r.get(4), slant = r.get(4);
  const cells = [r.get(6), r.get(6), r.get(6), r.get(6)], has = [r.get(1), r.get(1), r.get(1), r.get(1)];
  r.get(4);
  const at = (k) => (has[k] ? [cells[k] % 8, Math.floor(cells[k] / 8)] : null);
  const orient = new Uint8Array(64);
  for (let i = 0; i < 64; i++) orient[i] = r.get(4);
  return {
    finger, cls, ridgeCount, quality, scanned, freq, slant,
    cores: [at(0), at(1)].filter(Boolean), deltas: [at(2), at(3)].filter(Boolean), orient, seed: r.get(32),
  };
}

// where the cores and deltas of each pattern sit on the 8 x 8 grid ([col, row], row 0 at the tip)
const SINGULAR = {
  arch: [[], []],
  tented: [[[4, 3]], [[4, 5]]],
  loop: [[[4, 3]], [[1, 6]]],
  pocket: [[[4, 3]], [[1, 6]]],
  whorl: [[[4, 3]], [[1, 6], [6, 6]]],
  double: [[[3, 3], [5, 4]], [[1, 6], [6, 6]]],
};

// the ridge flow on an 8 x 8 grid, 16 directions (0..π)
export function orientationField(cls, seed) {
  const [pattern, mirror] = PATTERN_OF[cls], o = new Uint8Array(64), e = 0.01;
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    const x = ((i + 0.5) / 8) * 2 - 1, y = 1 - ((j + 0.5) / 8) * 2, xx = mirror ? -x : x;
    const gx = printPhase(pattern, xx + e, y, seed) - printPhase(pattern, xx - e, y, seed);
    const gy = printPhase(pattern, xx, y + e, seed) - printPhase(pattern, xx, y - e, seed);
    let a = Math.atan2(mirror ? -gx : gx, -gy);
    a = ((a % Math.PI) + Math.PI) % Math.PI;
    o[j * 8 + i] = Math.round((a / Math.PI) * 16) % 16;
  }
  return o;
}

// a print that was chosen, not scanned (founders, and the read-by-eye route)
export function synthPrint(finger, cls, seed) {
  const rand = rng(seed);
  const [pattern, mirror] = PATTERN_OF[cls];
  const flip = (p) => (mirror ? [7 - p[0], p[1]] : p.slice());
  const [cores, deltas] = SINGULAR[pattern].map((l) => l.map(flip));
  return {
    finger, cls, ridgeCount: pattern === 'arch' ? 0 : 6 + Math.floor(rand() * 14), quality: 3, scanned: false,
    freq: 9, slant: 0, cores, deltas, orient: orientationField(cls, seed), seed: seed >>> 0,
  };
}

// the privacy shuffle: every field moves by at most one step
export function jitterPrint(p, rand) {
  const nudge = (v, lo, hi) => Math.min(hi, Math.max(lo, v + Math.floor(rand() * 3) - 1));
  return {
    ...p,
    ridgeCount: p.ridgeCount ? nudge(p.ridgeCount, 1, 31) : 0,
    cores: p.cores.map(([x, y]) => [nudge(x, 0, 7), nudge(y, 0, 7)]),
    deltas: p.deltas.map(([x, y]) => [nudge(x, 0, 7), nudge(y, 0, 7)]),
    orient: p.orient.map((o) => (o + Math.floor(rand() * 3) - 1 + 16) % 16),
  };
}

// ---------- Palm DNA v1: 28 + 13 bytes per line ----------

const qx = (x) => Math.max(0, Math.min(63, Math.round(((x + 1) / 2) * 63)));
const qy = (y) => Math.max(0, Math.min(63, Math.round(((y + 0.25) / 2) * 63)));
const dx = (q) => (q / 63) * 2 - 1;
const dy = (q) => (q / 63) * 2 - 0.25;
export const palmBytes = (lines) => 28 + 13 * lines;

export function packPalm(p) {
  const out = new Uint8Array(palmBytes(p.lines.length)), w = bits(out);
  w.put(1, 8);
  w.put(p.side === 'L' ? 1 : 0, 1);
  w.put(0, 7);
  w.put(p.lines.length, 8);
  for (const l of p.lines) {
    w.put(LINE_KINDS.indexOf(l.kind), 4);
    w.put(l.strength, 4);
    for (const [x, y] of l.pts) { w.put(qx(x), 6); w.put(qy(y), 6); }
  }
  for (const c of p.creases) w.put(Math.max(0, Math.min(63, Math.round(c * 63))), 6);
  w.put(0, 4);
  for (const v of p.proportions) w.put(v, 2);
  w.put(0, 6);
  for (const [x, y] of p.triradii) { w.put(qx(x), 6); w.put(qy(y), 6); }
  w.put(0, 4);
  for (const v of p.patterns) w.put(v, 3);
  w.put(0, 1);
  w.put(p.palette, 8);
  w.put(p.seed >>> 0, 32);
  return out;
}

export function unpackPalm(b) {
  const r = bits(b);
  if (r.get(8) !== 1) throw new Error('unknown Palm DNA version');
  const side = r.get(1) ? 'L' : 'R';
  r.get(7);
  const n = r.get(8), lines = [];
  for (let k = 0; k < n; k++) {
    const kind = LINE_KINDS[r.get(4)], strength = r.get(4), pts = [];
    for (let i = 0; i < 8; i++) { const x = dx(r.get(6)); pts.push([x, dy(r.get(6))]); }
    lines.push({ kind, strength, pts });
  }
  const creases = Array.from({ length: 10 }, () => r.get(6) / 63);
  r.get(4);
  const proportions = Array.from({ length: 5 }, () => r.get(2));
  r.get(6);
  const triradii = Array.from({ length: 5 }, () => { const x = dx(r.get(6)); return [x, dy(r.get(6))]; });
  r.get(4);
  const patterns = Array.from({ length: 5 }, () => r.get(3));
  r.get(1);
  const palette = r.get(8), seed = r.get(32);
  return { side, lines, creases, proportions, triradii, patterns, palette, seed };
}

// ---------- transport ----------

export const toB64 = (b) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromB64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
