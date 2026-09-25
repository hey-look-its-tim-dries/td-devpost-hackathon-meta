// Pure steering math (no three.js, so node --test can run it). Quaternions are [x, y, z, w].
// The head is always compared with the pose captured at calibration, which is why the same
// numbers work sitting, reclined or lying flat on your back.

const FULL = Math.sin((25 * Math.PI) / 180); // ~25° of turn or tilt is a full steer
const DEAD = Math.sin((3 * Math.PI) / 180); // small wobbles do nothing

const conj = ([x, y, z, w]) => [-x, -y, -z, w];

function mul([ax, ay, az, aw], [bx, by, bz, bw]) {
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

// x component of vector v rotated by q (all we need: "how far to the side does it point")
function sideOf([x, y, z, w], [vx, vy, vz]) {
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return vx + w * tx + (y * tz - z * ty);
}

// -1 (left) .. 1 (right). Turning the head and tilting it (ear to shoulder) both count, so each
// player uses whatever their neck and pillow allow. Nodding does nothing.
export function headSteer(neutral, head) {
  const rel = mul(conj(neutral), head);
  const side = sideOf(rel, [0, 0, -1]) + sideOf(rel, [0, 1, 0]);
  const amount = Math.min(1, Math.max(0, Math.abs(side) - DEAD) / (FULL - DEAD));
  return Math.sign(side) * amount;
}

// Pinch and pull: sideways hand travel (metres, in the sky's frame) since the pinch began.
export const handSteer = (dx) => Math.max(-1, Math.min(1, dx / 0.15));

// Angle in radians between two orientations (used to notice a player holding still).
export const angleBetween = (a, b) =>
  2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])));

export { mul };
