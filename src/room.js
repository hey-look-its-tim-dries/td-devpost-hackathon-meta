// Pure room maths (no three.js, so node --test can run it). The skylight is cut into a plane: your
// real ceiling when the headset knows the room, otherwise a virtual one 2 m along your gaze.
// Plane space follows WebXR: the plane is y = 0, x and z run along it. The shader in main.js does
// the same ray test per pixel.

// Column-major 4x4 (three.js .elements) times a point or a direction.
const xf = (m, [x, y, z], w = 1) => [
  m[0] * x + m[4] * y + m[8] * z + m[12] * w,
  m[1] * x + m[5] * y + m[9] * z + m[13] * w,
  m[2] * x + m[6] * y + m[10] * z + m[14] * w,
];

// Axis-aligned extent of a plane's polygon: [minX, minZ, maxX, maxZ].
// ponytail: the bounding box, not the polygon; an L-shaped ceiling also opens over its missing corner.
export function extent(polygon) {
  const xs = polygon.map((p) => p.x), zs = polygon.map((p) => p.z);
  return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
}

// Where a ray (world space) meets the plane, given the world→plane matrix. Returns plane
// coordinates and the distance, or null if it points away or lands outside the extent.
export function rayOnPlane(inv, origin, dir, box) {
  const o = xf(inv, origin), d = xf(inv, dir, 0);
  if (o[1] * d[1] >= 0) return null;
  const t = -o[1] / d[1], x = o[0] + d[0] * t, z = o[2] + d[2] * t;
  if (x < box[0] || z < box[1] || x > box[2] || z > box[3]) return null;
  return { x, z, dist: t * Math.hypot(...d) };
}

// Which detected planes can hold the sky: anything labelled ceiling, or an unlabelled horizontal
// plane above your head. Desks, beds and floors never qualify.
export const isCeiling = (label, orientation, heightAboveHead) =>
  label ? label === 'ceiling' : orientation === 'horizontal' && heightAboveHead > 0.3;

// Which detected planes can carry the land: anything labelled table, or an unlabelled horizontal
// plane at desk height below your head. Beds, couches and floors never qualify.
export const isTable = (label, orientation, belowHead) =>
  label ? label === 'table' : orientation === 'horizontal' && belowHead > 0.25 && belowHead < 1.1;

// Where the land sits on a table (plane space): as close to you as fits, so your fingertip reaches
// every path. box = [minX, minZ, maxX, maxZ], head = [x, z] projected onto the plane, land in metres.
export function landSpot(box, head, land) {
  const size = Math.min(land, box[2] - box[0], box[3] - box[1]); // a small table shrinks the land
  const half = size / 2;
  const at = (v, lo, hi) => Math.min(Math.max(v, lo + half), hi - half);
  return { x: at(head[0], box[0], box[2]), z: at(head[1], box[1], box[3]), size };
}
