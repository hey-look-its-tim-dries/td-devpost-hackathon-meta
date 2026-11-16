// src/garden/garland.js
// The opening screen's wreath: a ring of flowers from the index around the title, the same every time,
// with petals drifting off it. Each flower is painted once (paint.js) and stamped turned outward.
// Canvas 2D; drawn again when the window changes size.
import { rng } from '../hand/dna.js';
import { drawSpecies } from './paint.js';

export function drawGarland(canvas, species) {
  if (!canvas) return;
  const dpr = Math.min(2, globalThis.devicePixelRatio ?? 1), w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const g = canvas.getContext('2d'), r = rng(20261116), flowers = species.filter((s) => s.kind === 'flower');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  // sixty kinds, each painted once
  const S = 128, stamps = Array.from({ length: 60 }, () => { const c = Object.assign(document.createElement('canvas'), { width: S, height: S }); drawSpecies(c.getContext('2d'), flowers[Math.floor(r() * flowers.length)], 0, 0, S, true); return c; });
  const cx = w / 2, cy = h / 2, rx = Math.min(w * 0.47, 640), ry = Math.min(h * 0.47, 410), n = Math.round(90 + (rx + ry) / 9);
  // back to front: small and pale first, large and bright last, so the wreath has depth
  const ring = Array.from({ length: n }, (_, i) => ({ a: (i / n) * Math.PI * 2 + (r() - 0.5) * 0.08, off: (r() - 0.5) * 90, size: 46 + r() * 86, stamp: stamps[Math.floor(r() * stamps.length)], tilt: (r() - 0.5) * 0.9 })).sort((p, q) => p.size - q.size);
  for (const f of ring) {
    const x = cx + Math.cos(f.a) * (rx + f.off), y = cy + Math.sin(f.a) * (ry + f.off * 0.8);
    g.save();
    g.translate(x, y);
    g.rotate(f.a + Math.PI / 2 + f.tilt); // heads outward, stems to the middle
    g.globalAlpha = 0.55 + 0.45 * ((f.size - 46) / 86);
    g.drawImage(f.stamp, -f.size / 2, -f.size * 0.75, f.size, f.size);
    g.restore();
  }
  // petals let go of the wreath
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = 1.02 + r() * 0.35, s = flowers[Math.floor(r() * flowers.length)];
    g.save();
    g.translate(cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d);
    g.rotate(r() * Math.PI);
    g.globalAlpha = 0.35 + r() * 0.4;
    g.fillStyle = s.color;
    g.beginPath(); g.ellipse(0, 0, 5 + r() * 7, 2.5 + r() * 3, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
}
