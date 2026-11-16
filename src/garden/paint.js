// src/garden/paint.js
// Every flower and tree of the index gets a portrait of its own, painted from what the index says of
// it (form, two colours, size) and a seed from its name. The same portrait is made in two hands: smooth
// (painted, with light on it) and pixel (sixteen by sixteen, hard edged, outlined), and a species keeps
// one style for good, so a garden mixes pixel flowers, painted ones and real 3D ones. Canvas 2D only.
import { rng } from '../hand/dna.js';

export const ROW = 32, PIX = 32, SOFT = 64, GEN = 16; // cells a row; a cell's pixels in the pixel and the painted atlas; generated pixel portraits are 16 px, doubled
export const hashName = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
export const STYLES = ['pixel', 'paint', 'mesh'];
export const styleOf = (s) => STYLES[hashName(s.name + s.kind) % 3];
const GREENS = ['#3f7d3a', '#2f6b3f', '#5a8f3c', '#3d7a5a'];
const shade = (hex, k) => { // k > 0 lighter, k < 0 darker
  const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};
const ell = (g, x, y, rx, ry, rot = 0) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.fill(); };

function flower(g, s, r, thick) {
  const green = GREENS[Math.floor(r() * GREENS.length)], hx = 0.5 + (r() - 0.5) * 0.08, hy = 0.34, R = 0.27;
  const stem = (x1, y1) => { g.strokeStyle = green; g.lineWidth = thick; g.lineCap = 'round'; g.beginPath(); g.moveTo(0.5, 0.99); g.quadraticCurveTo(0.5 + (r() - 0.5) * 0.2, 0.7, x1, y1); g.stroke(); };
  const leaves = () => { g.fillStyle = green; ell(g, 0.39, 0.8, 0.11, 0.045, -0.6); ell(g, 0.61, 0.74, 0.11, 0.045, 0.6); };
  if (s.form === 'daisy') {
    stem(hx, hy); leaves();
    const n = 7 + Math.floor(r() * 8);
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; g.fillStyle = i % 2 ? s.color : shade(s.color, 0.18); ell(g, hx + Math.cos(a) * R * 0.62, hy + Math.sin(a) * R * 0.62, R * 0.45, R * 0.2, a); }
    g.fillStyle = s.color2; ell(g, hx, hy, R * 0.34, R * 0.34);
  } else if (s.form === 'tulip') {
    stem(hx, hy + 0.12); leaves();
    g.fillStyle = shade(s.color, -0.18); ell(g, hx, hy + 0.02, 0.1, 0.2);
    g.fillStyle = s.color; ell(g, hx - 0.1, hy, 0.09, 0.2, -0.22); ell(g, hx + 0.1, hy, 0.09, 0.2, 0.22);
    g.fillStyle = s.color2; ell(g, hx, hy + 0.17, 0.11, 0.05);
  } else if (s.form === 'bell') {
    stem(0.58, 0.2); leaves();
    for (const [x, y, k] of [[0.34, 0.42, 1], [0.52, 0.5, 0.9], [0.7, 0.38, 0.8]]) {
      g.fillStyle = s.color; g.beginPath(); g.moveTo(x - 0.1 * k, y + 0.13 * k); g.quadraticCurveTo(x - 0.1 * k, y - 0.13 * k, x, y - 0.13 * k); g.quadraticCurveTo(x + 0.1 * k, y - 0.13 * k, x + 0.1 * k, y + 0.13 * k); g.closePath(); g.fill();
      g.fillStyle = s.color2; ell(g, x, y + 0.13 * k, 0.11 * k, 0.035 * k);
    }
  } else if (s.form === 'spike') {
    stem(0.5, 0.1); leaves();
    for (let i = 0; i < 11; i++) { const t = i / 10, w = 0.1 * (1 - t * 0.7); g.fillStyle = t > 0.8 ? s.color2 : i % 2 ? s.color : shade(s.color, -0.15); ell(g, 0.5 + (i % 2 ? w : -w) * 0.8, 0.62 - t * 0.54, w * 1.15, w * 0.9); }
  } else if (s.form === 'umbel') {
    stem(0.5, 0.5); leaves();
    const n = 9 + Math.floor(r() * 5);
    g.strokeStyle = green; g.lineWidth = thick * 0.6;
    const tips = Array.from({ length: n }, (_, i) => { const a = Math.PI * (1.08 + 0.84 * (i / (n - 1))); return [0.5 + Math.cos(a) * 0.36, 0.5 + Math.sin(a) * 0.36]; });
    for (const [x, y] of tips) { g.beginPath(); g.moveTo(0.5, 0.5); g.lineTo(x, y); g.stroke(); }
    for (const [i, [x, y]] of tips.entries()) { g.fillStyle = i % 3 ? s.color : s.color2; ell(g, x, y, 0.075, 0.075); }
  } else { // rosette: rings of petals closing on the heart
    stem(hx, hy + 0.1); leaves();
    for (const [k, col] of [[1, shade(s.color, -0.2)], [0.72, s.color], [0.45, shade(s.color, 0.25)]]) {
      const n = 6;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + k * 2; g.fillStyle = col; ell(g, hx + Math.cos(a) * R * 0.5 * k, hy + Math.sin(a) * R * 0.5 * k, R * 0.5 * k, R * 0.42 * k, a); }
    }
    g.fillStyle = s.color2; ell(g, hx, hy, R * 0.16, R * 0.16);
  }
}

function tree(g, s, r, thick) {
  const bark = s.color2, leaf = s.color, lite = shade(s.color, 0.25), dark = shade(s.color, -0.22);
  const trunk = (w, top) => { g.fillStyle = bark; g.beginPath(); g.moveTo(0.5 - w, 0.99); g.lineTo(0.5 - w * 0.6, top); g.lineTo(0.5 + w * 0.6, top); g.lineTo(0.5 + w, 0.99); g.closePath(); g.fill(); };
  if (s.form === 'round') {
    trunk(0.06, 0.5);
    g.fillStyle = dark; ell(g, 0.5, 0.42, 0.34, 0.3);
    g.fillStyle = leaf; ell(g, 0.36, 0.4, 0.2, 0.2); ell(g, 0.64, 0.42, 0.2, 0.2); ell(g, 0.5, 0.28, 0.22, 0.2);
    g.fillStyle = lite; ell(g, 0.42, 0.26, 0.1, 0.08); ell(g, 0.66, 0.36, 0.07, 0.06);
  } else if (s.form === 'cone') {
    trunk(0.045, 0.7);
    for (const [y, w, col] of [[0.86, 0.3, dark], [0.64, 0.24, leaf], [0.42, 0.17, lite]]) { g.fillStyle = col; g.beginPath(); g.moveTo(0.5 - w, y); g.lineTo(0.5, y - 0.36); g.lineTo(0.5 + w, y); g.closePath(); g.fill(); }
  } else if (s.form === 'palm') {
    g.strokeStyle = bark; g.lineWidth = thick * 1.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(0.44, 0.99); g.quadraticCurveTo(0.44, 0.55, 0.54, 0.3); g.stroke();
    g.lineWidth = thick * 1.5;
    for (let i = 0; i < 7; i++) { const a = Math.PI * (1 + i / 6), x = 0.54 + Math.cos(a) * 0.4, y = 0.3 + Math.sin(a) * 0.2 + 0.1; g.strokeStyle = i % 2 ? leaf : dark; g.beginPath(); g.moveTo(0.54, 0.3); g.quadraticCurveTo(0.54 + Math.cos(a) * 0.25, 0.3 + Math.sin(a) * 0.28, x, y); g.stroke(); }
    g.fillStyle = lite; ell(g, 0.54, 0.31, 0.04, 0.04);
  } else if (s.form === 'umbrella') {
    trunk(0.045, 0.34);
    g.strokeStyle = bark; g.lineWidth = thick; g.beginPath(); g.moveTo(0.5, 0.55); g.lineTo(0.28, 0.32); g.moveTo(0.5, 0.55); g.lineTo(0.72, 0.32); g.stroke();
    g.fillStyle = dark; ell(g, 0.5, 0.3, 0.47, 0.13);
    g.fillStyle = leaf; ell(g, 0.5, 0.26, 0.42, 0.1);
    g.fillStyle = lite; ell(g, 0.4, 0.22, 0.16, 0.035);
  } else if (s.form === 'column') {
    trunk(0.04, 0.85);
    g.fillStyle = dark; ell(g, 0.5, 0.47, 0.15, 0.45);
    g.fillStyle = leaf; ell(g, 0.47, 0.45, 0.11, 0.41);
    g.fillStyle = lite; ell(g, 0.44, 0.34, 0.04, 0.2);
  } else { // cactus: a ribbed column with arms and flowers on top
    g.fillStyle = leaf;
    g.beginPath(); g.roundRect(0.41, 0.14, 0.18, 0.85, 0.09); g.fill();
    g.beginPath(); g.roundRect(0.18, 0.4, 0.12, 0.3, 0.06); g.roundRect(0.18, 0.6, 0.28, 0.1, 0.05); g.fill();
    g.beginPath(); g.roundRect(0.7, 0.28, 0.12, 0.3, 0.06); g.roundRect(0.55, 0.48, 0.27, 0.1, 0.05); g.fill();
    g.fillStyle = dark; g.fillRect(0.485, 0.2, 0.03, 0.76);
    g.fillStyle = bark; ell(g, 0.5, 0.13, 0.06, 0.05); ell(g, 0.24, 0.39, 0.045, 0.04); ell(g, 0.76, 0.27, 0.045, 0.04);
  }
}

function mushroom(g, s, r) {
  const one = (cx, k) => { // a stem, a domed cap with a dark underside, spots in the second colour
    const top = 0.98 - 0.5 * k;
    g.fillStyle = shade(s.color2, 0.55); g.beginPath(); g.roundRect(cx - 0.05 * k, top, 0.1 * k, 0.5 * k, 0.03); g.fill();
    g.fillStyle = s.color; g.beginPath(); g.ellipse(cx, top, 0.27 * k, 0.2 * k, 0, Math.PI, Math.PI * 2); g.closePath(); g.fill();
    g.fillStyle = shade(s.color, -0.3); ell(g, cx, top, 0.27 * k, 0.04 * k);
    g.fillStyle = s.color2; for (let i = 0; i < 5; i++) ell(g, cx + (r() - 0.5) * 0.36 * k, top - (0.04 + r() * 0.11) * k, 0.028 * k, 0.022 * k);
  };
  const n = 1 + Math.floor(r() * 3);
  if (n > 1) one(0.24, 0.66);
  if (n > 2) one(0.79, 0.56);
  one(0.5, 1.2);
}

// only the stem and leaves of a flower, for a portrait whose bloom comes from elsewhere
export function drawStem(g, x0, y0, px) {
  g.save(); g.translate(x0, y0); g.scale(px, px);
  g.strokeStyle = GREENS[0]; g.lineWidth = 0.05; g.lineCap = 'round'; g.beginPath(); g.moveTo(0.5, 0.99); g.quadraticCurveTo(0.47, 0.7, 0.5, 0.4); g.stroke();
  g.fillStyle = GREENS[0]; ell(g, 0.39, 0.8, 0.11, 0.045, -0.6); ell(g, 0.61, 0.72, 0.11, 0.045, 0.6);
  g.restore();
}

// one species into a px by px cell whose top left is (x0, y0); smooth = painted with light, otherwise flat
export function drawSpecies(g, s, x0, y0, px, smooth) {
  const r = rng(hashName(s.name));
  g.save();
  g.translate(x0, y0);
  g.beginPath(); g.rect(0, 0, px, px); g.clip();
  g.scale(px, px);
  (s.kind === 'tree' ? tree : s.kind === 'mushroom' ? mushroom : flower)(g, s, r, smooth ? 0.045 : 0.09);
  if (smooth) { // light from the upper left, shade to the lower right, only where something is painted
    g.globalCompositeOperation = 'source-atop';
    const l = g.createRadialGradient(0.3, 0.2, 0.02, 0.3, 0.2, 0.75);
    l.addColorStop(0, 'rgba(255,255,255,0.38)'); l.addColorStop(0.5, 'rgba(255,255,255,0)'); l.addColorStop(1, 'rgba(40,10,40,0.3)');
    g.fillStyle = l; g.fillRect(0, 0, 1, 1);
  }
  g.restore();
}

// pixel art out of a small painting: hard alpha, fewer colours, an ink outline (in place, on image data)
export function pixelate(img) {
  const { data: d, width: w, height: h } = img, solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    solid[i] = d[i * 4 + 3] > 110 ? 1 : 0;
    for (let c = 0; c < 3; c++) d[i * 4 + c] = Math.min(255, Math.round(d[i * 4 + c] / 36) * 36);
    d[i * 4 + 3] = solid[i] * 255;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (solid[i]) continue;
    const cx = x % GEN, cy = y % GEN; // never across a cell's edge into its neighbour
    const near = (cx > 0 && solid[i - 1]) || (cx < GEN - 1 && solid[i + 1]) || (cy > 0 && solid[i - w]) || (cy < GEN - 1 && solid[i + w]);
    if (near) { d[i * 4] = 42; d[i * 4 + 1] = 24; d[i * 4 + 2] = 20; d[i * 4 + 3] = 255; }
  }
  return img;
}

// the two atlases: every flora species in one cell of each, 32 cells a row. Returns the canvases and where each is.
export function paintAtlases(species, flora, makeCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h })) {
  const rows = Math.ceil(flora.length / ROW);
  const soft = makeCanvas(ROW * SOFT, ROW * SOFT), pix = makeCanvas(ROW * PIX, ROW * PIX), small = makeCanvas(ROW * GEN, ROW * GEN), gs = soft.getContext('2d'), gp = small.getContext('2d', { willReadFrequently: true });
  const cell = new Map(); // species id -> [column, row]
  flora.forEach((id, i) => {
    const cx = i % ROW, cy = Math.floor(i / ROW);
    cell.set(id, [cx, cy]);
    drawSpecies(gs, species[id], cx * SOFT, cy * SOFT, SOFT, true);
    drawSpecies(gp, species[id], cx * GEN, cy * GEN, GEN, false);
  });
  gp.putImageData(pixelate(gp.getImageData(0, 0, ROW * GEN, rows * GEN)), 0, 0);
  const gx = pix.getContext('2d');
  gx.imageSmoothingEnabled = false;
  gx.drawImage(small, 0, 0, ROW * PIX, ROW * PIX); // doubled, hard edged
  return { soft, pix, cell };
}
