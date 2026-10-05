// src/atelier/strokes.js
// A line traced on the drawing of a palm, in the form the Palm DNA keeps: 8 points along it in palm
// units (the index to little-finger knuckle distance is 1), clamped to the DNA's ranges. Pure.
import { PALM_UNIT } from '../hand/shape.js';

const MIN_LENGTH = 60; // hand metres: shorter is a tap, not a line
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// how the template hand sits in a drawing area (it spans about -180..290 m across, 0..610 m up)
export function palmView(x, y, w, h) {
  const k = Math.min(w / 470, h / 640);
  return { k, ox: x + w / 2 - 55 * k, oy: y + h / 2 + 305 * k };
}
export const toPixel = (v, [X, Y]) => [v.ox + X * v.k, v.oy - Y * v.k];
export const toMetres = (v, [px, py]) => [(px - v.ox) / v.k, (v.oy - py) / v.k];

function resample(p, n) {
  const cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const out = [];
  for (let k = 0, j = 1; k < n; k++) {
    const s = (cum[cum.length - 1] * k) / (n - 1);
    while (j < p.length - 1 && cum[j] < s) j++;
    const t = (s - cum[j - 1]) / Math.max(1e-9, cum[j] - cum[j - 1]);
    out.push([p[j - 1][0] + (p[j][0] - p[j - 1][0]) * t, p[j - 1][1] + (p[j][1] - p[j - 1][1]) * t]);
  }
  return out;
}

export function strokeToLine(view, pixels) {
  if (!pixels || pixels.length < 2) return null;
  const m = pixels.map((p) => toMetres(view, p));
  let len = 0;
  for (let i = 1; i < m.length; i++) len += Math.hypot(m[i][0] - m[i - 1][0], m[i][1] - m[i - 1][1]);
  if (len < MIN_LENGTH) return null;
  return resample(m, 8).map(([X, Y]) => [clamp(X / PALM_UNIT, -1, 1), clamp(Y / PALM_UNIT, -0.25, 1.75)]);
}

export const lineToPixels = (view, pts) => pts.map(([x, y]) => toPixel(view, [x * PALM_UNIT, y * PALM_UNIT]));
