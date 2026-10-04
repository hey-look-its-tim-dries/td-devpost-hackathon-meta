// src/hand/bake.js
// A labelled hand becomes terrain: heights in metres (an island with mounts, finger ridges and
// domed print lands, carved by river valleys and canals), water depth, the skin's ridge phase
// (stored as cos and sin so it interpolates cleanly on the GPU) and per-cell info for the shader.
import { printPhase } from '../print/phase.js';
import { PATTERN_OF, rng } from './dna.js';
import { RIVER, CANAL, OUTSIDE, CANAL_HALF, waterHalf } from './label.js';
import { fromTemplate, BASE_CREASE } from './shape.js';

export const KIND = { tip: 1, segment: 2, palm: 3, river: 4, canal: 5 };
export const COAST = 16;
// the mounts as hills: centre (template units), height (m), spread (m)
const HILLS = [[[455, 690], 18, 60], [[180, 700], 10, 55], [[150, 470], 7, 30], [[240, 440], 7, 30], [[330, 430], 7, 30], [[420, 440], 7, 30]]
  .map(([p, a, s]) => [fromTemplate(p), a, s]);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// metres from each cell to the nearest outside cell (two-pass chamfer)
function chamfer(label, w, h, cell) {
  const d = new Float32Array(w * h), a = cell, b = cell * Math.SQRT2;
  for (let i = 0; i < w * h; i++) d[i] = label[i] === OUTSIDE ? 0 : 1e9;
  for (let r = 1; r < h - 1; r++) for (let c = 1; c < w - 1; c++) {
    const i = r * w + c;
    if (d[i]) d[i] = Math.min(d[i], d[i - 1] + a, d[i - w] + a, d[i - w - 1] + b, d[i - w + 1] + b);
  }
  for (let r = h - 2; r > 0; r--) for (let c = w - 2; c > 0; c--) {
    const i = r * w + c;
    if (d[i]) d[i] = Math.min(d[i], d[i + 1] + a, d[i + w] + a, d[i + w + 1] + b, d[i + w - 1] + b);
  }
  return d;
}

export function bakeHand(shape, lab, prints) {
  const { w, h, cell, x0, y0, label } = lab, N = w * h;
  const height = new Float32Array(N), water = new Float32Array(N), cos = new Float32Array(N), sin = new Float32Array(N), info = new Uint8Array(N * 4);
  const coastDist = chamfer(label, w, h, cell);
  const rand = rng(shape.seed);
  const hills = HILLS.map(([[hx, hy], a, s]) => [hx, hy, a * (0.75 + rand() * 0.5), 2 * s * s]);
  const tone = (L) => shape.palette * 3 + (L < 0 ? 0 : ((Math.imul(L + 1, 0x9e3779b1) ^ shape.seed) >>> 0) % 3);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const i = r * w + c, L = label[i];
    if (L === OUTSIDE) continue;
    const X = x0 + (c + 0.5) * cell, Y = y0 + (r + 0.5) * cell;
    let z = 22, cut = 0, phase = 0, kind, strength = 0; // relief, faded to the beach at the end, then the valleys cut in
    for (const [hx, hy, a, s2] of hills) z += a * Math.exp(-((X - hx) ** 2 + (Y - hy) ** 2) / s2);
    const fi = lab.fingerOf[i];
    if (fi >= 0) {
      const f = shape.fingers[fi], hw = f.width / 2, u = lab.across[i], t = lab.along[i], s = (f.len - t) / f.len;
      z += 9 * Math.max(0, 1 - (u / hw) ** 2) * sstep(-10, 25, t); // a ridge along the finger
      let crease = Math.min(Math.abs(s - f.creases[0]), Math.abs(s - f.creases[1])) * f.len;
      if (fi === 0) crease = Math.min(crease, Math.abs(t - BASE_CREASE)); // the thumb's base crease lies on the thenar
      cut += 4 * (L === CANAL ? 1 : 1 - sstep(CANAL_HALF, 6, crease)); // canal valleys (the other base creases follow the palm's edge)
      if (L === CANAL) {
        kind = KIND.canal;
        phase = u / 7; // a stitch every 7 m across the canal
        water[i] = 1;
      } else if (s < f.creases[0]) {
        kind = KIND.tip;
        strength = 255;
        const ct = f.len - (f.len * f.creases[0]) / 2 - hw * 0.15, qx = u / hw, qy = (t - ct) / hw;
        z += 8 * Math.max(0, 1 - qx * qx - 0.6 * qy * qy); // a domed print land
        const p = prints[fi], [pattern, mirror] = PATTERN_OF[p.cls];
        phase = printPhase(pattern, (mirror ? -qx : qx) * 1.05, qy * 0.95, p.seed);
      } else {
        kind = KIND.segment;
        strength = 150;
        phase = t / 3.6 + 0.8 * Math.sin(u * 0.11 + fi); // ridges across the finger
      }
    } else if (L === RIVER) {
      kind = KIND.river;
    } else {
      kind = KIND.palm;
      strength = 120;
      phase = Y / 3.6 + 2.6 * Math.sin(X * 0.0154 + Y * 0.005) + 1.2 * Math.sin(X * 0.033 - Y * 0.014 + 1.3);
    }
    const li = lab.lineOf[i];
    if (li >= 0 && (fi < 0 || lab.along[i] < 0)) { // rivers carve the palm, and the finger tails over them
      const st = shape.lines[li].strength, half = waterHalf(st);
      cut += (6 + 4 * st) * (1 - sstep(half, half * 3.5, lab.lineDist[i]));
      if (L === RIVER) water[i] = 1.5 + 0.8 * st;
    }
    height[i] = Math.max(0.3, z * sstep(0, 45, coastDist[i]) - cut); // every hill slopes down to a beach
    cos[i] = Math.cos(2 * Math.PI * phase);
    sin[i] = Math.sin(2 * Math.PI * phase);
    const coast = label[i - 1] === OUTSIDE || label[i + 1] === OUTSIDE || label[i - w] === OUTSIDE || label[i + w] === OUTSIDE;
    info[i * 4] = tone(L);
    info[i * 4 + 1] = L >= 0 ? L + 1 : 0;
    info[i * 4 + 2] = kind | (coast ? COAST : 0);
    info[i * 4 + 3] = strength;
  }
  return { w, h, cell, x0, y0, height, water, cos, sin, info };
}
