// src/hand/shape.js
// The hand as a map: a canonical right hand, palm view, in metres. The wrist centre is the origin,
// X runs towards the thumb, Y towards the fingertips, and 1 span (wrist to middle fingertip) is
// 600 m. The lines come from the Palm DNA; the outline and fingers are the same for everyone (hand
// size and shape are never read, so they can't identify anyone). Pure.
import { rng } from './dna.js';

export const MPU = 600 / 770; // metres per unit of the drawing the template was made on
export const fromTemplate = ([x, y]) => [(x - 292) * MPU, (832 - y) * MPU];
export const PALM_UNIT = 212.9; // index to little-finger knuckle, metres
export const TAIL = 11; // finger bases tuck this far under the palm edge
export const BASE_CREASE = 2.3; // where a finger meets the palm, along the finger
const EXTEND = 10; // a line ending this close to another line or the coast is taken to meet it

const cubic = (a, b, c, d, t) => {
  const u = 1 - t;
  return [0, 1].map((k) => u * u * u * a[k] + 3 * u * u * t * b[k] + 3 * u * t * t * c[k] + t * t * t * d[k]);
};

// the palm outline, as cubic pieces in template units
const PALM_PATH = [
  [[118, 432], [100, 520], [96, 640], [128, 742]],
  [[128, 742], [140, 790], [160, 815], [175, 832]],
  [[175, 832], [175, 832], [410, 832], [410, 832]],
  [[410, 832], [440, 790], [498, 720], [505, 640]],
  [[505, 640], [510, 560], [490, 500], [468, 470]],
  [[468, 470], [468, 470], [462, 405], [462, 405]],
  [[462, 405], [420, 380], [200, 385], [118, 432]],
];
export const OUTLINE = PALM_PATH.flatMap(([a, b, c, d]) => Array.from({ length: 16 }, (_, i) => fromTemplate(cubic(a, b, c, d, i / 16))));

// id, base (template units), length, width, tilt in degrees (clockwise in the template)
export const FINGERS = [
  ['T', 470, 618, 252, 80, 28],
  ['I', 420, 404, 290, 68, 7],
  ['M', 330, 396, 334, 72, 1],
  ['R', 240, 404, 292, 68, -3.5],
  ['L', 150, 446, 228, 60, -10],
].map(([id, bx, by, len, width, deg]) => {
  const a = (deg * Math.PI) / 180;
  return { id, base: fromTemplate([bx, by]), dir: [Math.sin(a), Math.cos(a)], side: [Math.cos(a), -Math.sin(a)], len: len * MPU, width: width * MPU };
});

// the template lines as cubic control points; their ends reach past the coast or the next line
const TEMPLATE_LINES = {
  heart: [[88, 521], [210, 480], [300, 472], [404, 378]],
  head: [[486, 465], [380, 520], [250, 560], [80, 624]],
  life: [[482, 460], [380, 560], [352, 690], [394, 852]],
  fate: [[300, 852], [300, 740], [296, 650], [284, 532]],
  sun: [[240, 494], [242, 462], [244, 432], [247, 378]],
  mercury: [[196, 852], [184, 760], [170, 690], [150, 592]],
  fused: [[80, 566], [220, 524], [360, 488], [488, 466]],
};
const TRIRADII = [[205, 430], [285, 420], [370, 425], [440, 445], [300, 800]];
const toPalm = (p) => fromTemplate(p).map((v) => v / PALM_UNIT);

// A synthetic palm (founders, tests, the read-by-eye route): the template lines, each bent a little
// by the seed, sampled to 8 points as the Palm DNA stores them.
export function templatePalm({ seed = 1, fate = true, sun = false, mercury = false, fused = false, palette = 2, side = 'R' } = {}) {
  const rand = rng(seed);
  const kinds = fused ? ['fused', 'life'] : ['heart', 'head', 'life'];
  if (fate) kinds.push('fate');
  if (sun) kinds.push('sun');
  if (mercury) kinds.push('mercury');
  const lines = kinds.map((kind) => {
    const c = TEMPLATE_LINES[kind].map(([x, y], i) => (i === 0 || i === 3 ? [x, y] : [x + (rand() - 0.5) * 24, y + (rand() - 0.5) * 24]));
    if (kind === 'fate' && fused) c[3] = [282, 490]; // up to the fused crease, which runs higher than a head line
    return { kind, strength: 1 + Math.floor(rand() * 3), pts: Array.from({ length: 8 }, (_, i) => toPalm(cubic(...c, i / 7))) };
  });
  return {
    side, lines,
    creases: FINGERS.flatMap((f) => (f.id === 'T' ? [0.36, 0.68] : [0.3, 0.6]).map((v) => v + (rand() - 0.5) * 0.04)),
    proportions: [1, 1, 1, 1, 1],
    triradii: TRIRADII.map(toPalm),
    patterns: [0, 0, 0, 0, 0],
    palette, seed: seed >>> 0,
  };
}

// Catmull-Rom through the points, 6 steps per span
function smooth(p) {
  const out = [];
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
    for (let k = 0; k < 6; k++) {
      const t = k / 6, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((d) => 0.5 * (2 * p1[d] + (p2[d] - p0[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (3 * p1[d] - p0[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  out.push(p[p.length - 1]);
  return out;
}

function extend(p) {
  const ext = (from, to) => {
    const ex = from[0] - to[0], ey = from[1] - to[1], l = Math.hypot(ex, ey) || 1;
    return [from[0] + (ex / l) * EXTEND, from[1] + (ey / l) * EXTEND];
  };
  return [ext(p[0], p[1]), ...p, ext(p[p.length - 1], p[p.length - 2])];
}

// a palm object (unpacked Palm DNA) as a shape in hand metres
export function handShape(palm) {
  return {
    outline: OUTLINE,
    fingers: FINGERS.map((f, i) => ({ ...f, creases: [palm.creases[i * 2], palm.creases[i * 2 + 1]] })),
    lines: palm.lines.map((l) => ({ kind: l.kind, strength: l.strength, pts: extend(smooth(l.pts.map(([x, y]) => [x * PALM_UNIT, y * PALM_UNIT]))) })),
    palette: palm.palette, seed: palm.seed, side: palm.side,
  };
}

// (X, Y) in a finger's own frame: u across, t along from its base; null when outside the finger
export function fingerAt(f, X, Y) {
  const ex = X - f.base[0], ey = Y - f.base[1], hw = f.width / 2;
  const u = ex * f.side[0] + ey * f.side[1], t = ex * f.dir[0] + ey * f.dir[1];
  if (t < -TAIL || t > f.len || Math.abs(u) > hw) return null;
  if (t > f.len - hw && u * u + (t - (f.len - hw)) ** 2 > hw * hw) return null; // the round tip
  return { u, t };
}

export function inPolygon(poly, X, Y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > Y !== yj > Y && X < ((xj - xi) * (Y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const insideHand = (shape, X, Y) => inPolygon(shape.outline, X, Y) || shape.fingers.some((f) => fingerAt(f, X, Y));
