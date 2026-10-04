// src/world/ground.js
// The height of the world at (x, z) on the CPU, for flight clearance, by the GPU surface's rule: inside
// a Hand's outline its own surface wins (so the plain can't dam its rivers or bury its coast);
// elsewhere the wilderness, and never below the sea.
import { toHand } from './founders.js';
import { wildHeight } from './wild.js';
import { WORLD } from './units.js';

export const INSIDE = 0.15; // hand metres: baked heights are 0 outside a Hand and 0.3 or more inside
export function groundAt(hands, x, z) {
  let hand = -Infinity;
  for (const { pose, data: d } of hands) {
    const [X, Y] = toHand(pose, x, z);
    const c = (X - d.x0) / d.cell - 0.5, r = (Y - d.y0) / d.cell - 0.5;
    if (c < 0 || r < 0 || c >= d.w - 1 || r >= d.h - 1) continue;
    const c0 = Math.floor(c), r0 = Math.floor(r), fx = c - c0, fy = r - r0, H = d.height, i = r0 * d.w + c0;
    const v = (H[i] * (1 - fx) + H[i + 1] * fx) * (1 - fy) + (H[i + d.w] * (1 - fx) + H[i + d.w + 1] * fx) * fy;
    if (v > INSIDE) hand = Math.max(hand, v * WORLD);
  }
  return hand > -Infinity ? hand : Math.max(0, wildHeight(x, z));
}
