// src/ui/themed.js
// One drawing, two looks. The HUD, the stamps, the messages and the name tags are painted by code written
// for the calm look (parchment, ink, a red seal). In the foxfire state (src/garden/foxfire.js) the same
// code paints the Bioluminescent Synthwave look: `themed(g)` wraps a 2D context and, while `look.neon`
// is on, turns every colour into its neon counterpart, every rounded panel into a chamfered one, every
// serif into a terminal face, and lets lines and letters glow in their own colour. Nothing is replaced:
// with `look.neon` off the wrapper passes everything through untouched.
import { MONO } from './neon.js';

export const look = { neon: false };
const GLASS = 'rgba(255,43,214,0.5)', PAPERS = new Set(['#f6ead6', '#fbf3e6', '#f3e4d2', '#f7eedf']);
const HEX = { '#16100e': '#f4fbff', '#f6ead6': '#0b001a', '#fbf3e6': '#1c0b3d', '#f7eedf': '#ffffff', '#f3e4d2': '#0b001a', '#b8442e': '#ff2bd6', '#a8402b': '#ff2bd6', '#c9a35a': '#ff7a1a', '#a88442': '#ff7a1a', '#2f5d7c': '#00e5ff', '#3f7d3a': '#39ff14', '#8a6a44': '#ff4500' };
const RGBA = [
  [/^rgba\(22, ?16, ?14, ?([0-9.]+)\)$/, (a) => `rgba(191,233,255,${a})`], // ink, thinned: ice blue
  [/^rgba\((?:246, ?234, ?214|243, ?228, ?210|246, ?232, ?216), ?([0-9.]+)\)$/, (a) => `rgba(11,0,26,${+a >= 0.85 ? 0.72 : a})`], // paper: translucent violet
  [/^rgba\(184, ?68, ?46, ?([0-9.]+)\)$/, (a) => `rgba(255,43,214,${a})`],
  [/^rgba\(47, ?93, ?124, ?([0-9.]+)\)$/, (a) => `rgba(0,229,255,${a})`],
  [/^rgba\((?:79, ?143, ?58|52, ?122, ?52|111, ?160, ?74), ?([0-9.]+)\)$/, (a) => `rgba(57,255,20,${a})`],
  [/^rgba\((?:160, ?120, ?70|150, ?110, ?60|120, ?80, ?40), ?([0-9.]+)\)$/, (a) => `rgba(255,69,0,${a})`],
];
// a calm-look colour as the foxfire look paints it (anything unknown stays as it is)
export function neonColour(c) {
  if (typeof c !== 'string') return c;
  const hex = HEX[c.toLowerCase()];
  if (hex) return hex;
  for (const [re, to] of RGBA) { const m = c.match(re); if (m) return to(m[1]); }
  return c;
}
export const neonFont = (f) => String(f).replace(/Georgia(, "Times New Roman")?, serif/, MONO).replace(/\bitalic /, '');

export function themed(g, on = () => look.neon) {
  const chamfer = (x, y, w, h, r) => { const c = Math.min(typeof r === 'number' ? r * 0.75 : 14, w / 4, h / 4); g.moveTo(x + c, y); g.lineTo(x + w - c, y); g.lineTo(x + w, y + c); g.lineTo(x + w, y + h - c); g.lineTo(x + w - c, y + h); g.lineTo(x + c, y + h); g.lineTo(x, y + h - c); g.lineTo(x, y + c); g.closePath(); };
  const glow = (fn, colour, blur) => (...a) => { g.save(); g.shadowColor = g[colour]; g.shadowBlur = blur; fn.apply(g, a); g.restore(); };
  // The calm look inverts a chosen button: an ink shape with a paper label. Ink is light here, so that would be a
  // white slab (and the screen's bloom would drown its label): the shape becomes magenta glass, the label white.
  const swap = (fn, colour) => (...a) => { const was = g.fillStyle; g.fillStyle = colour; fn(...a); g.fillStyle = was; };
  let ink = false, paper = false; // what the drawing last chose to fill with
  return new Proxy(g, {
    get(t, k) {
      const v = t[k];
      if (typeof v !== 'function') return v;
      if (on()) {
        if (k === 'roundRect') return chamfer;
        if (k === 'stroke') return glow(v, 'strokeStyle', 8); // every line a laser line
        if (k === 'fillText') { const lit = glow(v, 'fillStyle', 2); return paper ? swap(lit, '#ffffff') : lit; } // every letter lit, and still sharp
        if (k === 'fill' && ink) return swap(v.bind(t), GLASS);
      }
      return v.bind(t);
    },
    set(t, k, v) { if (k === 'fillStyle') { const c = String(v).toLowerCase(); const thin = c.match(/^rgba\(22, ?16, ?14, ?([0-9.]+)\)$/); ink = c === '#16100e' || (!!thin && +thin[1] >= 0.7); paper = PAPERS.has(c); } t[k] = !on() ? v : k === 'fillStyle' || k === 'strokeStyle' ? neonColour(v) : k === 'font' ? neonFont(v) : v; return true; },
  });
}
