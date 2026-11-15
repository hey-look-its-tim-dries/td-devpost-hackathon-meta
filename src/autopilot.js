// src/autopilot.js
// Fly here (spec 6.4): steer the glider toward a place, a few hundred metres above the land so it
// charts what it passes. Returns the same { turn, climb } a hand or the keys give. Pure.
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp1 = (v) => Math.max(-1, Math.min(1, v));

export function steerTo(glide, [tx, , tz], groundAt, height = 300) {
  const dx = tx - glide.pos[0], dz = tz - glide.pos[2];
  const want = Math.atan2(-dx, -dz), diff = wrap(want - glide.yaw); // turn +1 lowers yaw (turns right)
  const floor = groundAt(glide.pos[0], glide.pos[2]);
  return { turn: clamp1(-diff * 2), climb: clamp1((floor + height - glide.pos[1]) / 150) };
}

// who steers this frame (review finding 3): an engaged hand always wins; then Fly here; then the keys on a
// screen, the head in the headset
export function whoSteers({ flyTo, engaged, keys, xr }) {
  if (engaged) return 'hand';
  if (keys) return 'keys';
  if (flyTo) return 'auto';
  return xr ? 'head' : 'keys';
}
