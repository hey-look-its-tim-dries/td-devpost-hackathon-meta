// src/atelier/glyphs.js
// A print class as an inked doodle in the style of Tim's reference sheet: broken ridges inside a
// ragged oval, drawn from the same ridge functions that grow the print lands, so the icon always
// matches the land.
import { printPhase } from '../print/phase.js';
import { PATTERN_OF } from '../hand/dna.js';

const hash2 = (i, j) => { let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1); h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };
const noise = (x, y) => {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
};
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function glyph(cls, w, h, seed = 1) {
  const [pattern, mirror] = PATTERN_OF[cls];
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data, s = seed * 1.7;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const x = (px - w / 2) / (w * 0.41), y = (h / 2 - py) / (h * 0.45), r = Math.hypot(x, y);
    const edge = 0.9 + 0.09 * noise(Math.atan2(y, x) * 1.6 + s, s);
    if (r > edge) continue;
    const ph = printPhase(pattern, mirror ? -x : x, y, seed), f = ph - Math.floor(ph), dist = Math.min(f, 1 - f);
    const thick = 0.13 + 0.07 * noise(x * 2.5 + s, y * 2.5);
    let cov = 1 - sstep(thick - 0.05, thick + 0.05, dist);
    cov *= 1 - sstep(0.7, 0.78, noise(x * 4.2 + s * 3, y * 4.2 - s)); // the pen lifts now and then
    cov *= sstep(edge, edge - 0.08, r);
    const o = (py * w + px) * 4;
    d[o] = 27; d[o + 1] = 19; d[o + 2] = 16; d[o + 3] = cov * 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
