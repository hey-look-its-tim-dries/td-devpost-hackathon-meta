// src/atlas/map.js
// The atlas map (spec 6.4, 11.1): the world drawn as a cartographer would, on parchment. Every Hand as
// an inked outline, charted handbits in its skin and uncharted ones blank, its lines as rivers, its
// name in letter-spaced small caps; the Source; players as dots and you as an arrow; a legend, a
// compass rose and a scale bar in spans. Draws into any 2D context; no DOM, no three.js. Pure.
import { handShape, OUTLINE } from '../hand/shape.js';
import { unpackPalm } from '../hand/dna.js';
import { toWorld, SOURCE_RADIUS } from '../world/founders.js';

const INK = '#16100e', PARCH = '#f3e4d2', RIVER = '#2f5d7c', SEAL = '#b8442e', GILT = '#c9a35a';
const SPAN = 6000;
const shapes = new WeakMap(); // palm bytes -> shape, so a redraw does not unpack every Hand again
const shapeOf = (h) => { let s = shapes.get(h.palm); if (!s) shapes.set(h.palm, (s = handShape(unpackPalm(h.palm)))); return s; };

// a view that fits every Hand (and the Source) into w x h pixels
export function mapView(hands, w, h) {
  let x0 = -SOURCE_RADIUS, x1 = SOURCE_RADIUS, z0 = -SOURCE_RADIUS, z1 = SOURCE_RADIUS;
  for (const hd of hands) for (const [X, Y] of [[-200, -20], [300, -20], [-200, 640], [300, 640]]) {
    const [x, z] = toWorld(hd.pose, X, Y);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  const pad = 1.08;
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, scale: Math.min(w / ((x1 - x0) * pad), h / ((z1 - z0) * pad)) };
}
export const toMap = (v, x, z, w, h) => [w / 2 + (x - v.cx) * v.scale, h / 2 + (z - v.cz) * v.scale];
export const fromMap = (v, px, py, w, h) => [v.cx + (px - w / 2) / v.scale, v.cz + (py - h / 2) / v.scale];

// opts: hands, chart, me { pos, yaw }, others [{ pos, name }], view, w, h,
//   layers { rivers, owners, classes, players, charted, watersheds } (all on by default),
//   raster(hand) -> { image, x0, y0, w, h, cell } | null: the Hand's handbits painted charted/uncharted,
//   selected: a Hand id to ring, pins [{ x, z, label }], waters: handId -> colour (watersheds), until: ms (timeline)
export function drawMap(g, o) {
  const { hands, chart, me, others = [], view: v, w, h, raster = null, selected = null, pins = [], waters = null, until = Infinity, blooms = [], storm = null } = o;
  const L = { rivers: true, owners: true, classes: true, players: true, charted: true, watersheds: false, bloom: true, ...(o.layers ?? {}) };
  const M = (x, z) => toMap(v, x, z, w, h);
  g.fillStyle = PARCH; g.fillRect(0, 0, w, h);
  // the Paper Sea's faint grid, one line a span
  g.strokeStyle = 'rgba(22,16,14,0.07)'; g.lineWidth = 1;
  const step = SPAN * v.scale;
  if (step > 12) {
    for (let x = ((w / 2 - v.cx * v.scale) % step + step) % step; x < w; x += step) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = ((h / 2 - v.cz * v.scale) % step + step) % step; y < h; y += step) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  }
  // the Source
  const [sx, sy] = M(0, 0);
  g.fillStyle = 'rgba(47,93,124,0.28)'; g.beginPath(); g.arc(sx, sy, SOURCE_RADIUS * v.scale, 0, Math.PI * 2); g.fill();
  g.strokeStyle = RIVER; g.lineWidth = 1.5; g.stroke();
  for (const hd of hands) {
    if ((hd.placed_at ?? Infinity) > until) continue; // a Hand with no date yet (yours, still on its way to the map) is the newest
    const s = shapeOf(hd), at = (X, Y) => M(...toWorld(hd.pose, X, Y));
    const r = L.charted && raster ? raster(hd) : null;
    if (r) { // the handbits themselves, charted in colour and uncharted blank
      const [ox, oy] = at(r.x0, r.y0), [ux, uy] = at(r.x0 + r.cell, r.y0), [vx, vy] = at(r.x0, r.y0 + r.cell);
      g.save(); g.setTransform(ux - ox, uy - oy, vx - ox, vy - oy, ox, oy); g.drawImage(r.image, 0, 0); g.restore();
    }
    // the outline: palm, then each finger
    g.beginPath();
    OUTLINE.forEach(([X, Y], i) => { const [px, py] = at(X, Y); i ? g.lineTo(px, py) : g.moveTo(px, py); });
    g.closePath();
    if (!r) { g.fillStyle = chart.sealed?.(hd.id) ? '#d9a582' : 'rgba(243,228,210,0.9)'; g.fill(); }
    g.strokeStyle = hd.founder ? GILT : INK; g.lineWidth = hd.id === selected ? 3.5 : 1.6; g.stroke();
    for (const f of s.fingers) {
      g.beginPath();
      const hw = f.width / 2, pt = (u, t) => at(f.base[0] + f.side[0] * u + f.dir[0] * t, f.base[1] + f.side[1] * u + f.dir[1] * t);
      g.moveTo(...pt(-hw, 0)); g.lineTo(...pt(-hw, f.len - hw)); g.lineTo(...pt(0, f.len)); g.lineTo(...pt(hw, f.len - hw)); g.lineTo(...pt(hw, 0));
      g.closePath();
      if (!r) { g.fillStyle = 'rgba(243,228,210,0.9)'; g.fill(); }
      g.stroke();
    }
    if (L.rivers) {
      g.strokeStyle = waters?.[hd.id] ?? RIVER; g.lineCap = 'round';
      for (const ln of s.lines) {
        g.lineWidth = Math.max(1, (2 + ln.strength) * 3 * v.scale * 10);
        g.beginPath(); ln.pts.forEach(([X, Y], i) => { const [px, py] = at(X, Y); i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke();
      }
    }
    if (L.classes && v.scale > 0.004) { // each print's class glyph letter at its fingertip
      g.fillStyle = INK; g.font = '600 11px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      s.fingers.forEach((f, i) => { const p = hd.prints?.[i]; if (!p) return; g.fillText('✦', ...at(f.base[0] + f.dir[0] * (f.len - f.width * 0.6), f.base[1] + f.dir[1] * (f.len - f.width * 0.6))); });
    }
    if (L.owners) {
      const [lx, ly] = at(0, 230);
      g.fillStyle = INK; g.font = `600 ${Math.max(11, Math.min(22, v.scale * 2200))}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.letterSpacing = '2px';
      g.fillText(hd.name.toUpperCase(), lx, ly);
      g.letterSpacing = '0px';
      if (hd.id === selected) { g.strokeStyle = SEAL; g.lineWidth = 2; g.beginPath(); g.arc(lx, ly, 26, 0, Math.PI * 2); g.stroke(); }
    }
  }
  for (const p of pins) { const [px, py] = M(p.x, p.z); g.fillStyle = GILT; g.beginPath(); g.arc(px, py - 10, 7, 0, Math.PI * 2); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.5; g.stroke(); g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - 4); g.stroke(); }
  if (L.bloom) { // plots in bloom, greener and larger the lusher; and the sandstorm, when one blows
    for (const b of blooms) { const [px, py] = M(b.x, b.z); g.fillStyle = ['', 'rgba(111,160,74,0.55)', 'rgba(79,143,58,0.7)', 'rgba(52,122,52,0.8)', 'rgba(184,68,46,0.85)'][b.level]; g.beginPath(); g.arc(px, py, 3 + 2.5 * b.level, 0, Math.PI * 2); g.fill(); }
    if (storm) { const [px, py] = M(storm.x, storm.z), [qx] = M(storm.x + storm.r, storm.z); g.fillStyle = 'rgba(160,120,70,0.35)'; g.strokeStyle = 'rgba(120,80,40,0.8)'; g.lineWidth = 2; g.beginPath(); g.arc(px, py, Math.max(6, Math.abs(qx - px)), 0, Math.PI * 2); g.fill(); g.stroke(); }
  }
  if (L.players) for (const o2 of others) { const [px, py] = M(o2.pos[0], o2.pos[2]); g.fillStyle = INK; g.beginPath(); g.arc(px, py, 4, 0, Math.PI * 2); g.fill(); }
  // you: an arrow along your heading (yaw 0 is north, -z)
  const [mx, my] = M(me.pos[0], me.pos[2]);
  g.save(); g.translate(mx, my); g.rotate(-me.yaw);
  g.fillStyle = SEAL; g.beginPath(); g.moveTo(0, -12); g.lineTo(8, 9); g.lineTo(0, 4); g.lineTo(-8, 9); g.closePath(); g.fill();
  g.restore();
  // the compass rose, top right
  g.save(); g.translate(w - 44, 48);
  g.strokeStyle = INK; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, 22, 0, Math.PI * 2); g.stroke();
  g.fillStyle = INK; g.beginPath(); g.moveTo(0, -20); g.lineTo(6, 0); g.lineTo(0, 20); g.lineTo(-6, 0); g.closePath(); g.fill();
  g.font = '700 16px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', 0, -34);
  g.restore();
  // the scale bar, bottom right: one span (or a tenth when zoomed in)
  const unit = SPAN * v.scale > w / 3 ? SPAN / 10 : SPAN, bar = unit * v.scale;
  g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.moveTo(w - 30 - bar, h - 30); g.lineTo(w - 30, h - 30); g.moveTo(w - 30 - bar, h - 36); g.lineTo(w - 30 - bar, h - 24); g.moveTo(w - 30, h - 36); g.lineTo(w - 30, h - 24); g.stroke();
  g.fillStyle = INK; g.font = '500 13px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.fillText(unit === SPAN ? '1 span' : '0.1 span', w - 30 - bar / 2, h - 40);
  // the legend, bottom left
  const leg = [['#d9a582', 'charted'], ['rgba(243,228,210,1)', 'uncharted'], [RIVER, 'river'], [INK, 'player'], [SEAL, 'you']];
  g.font = '500 13px Inter, system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  leg.forEach(([c, t], i) => { g.fillStyle = c; g.fillRect(16, h - 22 - (leg.length - 1 - i) * 20 - 6, 14, 12); g.strokeStyle = INK; g.lineWidth = 1; g.strokeRect(16, h - 22 - (leg.length - 1 - i) * 20 - 6, 14, 12); g.fillStyle = INK; g.fillText(t, 38, h - 22 - (leg.length - 1 - i) * 20); });
}
