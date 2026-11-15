// src/world/where.js
// Which Hand and which handbit lie under a world point, on the CPU: for charting, the place card and
// the atlas. A Hand keeps one byte per cell of its grid: the handbit index (as labelHand numbers them:
// 0-14 the fingers, 15+ the palm regions), or -1 on water and outside. Pure.
import { toHand } from './founders.js';

export const cellsOf = (lab) => Int8Array.from(lab.label, (L) => (L >= 0 ? L : -1));

export function whereAt(hands, x, z) {
  for (const hand of hands) {
    const d = hand.data;
    if (!d?.cells || (hand.rise ?? 1) < 1) continue;
    const [X, Y] = toHand(hand.pose, x, z);
    const c = Math.floor((X - d.x0) / d.cell), r = Math.floor((Y - d.y0) / d.cell);
    if (c < 0 || r < 0 || c >= d.w || r >= d.h) continue;
    const index = d.cells[r * d.w + c];
    if (index >= 0) return { hand, handbit: d.handbits[index], index };
  }
  return null;
}
