// src/print/phase.js
// Ridge phase of each print class: the ridges are the integer level lines of this function, so
// cos(2π·phase) draws the print. x runs across the fingertip, y towards the tip, both about -1..1.
// The same functions shape the print lands, the class glyphs and the knots the scribbles draw.
// Loops open towards +x; mirror x for the other side. Pure: node, workers and the page.

export const RIDGES = 7; // per unit: about 22 ridges across a print land
const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const segD = (x, y, ax, ay, bx, by) => {
  const vx = bx - ax, vy = by - ay, t = clamp(((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy), 0, 1);
  return Math.hypot(x - ax - vx * t, y - ay - vy * t);
};
const arch = (x, y) => y + 0.38 * Math.exp(-3 * x * x) * (1 - 0.45 * y);
// rings round (cx, cy) that climb one ridge per turn: a single spiral ridge
const spiral = (x, y, cx, cy) => {
  const dx = x - cx, dy = (y - cy) * 1.1;
  return Math.hypot(dx, dy) + Math.atan2(dy, dx) / (TAU * RIDGES);
};

export const PATTERNS = {
  arch,
  tented: (x, y) => y + 0.62 * Math.exp(-2.8 * Math.abs(x)) * (1 - 0.5 * y),
  loop: (x, y) => {
    const d = segD(x, y, -0.02, 0.22, 0.55, -0.72);
    return mix(d, arch(x, y), sstep(0.5, 0.92, d));
  },
  pocket: (x, y) => {
    const d = segD(x, y, 0, 0.2, 0.5, -0.72), r = Math.hypot(x, y - 0.17);
    return mix(mix(spiral(x, y, 0, 0.17), d, sstep(0.13, 0.33, r)), arch(x, y), sstep(0.5, 0.92, d));
  },
  whorl: (x, y) => {
    const r = Math.hypot(x, (y - 0.08) * 1.1);
    return mix(spiral(x, y, 0, 0.08), arch(x, y), sstep(0.6, 0.95, r));
  },
  double: (x, y) => {
    const d = Math.min(segD(x, y, -0.2, 0.3, 0.42, -0.55), segD(x, y, 0.2, -0.02, -0.45, 0.72));
    return mix(d, arch(x, y), sstep(0.45, 0.9, d));
  },
};

// the seed sways the ridges a little, so no two prints of one class are the same
export function printPhase(pattern, x, y, seed = 0) {
  const s = (seed % 1000) * 0.0137;
  return RIDGES * PATTERNS[pattern](x + 0.05 * Math.sin(5.1 * y + s), y + 0.05 * Math.sin(4.3 * x + 2 * s));
}

// the direction of the ridge through (x, y): perpendicular to the phase gradient
export function ridgeAngle(pattern, x, y, seed = 0, e = 0.01) {
  const gx = printPhase(pattern, x + e, y, seed) - printPhase(pattern, x - e, y, seed);
  const gy = printPhase(pattern, x, y + e, seed) - printPhase(pattern, x, y - e, seed);
  return Math.atan2(gx, -gy);
}
