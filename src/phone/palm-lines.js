// src/phone/palm-lines.js
// Palm lines read from a photo, on the phone (spec 7.3 steps 2, 4, 7): a canonical frame from two
// knuckles and the thumb side, a valley map (a crease is darker than the skin round it), and for each
// main line a best path through the valleys near where that line runs on every hand (a Viterbi search
// across the template line). Lines too faint to be there are left out. Out come 8 points per line in
// palm units, as Palm DNA keeps them. Pure: grey images in, numbers out; the photo never leaves.
import { templatePalm, FINGERS, PALM_UNIT } from '../hand/shape.js';

const GUIDE = templatePalm({ seed: 1, fate: true }).lines; // every template line: the same ends, the middle bent by the seed
const KINDS = ['heart', 'head', 'life', 'fate'];
const SUB = 8, OFFSETS = 41, REACH = 0.25; // samples per guide segment; lateral steps; how far either side (palm units)

// box blur (radius r) of a w x h image, via a summed-area table
function blur(g, w, h, r) {
  const S = new Float64Array((w + 1) * (h + 1)), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0, row = 0; x < w; x++) { row += g[y * w + x]; S[(y + 1) * (w + 1) + x + 1] = S[y * (w + 1) + x + 1] + row; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    out[y * w + x] = (S[y1 * (w + 1) + x1] - S[y0 * (w + 1) + x1] - S[y1 * (w + 1) + x0] + S[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
  }
  return out;
}
export function valleys(gray, w, h) {
  const r = Math.max(4, Math.round(Math.min(w, h) / 50)), bg = blur(gray, w, h, r), v = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) v[i] = Math.max(0, bg[i] - gray[i]);
  return blur(v, w, h, 1);
}
const sample = (v, w, h, x, y) => {
  if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) return 0;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, i = y0 * w + x0;
  return (v[i] * (1 - fx) + v[i + 1] * fx) * (1 - fy) + (v[i + w] * (1 - fx) + v[i + w + 1] * fx) * fy;
};

// gray: Float32Array w*h, 0 dark .. 1 light; frame: { toImage([X, Y]) -> [px, py] } (palm units to pixels)
export function readPalmLines(gray, w, h, frame) {
  const v = valleys(gray, w, h);
  let all = 0;
  for (let i = 0; i < v.length; i++) all += v[i];
  const floor = (all / v.length) * 4; // a crease is several times darker-than-its-surroundings than skin on average
  const out = [];
  for (const kind of KINDS) {
    const g = GUIDE.find((l) => l.kind === kind).pts, pts = [];
    for (let j = 0; j < g.length - 1; j++) for (let s = 0; s < SUB; s++) pts.push([g[j][0] + (g[j + 1][0] - g[j][0]) * (s / SUB), g[j][1] + (g[j + 1][1] - g[j][1]) * (s / SUB)]);
    pts.push(g[g.length - 1]);
    const n = pts.length, normals = pts.map((_, i) => { const a = pts[Math.max(0, i - 2)], b = pts[Math.min(n - 1, i + 2)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; });
    const off = (k) => -REACH + (2 * REACH * k) / (OFFSETS - 1);
    const at = (i, k) => [pts[i][0] + normals[i][0] * off(k), pts[i][1] + normals[i][1] * off(k)];
    const score = pts.map((_, i) => Float32Array.from({ length: OFFSETS }, (_, k) => sample(v, w, h, ...frame.toImage(at(i, k)))));
    // Viterbi: the brightest valley path, moving at most two steps sideways per sample
    const best = [Float32Array.from(score[0])], from = [new Int8Array(OFFSETS)];
    for (let i = 1; i < n; i++) {
      const b = new Float32Array(OFFSETS), f = new Int8Array(OFFSETS);
      for (let k = 0; k < OFFSETS; k++) {
        let m = -Infinity, arg = 0;
        for (let d = -2; d <= 2; d++) { const q = k + d; if (q < 0 || q >= OFFSETS) continue; const c = best[i - 1][q] - floor * 0.15 * Math.abs(d); if (c > m) { m = c; arg = d; } }
        b[k] = m + score[i][k]; f[k] = arg;
      }
      best.push(b); from.push(f);
    }
    let k = best[n - 1].indexOf(Math.max(...best[n - 1]));
    const path = new Array(n);
    for (let i = n - 1; i >= 0; i--) { path[i] = k; k += from[i][k]; }
    const strength = path.reduce((a, q, i) => a + score[i][q], 0) / n;
    if (strength < floor) continue; // not there
    const line = Array.from({ length: g.length }, (_, j) => at(j * SUB, path[j * SUB]));
    out.push({ kind, strength: strength > floor * 3 ? 3 : strength > floor * 2 ? 2 : 1, pts: line.map(([x, y]) => [Math.max(-1, Math.min(1, x)), Math.max(-0.25, Math.min(1.75, y))]) });
  }
  return out;
}

// palm units <-> image pixels from the index and little-finger knuckles and the wrist: a similarity, mirrored
// when the wrist would otherwise land above the knuckles (the wrist is below them on every palm). Left and
// right hands, palm or back, all read as a right palm.
export function frameFromKnuckles(indexPx, littlePx, wristPx) {
  const at = (id) => FINGERS.find((f) => f.id === id).base.map((q) => q / PALM_UNIT);
  const A = at('I'), B = at('L');
  const mul = (p, q) => [p[0] * q[0] - p[1] * q[1], p[0] * q[1] + p[1] * q[0]], div = (p, q) => { const d = q[0] * q[0] + q[1] * q[1]; return [(p[0] * q[0] + p[1] * q[1]) / d, (p[1] * q[0] - p[0] * q[1]) / d]; };
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1]], add = (p, q) => [p[0] + q[0], p[1] + q[1]], conj = (p) => [p[0], -p[1]];
  const make = (flip) => {
    const f = flip ? conj : (p) => p, m = div(sub(littlePx, indexPx), sub(f(B), f(A))), t = sub(indexPx, mul(m, f(A)));
    return { toImage: (P) => add(mul(m, f(P)), t), toPalm: (p) => f(div(sub(p, t), m)) };
  };
  const a = make(false);
  return a.toPalm(wristPx)[1] < Math.min(A[1], B[1]) ? a : make(true);
}
