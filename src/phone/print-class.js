// src/phone/print-class.js
// A fingertip close-up read on the phone (spec 7.2 steps 2-6): the ridge orientation from the gradient
// structure tensor on 8 px blocks, smoothed; cores, deltas and whorl centres from the Poincaré index;
// the Henry class from them; the ridge count from core to delta; then reduced to an 8 x 8 field in 16
// directions and shuffled into Print DNA. Minutiae are never computed. Pure: a grey image in, numbers out.
import { packPrint, jitterPrint, rng, orientationField } from '../hand/dna.js';

const B = 8, SMOOTH = 2; // block size (px); smoothing passes
const CLASSES = ['arch', 'tented', 'ulnar', 'radial', 'whorl', 'pocket', 'double'];
// each class's own ridge flow (the one its print lands grow from), for a few seeds: what a reading is matched against
const TEMPLATES = CLASSES.flatMap((cls) => [11, 23, 37, 51].map((seed) => ({ cls, o: orientationField(cls, seed) })));
const wrap = (a) => { while (a > Math.PI / 2) a -= Math.PI; while (a <= -Math.PI / 2) a += Math.PI; return a; };

// orientation per block: angle of the ridges, 0..π, measured like dna.js orientationField (atan2(gx, -gy), y up)
export function field(gray, w, h) {
  const bw = Math.floor(w / B), bh = Math.floor(h / B), c2 = new Float32Array(bw * bh), s2 = new Float32Array(bw * bh), en = new Float32Array(bw * bh);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const gx = gray[y * w + x + 1] - gray[y * w + x - 1], gy = -(gray[(y + 1) * w + x] - gray[(y - 1) * w + x]); // y up
    const bx = Math.min(bw - 1, (x / B) | 0), by = Math.min(bh - 1, (y / B) | 0), i = by * bw + bx;
    c2[i] += gx * gx - gy * gy; s2[i] += 2 * gx * gy; en[i] += gx * gx + gy * gy;
  }
  // smooth the doubled-angle vectors over 3 x 3 blocks, twice
  for (let pass = 0; pass < SMOOTH; pass++) {
    const c = Float32Array.from(c2), s = Float32Array.from(s2);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      let a = 0, b = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= bw || Y >= bh) continue; a += c[Y * bw + X]; b += s[Y * bw + X]; }
      c2[y * bw + x] = a; s2[y * bw + x] = b;
    }
  }
  const theta = new Float32Array(bw * bh), ok = new Uint8Array(bw * bh);
  let mean = 0;
  for (let i = 0; i < en.length; i++) mean += en[i] / en.length;
  for (let i = 0; i < theta.length; i++) {
    theta[i] = 0.5 * Math.atan2(s2[i], c2[i]) + Math.PI / 2; // the gradient's direction turned a quarter: the ridge
    ok[i] = en[i] > mean * 0.25 ? 1 : 0; // the background has no ridges
  }
  return { theta, ok, bw, bh };
}

// Poincaré index round each block corner, on a ring of radius 2 blocks: +1 core, -1 delta, +2 whorl centre
const RING2 = [[-2, -2], [-1, -2], [0, -2], [1, -2], [2, -2], [2, -1], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [-1, 2], [-2, 2], [-2, 1], [-2, 0], [-2, -1]];
const RING1 = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
export function singular({ theta, ok, bw, bh }, ring = RING2, minHits = 2) {
  const found = [];
  const R = Math.max(...ring.map(([dx]) => Math.abs(dx)));
  for (let y = R; y < bh - R; y++) for (let x = R; x < bw - R; x++) {
    if (ring.some(([dx, dy]) => !ok[(y + dy) * bw + x + dx])) continue;
    let sum = 0;
    for (let k = 0; k < ring.length; k++) { const [ax, ay] = ring[k], [bx, by] = ring[(k + 1) % ring.length]; sum += wrap(theta[(y + by) * bw + x + bx] - theta[(y + ay) * bw + x + ax]); }
    const idx = -Math.round(sum / Math.PI); // the ring runs clockwise in the y-up frame the angles are measured in
    if (idx !== 0) found.push({ x: x + 0.5, y: y + 0.5, idx });
  }
  // neighbouring hits are one point: cluster them
  const pts = [];
  for (const f of found) {
    const p = pts.find((q) => q.idx === f.idx && Math.hypot(q.x - f.x, q.y - f.y) < 3);
    if (p) { p.x = (p.x * p.n + f.x) / (p.n + 1); p.y = (p.y * p.n + f.y) / (p.n + 1); p.n++; } else pts.push({ ...f, n: 1 });
  }
  return pts.filter((p) => p.n >= minHits || p.idx === 2);
}

export { RING1, RING2 };
export function classifyPrint(gray, w, h) {
  const F = field(gray, w, h), pts = singular(F);
  let cores = pts.filter((p) => p.idx === 1), deltas = pts.filter((p) => p.idx === -1);
  const loopCores = cores.slice();
  const whorls = pts.filter((p) => p.idx === 2);
  if (whorls.length) cores = [{ x: whorls[0].x, y: whorls[0].y }, ...cores];
  // the ridge count: ridges crossed on the straight line from the core to the nearest delta
  let ridgeCount = 0;
  const c = cores[0], dl = c && deltas[0];
  if (c && dl) {
    const x0 = c.x * B, y0 = c.y * B, x1 = dl.x * B, y1 = dl.y * B, n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    let prev = null, m = 0;
    for (let i = 0; i <= n; i++) m += gray[Math.round(y0 + ((y1 - y0) * i) / n) * w + Math.round(x0 + ((x1 - x0) * i) / n)] / (n + 1);
    for (let i = 0; i <= n; i++) { const v = gray[Math.round(y0 + ((y1 - y0) * i) / n) * w + Math.round(x0 + ((x1 - x0) * i) / n)] < m; if (prev === false && v) ridgeCount++; prev = v; }
  }
  // reduce: 8 x 8 cells, 16 directions; singular points on the same grid ([col, row], row 0 at the tip)
  const orient = new Uint8Array(64), cell = (p) => [Math.min(7, Math.floor((p.x / F.bw) * 8)), Math.min(7, Math.floor((p.y / F.bh) * 8))];
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    let a = 0, b = 0;
    for (let y = Math.floor((j * F.bh) / 8); y < ((j + 1) * F.bh) / 8; y++) for (let x = Math.floor((i * F.bw) / 8); x < ((i + 1) * F.bw) / 8; x++) { const t = F.theta[y * F.bw + x]; a += Math.cos(2 * t); b += Math.sin(2 * t); }
    let t = 0.5 * Math.atan2(b, a);
    t = ((t % Math.PI) + Math.PI) % Math.PI;
    orient[j * 8 + i] = Math.round((t / Math.PI) * 16) % 16;
  }
  // the class: the template whose flow agrees best with this one, cell by cell (doubled angles, ridges only)
  const okCell = new Float32Array(64);
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    let n = 0, m = 0;
    for (let y = Math.floor((j * F.bh) / 8); y < ((j + 1) * F.bh) / 8; y++) for (let x = Math.floor((i * F.bw) / 8); x < ((i + 1) * F.bw) / 8; x++) { n++; m += F.ok[y * F.bw + x]; }
    okCell[j * 8 + i] = n ? m / n : 0;
  }
  const agree = (o) => { let a = 0, wsum = 0; for (let k = 0; k < 64; k++) { a += okCell[k] * Math.cos(((o[k] - orient[k]) / 16) * 2 * Math.PI); wsum += okCell[k]; } return a / (wsum || 1); };
  const scores = {};
  for (const t of TEMPLATES) scores[t.cls] = Math.max(scores[t.cls] ?? -1, agree(t.o));
  let cls = CLASSES.reduce((a, b) => (scores[b] > scores[a] ? b : a));
  // a pocket and a loop differ only in a spiral smaller than a cell: the loop shows its one core, the pocket's spiral cancels out
  if ((cls === 'pocket' || cls === 'ulnar') && Math.abs(scores.pocket - scores.ulnar) < 0.05) cls = loopCores.length === 1 ? 'ulnar' : 'pocket';
  return { cls, scores, cores: cores.slice(0, 2).map(cell), deltas: deltas.slice(0, 2).map(cell), ridgeCount: Math.min(31, ridgeCount), orient, quality: Math.min(3, pts.length ? 3 : 2) };
}

// the reading as Print DNA, with the privacy shuffle (spec 7.2 step 6): every field moved by at most one step
export function toPrintDNA(r, finger, seed) {
  const rand = rng(seed ^ 0x9e3779b9);
  return packPrint(jitterPrint({ finger, cls: r.cls, ridgeCount: r.ridgeCount, quality: r.quality, scanned: true, freq: 9, slant: 0, cores: r.cores, deltas: r.deltas, orient: r.orient, seed: seed >>> 0 }, rand));
}
