// src/garden/garland.js
// The opening screen's wreath: a ring of real flowers around the title, the same every time, with leaves
// under them and petals drifting off. The blooms are 64 of Josep Valls's 1000+ Free Flowers (CC0;
// assets/flora/josepvalls-1000-flowers/wreath-64.webp, 8 by 8 flowers of 160 px). Canvas 2D; drawn again
// when the window changes size, and left empty if the sheet cannot be loaded.
import { rng } from '../hand/dna.js';

let sheet = null;
const load = () => (sheet ??= new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = new URL('../../assets/flora/josepvalls-1000-flowers/wreath-64.webp', import.meta.url).href; }));

export async function drawGarland(canvas) {
  if (!canvas) return;
  const img = await load();
  const dpr = Math.min(2, globalThis.devicePixelRatio ?? 1), w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const g = canvas.getContext('2d'), r = rng(20261116);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  if (!img) return;
  const cx = w / 2, cy = h / 2, rx = Math.min(w * 0.49, 700), ry = h * 0.6, /* taller than the window: the arcs peep in and leave the words clear */ n = Math.round(70 + (rx + ry) / 8);
  const at = (a, off) => [cx + Math.cos(a) * (rx + off), cy + Math.sin(a) * (ry + off * 0.8)];
  // leaves first: pairs of green blades all round, pointing out and in
  for (let i = 0; i < n * 2; i++) {
    const a = r() * Math.PI * 2, [x, y] = at(a, (r() - 0.5) * 70), len = 34 + r() * 46;
    g.save(); g.translate(x, y); g.rotate(a + (r() < 0.5 ? 0 : Math.PI) + (r() - 0.5) * 1.4);
    g.fillStyle = ['#3f7d3a', '#2f6b3f', '#5a8f3c', '#3d7a5a'][i % 4]; g.globalAlpha = 0.9;
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.5, -len * 0.26, len, 0); g.quadraticCurveTo(len * 0.5, len * 0.26, 0, 0); g.fill();
    g.strokeStyle = 'rgba(20,50,25,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 0); g.lineTo(len, 0); g.stroke();
    g.restore();
  }
  // the blooms, small ones under large ones, each turned a little, with a soft shadow so they sit on the leaves
  const ring = Array.from({ length: n }, (_, i) => ({ a: (i / n) * Math.PI * 2 + (r() - 0.5) * 0.1, off: (r() - 0.5) * 84, size: 44 + r() * r() * 110, cell: Math.floor(r() * 64), turn: r() * Math.PI * 2 })).sort((p, q) => p.size - q.size);
  g.shadowColor = 'rgba(30,15,10,0.45)'; g.shadowBlur = 10; g.shadowOffsetY = 3;
  for (const f of ring) {
    const [x, y] = at(f.a, f.off);
    g.save(); g.translate(x, y); g.rotate(f.turn);
    g.drawImage(img, (f.cell % 8) * 160, Math.floor(f.cell / 8) * 160, 160, 160, -f.size / 2, -f.size / 2, f.size, f.size);
    g.restore();
  }
  g.shadowColor = 'transparent';
  // petals let go of the wreath: tiny whole blooms and their colours, drifting outward
  for (let i = 0; i < 46; i++) {
    const a = r() * Math.PI * 2, [x, y] = at(a, 70 + r() * 150), s = 12 + r() * 16, cell = Math.floor(r() * 64);
    g.save(); g.translate(x, y); g.rotate(r() * Math.PI * 2); g.globalAlpha = 0.5 + r() * 0.4;
    g.drawImage(img, (cell % 8) * 160, Math.floor(cell / 8) * 160, 160, 160, -s / 2, -s / 2, s, s);
    g.restore();
  }
}
