// src/hand/label.js
// Cuts a hand into handbits as the spec says: each finger into three by its creases, the palm
// into the regions its own lines enclose (a flood fill between the rivers), so the number of palm
// handbits depends on the hand. Pure.
import { fingerAt, fromTemplate, TAIL, BASE_CREASE } from './shape.js';

export const RIVER = -1, CANAL = -2, OUTSIDE = -3;
export const CANAL_HALF = 1.6; // metres
export const waterHalf = (strength) => 3 + 1.5 * strength; // a river's half-width, metres
const FINGER_CODES = ['T', 'I', 'M', 'R', 'L'];
const FINGER_NAMES = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];
// points that lie well inside each palmistry mount on every template hand
const ANCHORS = Object.entries({
  venus: [452, 690], luna: [232, 720], outer: [125, 690], plain: [338, 690],
  heart: [330, 478], jupiter: [284, 428], mercury: [196, 458],
}).map(([k, p]) => [k, fromTemplate(p)]);

function regionName(a) {
  if (a.has('venus')) return 'Mount of Venus';
  if (a.has('luna') && a.has('plain')) return 'Lowlands';
  if (a.has('plain')) return 'Plain of Mars';
  if (a.has('luna')) return 'Mount of Luna';
  if (a.has('outer')) return 'Outer Luna';
  if (a.has('jupiter') && a.has('mercury')) return 'Crown';
  if (a.has('jupiter')) return 'Crown of Jupiter';
  if (a.has('mercury')) return 'Crown of Mercury';
  if (a.has('heart')) return 'Heartland';
  return 'Palm';
}

// the nearest big region to region `id`, searching across rivers and canals
function nearestRegion(label, w, id, ok) {
  const N = label.length, seen = new Uint8Array(N), queue = [];
  for (let i = 0; i < N; i++) if (label[i] === id) { seen[i] = 1; queue.push(i); }
  for (let q = 0; q < queue.length; q++) {
    const p = queue[q], c = p % w;
    for (const n of [c > 0 ? p - 1 : -1, c < w - 1 ? p + 1 : -1, p - w, p + w]) {
      if (n < 0 || n >= N || seen[n] || label[n] === OUTSIDE) continue;
      if (ok(label[n])) return label[n];
      seen[n] = 1;
      queue.push(n);
    }
  }
  return null;
}

export function labelHand(shape, cell = 0.75) {
  // the grid, with four empty cells round the hand
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const grow = (x, y) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); };
  const corners = (f) => [-0.5, 0.5].flatMap((u) => [-TAIL, f.len].map((t) => [f.base[0] + f.side[0] * u * f.width + f.dir[0] * t, f.base[1] + f.side[1] * u * f.width + f.dir[1] * t]));
  for (const [x, y] of shape.outline) grow(x, y);
  for (const f of shape.fingers) for (const [x, y] of corners(f)) grow(x, y);
  const x0 = minX - 4 * cell, y0 = minY - 4 * cell;
  const w = Math.ceil((maxX - minX) / cell) + 8, h = Math.ceil((maxY - minY) / cell) + 8, N = w * h;
  const cx = (c) => x0 + (c + 0.5) * cell, cy = (r) => y0 + (r + 0.5) * cell;
  const label = new Int16Array(N).fill(OUTSIDE);

  // 1. the palm: a scanline fill of the outline
  const poly = shape.outline;
  for (let r = 0; r < h; r++) {
    const Y = cy(r), xs = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > Y !== yj > Y) xs.push(xi + ((Y - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k] - x0) / cell - 0.5)), c1 = Math.min(w - 1, Math.floor((xs[k + 1] - x0) / cell - 0.5));
      for (let c = c0; c <= c1; c++) label[r * w + c] = 0;
    }
  }

  // 2. rivers: distance to the nearest line, stamped segment by segment
  const lineDist = new Float32Array(N).fill(Infinity), lineOf = new Int8Array(N).fill(-1), wet = new Uint8Array(N);
  shape.lines.forEach((l, li) => {
    const half = waterHalf(l.strength), reach = half * 4;
    for (let k = 1; k < l.pts.length; k++) {
      const [ax, ay] = l.pts[k - 1], [bx, by] = l.pts[k], vx = bx - ax, vy = by - ay, vv = vx * vx + vy * vy || 1;
      const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - x0) / cell)), c1 = Math.min(w - 1, Math.ceil((Math.max(ax, bx) + reach - x0) / cell));
      const r0 = Math.max(0, Math.floor((Math.min(ay, by) - reach - y0) / cell)), r1 = Math.min(h - 1, Math.ceil((Math.max(ay, by) + reach - y0) / cell));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const px = cx(c) - ax, py = cy(r) - ay, t = Math.max(0, Math.min(1, (px * vx + py * vy) / vv));
        const d = Math.hypot(px - vx * t, py - vy * t), i = r * w + c;
        if (d < lineDist[i]) { lineDist[i] = d; lineOf[i] = li; }
        if (d < half) wet[i] = 1;
      }
    }
  });
  for (let i = 0; i < N; i++) if (label[i] === 0 && wet[i]) label[i] = RIVER;

  // 3. the palm regions between the rivers (temporary ids from 1000)
  const stack = new Int32Array(N);
  let nextId = 1000;
  for (let i = 0; i < N; i++) {
    if (label[i] !== 0) continue;
    const id = nextId++;
    let sp = 0;
    stack[sp++] = i;
    label[i] = id;
    while (sp) {
      const p = stack[--sp], c = p % w;
      if (c > 0 && label[p - 1] === 0) { label[p - 1] = id; stack[sp++] = p - 1; }
      if (c < w - 1 && label[p + 1] === 0) { label[p + 1] = id; stack[sp++] = p + 1; }
      if (p >= w && label[p - w] === 0) { label[p - w] = id; stack[sp++] = p - w; }
      if (p < N - w && label[p + w] === 0) { label[p + w] = id; stack[sp++] = p + w; }
    }
  }

  // 4. fingers: three handbits each, canals at the creases. The palm keeps whatever lies inside its
  // outline (so the finger bases don't eat the Crown), except the thumb, whose root lies on the thenar.
  const fingerOf = new Int8Array(N).fill(-1), along = new Float32Array(N), across = new Float32Array(N);
  shape.fingers.forEach((f, fi) => {
    const thumb = fi === 0, cs = corners(f);
    const c0 = Math.max(0, Math.floor((Math.min(...cs.map((p) => p[0])) - x0) / cell)), c1 = Math.min(w - 1, Math.ceil((Math.max(...cs.map((p) => p[0])) - x0) / cell));
    const r0 = Math.max(0, Math.floor((Math.min(...cs.map((p) => p[1])) - y0) / cell)), r1 = Math.min(h - 1, Math.ceil((Math.max(...cs.map((p) => p[1])) - y0) / cell));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const i = r * w + c, q = fingerAt(f, cx(c), cy(r));
      if (!q || (thumb ? q.t < 0 && label[i] === RIVER : label[i] !== OUTSIDE)) continue;
      const s = (f.len - q.t) / f.len;
      let crease = Math.min(Math.abs(s - f.creases[0]), Math.abs(s - f.creases[1])) * f.len;
      if (thumb) crease = Math.min(crease, Math.abs(q.t - BASE_CREASE));
      fingerOf[i] = fi;
      along[i] = q.t;
      across[i] = q.u;
      label[i] = crease < CANAL_HALF ? CANAL : fi * 3 + (s < f.creases[0] ? 0 : s < f.creases[1] ? 1 : 2);
    }
  });
  // where a finger meets the palm: the base crease, a canal along the palm's edge
  const reach = Math.ceil((2 * CANAL_HALF) / cell);
  for (let i = 0; i < N; i++) {
    if (fingerOf[i] < 1 || label[i] < 0) continue;
    const c = i % w, r = (i / w) | 0;
    search: for (let dr = -reach; dr <= reach; dr++) for (let dc = -reach; dc <= reach; dc++) {
      const L = label[(r + dr) * w + c + dc];
      if (L >= 1000 || L === RIVER) { label[i] = CANAL; break search; }
    }
  }

  // 5. measure the palm regions, fold tiny ones into a neighbour, name them by their mounts
  const stats = new Map();
  for (let i = 0; i < N; i++) {
    const L = label[i];
    if (L < 1000) continue;
    let s = stats.get(L);
    if (!s) stats.set(L, (s = { id: L, area: 0, sx: 0, sy: 0 }));
    s.area++;
    s.sx += i % w;
    s.sy += (i / w) | 0;
  }
  const palmArea = [...stats.values()].reduce((a, s) => a + s.area, 0), big = (s) => s.area >= palmArea * 0.03;
  for (const s of [...stats.values()]) {
    if (big(s)) continue;
    const into = nearestRegion(label, w, s.id, (L) => L >= 1000 && stats.has(L) && big(stats.get(L)));
    for (let i = 0; i < N; i++) if (label[i] === s.id) label[i] = into ?? RIVER;
    if (into != null) { const t = stats.get(into); t.area += s.area; t.sx += s.sx; t.sy += s.sy; }
    stats.delete(s.id);
  }
  const regions = [...stats.values()].map((s) => ({ id: s.id, area: s.area * cell * cell, cx: cx(s.sx / s.area), cy: cy(s.sy / s.area), anchors: new Set() }));
  for (const [key, [X, Y]] of ANCHORS) {
    const c = Math.floor((X - x0) / cell), r = Math.floor((Y - y0) / cell);
    regions.find((g) => g.id === label[r * w + c])?.anchors.add(key);
  }
  regions.sort((a, b) => a.cy - b.cy); // P1 at the wrist
  const remap = new Map(regions.map((g, k) => [g.id, 15 + k]));
  for (let i = 0; i < N; i++) if (label[i] >= 1000) label[i] = remap.get(label[i]);

  const fs = Array.from({ length: 15 }, () => ({ area: 0, sx: 0, sy: 0 }));
  for (let i = 0; i < N; i++) {
    const L = label[i];
    if (L >= 0 && L < 15) { fs[L].area++; fs[L].sx += i % w; fs[L].sy += (i / w) | 0; }
  }
  const handbits = [
    ...fs.map((s, k) => {
      const fi = (k / 3) | 0, seg = k % 3;
      return {
        code: `${FINGER_CODES[fi]}${seg + 1}`, name: `${FINGER_NAMES[fi]} ${['tip', 'middle', fi === 0 ? 'root' : 'base'][seg]}`,
        kind: seg === 0 ? 'tip' : 'segment', finger: fi, seg, area: s.area * cell * cell, cx: cx(s.sx / (s.area || 1)), cy: cy(s.sy / (s.area || 1)),
      };
    }),
    ...regions.map((g, k) => ({ code: `P${k + 1}`, name: regionName(g.anchors), kind: 'palm', area: g.area, cx: g.cx, cy: g.cy })),
  ];
  return { cell, x0, y0, w, h, label, lineOf, lineDist, fingerOf, along, across, handbits, palmCount: regions.length };
}
