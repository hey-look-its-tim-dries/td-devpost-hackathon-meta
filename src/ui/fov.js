// src/ui/fov.js
// The HUD laid out from the view the headset reports, not from numbers we wrote down (Meta's field-of-view
// guidance). Meta VR Glasses: 70 x 66 degrees seen, 74 x 68 rendered, essential UI inside 58 x 54. A Quest 3
// renders far wider. The cards were drawn for the glasses; on a wider view they move outwards and down, leaving
// the middle of your view to your whorl and the land, but never past a comfortable 33 degrees across.
const T = (deg) => Math.tan((deg * Math.PI) / 180);
const DH = 0.74, DV = 0.75; // 58 x 54 inside 74 x 68: the design area, as a share of the rendered tangents

// m: a column-major projection matrix (one eye) -> the tangents of its half angles, averaged left/right and up/down
export function fovOf(m) {
  if (!m || !(m[0] > 0) || !(m[5] > 0)) return null;
  return { h: 1 / m[0], v: 1 / m[5] }; // m[0] = 2 / (tanL + tanR), m[5] = 2 / (tanU + tanD)
}

// -> how far to push the cards out (x, y) and the edge of the design area (h, v: tangents)
export function spreadOf(f) {
  if (!f) return { x: 1, y: 1, h: Infinity, v: Infinity };
  const h = Math.min(DH * f.h, T(33)), v = Math.min(DV * f.v, T(30));
  const clamp = (a, lo, hi) => Math.max(lo, Math.min(hi, a));
  return { x: clamp(h / T(29), 1, 1.3), y: 1.35 * clamp(v / T(27), 1, 1.1), h, v };
}

// a card centred at base ({ x, y }), size { w, h } (metres), z metres in front of you -> its spread-out centre
export function placeCard(base, size, z, s) {
  const one = (b, k, edge, half) => (b ? Math.sign(b) * Math.min(Math.abs(b) * k, Math.max(0, edge * z - half)) : 0);
  return { x: one(base.x, s.x, s.h, size.w / 2), y: one(base.y, s.y, s.v, size.h / 2) };
}
