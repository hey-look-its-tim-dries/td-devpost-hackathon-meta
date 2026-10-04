// src/world/wild.js
// The endless skin wilderness. Around the First Ten lies a low plain with the Source lake; beyond it,
// fold mountains and crease canyons go on forever, with water wherever the land dips below the sea.
// The height is defined twice, identically: here for the CPU (flight clearance) and in WILD_GLSL for
// the GPU, both from the same integer hash, so it stays the same everywhere and never loses
// precision far from the centre. The fine ridges, pores and wrinkles exist only on the GPU.

export const BASIN_IN = 11000, BASIN_OUT = 17000, SOURCE_R = 2500;

export function hashI(x, z, k) {
  let h = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1) ^ Math.imul(k, 0x1b873593)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function vnoise(x, z, k) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hashI(ix, iz, k), b = hashI(ix + 1, iz, k), c = hashI(ix, iz + 1, k), d = hashI(ix + 1, iz + 1, k);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
// Voronoi cells of a given size: distance to the nearest centre, distance to the nearest edge
// (F2 - F1), and the cell's id
export function cells(x, z, size, k) {
  const gx = x / size, gz = z / size, ix = Math.floor(gx), iz = Math.floor(gz);
  let d1 = 9, d2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ix + i, cz = iz + j;
    const d = Math.hypot(gx - (cx + 0.15 + 0.7 * hashI(cx, cz, k)), gz - (cz + 0.15 + 0.7 * hashI(cx, cz, k + 1)));
    if (d < d1) { d2 = d1; d1 = d; id = hashI(cx, cz, k + 2); } else if (d < d2) d2 = d;
  }
  return { f1: d1 * size, edge: (d2 - d1) * size, id };
}
// sharp-crested folds, 0..1 (ridged noise, four octaves, on warped ground)
function fold(x, z) {
  const wx = x + 900 * (vnoise(x / 4000, z / 4000, 7) - 0.5), wz = z + 900 * (vnoise(x / 4000, z / 4000, 8) - 0.5);
  let sum = 0, amp = 1, norm = 0, f = 1 / 6000;
  for (let o = 0; o < 4; o++) {
    const r = 1 - Math.abs(2 * vnoise(wx * f, wz * f, o) - 1);
    sum += r * r * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}
export function wildHeight(x, z) {
  const r = Math.hypot(x, z), b = sstep(BASIN_IN, BASIN_OUT, r);
  const plain = 6 * (vnoise(x / 900, z / 900, 11) - 0.4) - 30 * (1 - sstep(SOURCE_R * 0.6, SOURCE_R, r));
  if (b <= 0) return plain;
  const canyon = 1 - sstep(0, 220, cells(x, z, 3500, 20).edge);
  return plain * (1 - b) + b * (650 * Math.pow(fold(x, z), 1.5) * (1 - canyon) - 60 * canyon); // every canyon floor holds water
}

export const WILD_GLSL = /* glsl */ `
  float sstep(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
  float hashI(int x, int z, int k) {
    uint h = (uint(x) * 0x27d4eb2du) ^ (uint(z) * 0x165667b1u) ^ (uint(k) * 0x1b873593u);
    h = (h ^ (h >> 15u)) * 0x2c1b3c6du;
    h = (h ^ (h >> 12u)) * 0x297a2d39u;
    h ^= h >> 15u;
    return float(h) / 4294967296.0;
  }
  float vnoise(vec2 p, int k) {
    vec2 fl = floor(p), f = p - fl, u = f * f * (3.0 - 2.0 * f);
    int ix = int(fl.x), iz = int(fl.y);
    float a = hashI(ix, iz, k), b = hashI(ix + 1, iz, k), c = hashI(ix, iz + 1, k), d = hashI(ix + 1, iz + 1, k);
    return a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;
  }
  // x: distance to the nearest centre, y: distance to the nearest edge, z: the cell's id
  vec3 cells(vec2 p, float size, int k) {
    vec2 g = p / size, fl = floor(g);
    int ix = int(fl.x), iz = int(fl.y);
    float d1 = 9.0, d2 = 9.0, id = 0.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      int cx = ix + i, cz = iz + j;
      float d = distance(g, vec2(float(cx) + 0.15 + 0.7 * hashI(cx, cz, k), float(cz) + 0.15 + 0.7 * hashI(cx, cz, k + 1)));
      if (d < d1) { d2 = d1; d1 = d; id = hashI(cx, cz, k + 2); } else if (d < d2) d2 = d;
    }
    return vec3(d1 * size, (d2 - d1) * size, id);
  }
  // the centre of the nearest cell (for the whorls)
  vec2 cellCentre(vec2 p, float size, int k, out float id) {
    vec2 g = p / size, fl = floor(g), best = vec2(0.0);
    int ix = int(fl.x), iz = int(fl.y);
    float d1 = 9.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      int cx = ix + i, cz = iz + j;
      vec2 c = vec2(float(cx) + 0.15 + 0.7 * hashI(cx, cz, k), float(cz) + 0.15 + 0.7 * hashI(cx, cz, k + 1));
      float d = distance(g, c);
      if (d < d1) { d1 = d; best = c; id = hashI(cx, cz, k + 2); }
    }
    return best * size;
  }
  float fold(vec2 p) {
    vec2 w = p + 900.0 * (vec2(vnoise(p / 4000.0, 7), vnoise(p / 4000.0, 8)) - 0.5);
    float sum = 0.0, amp = 1.0, norm = 0.0, f = 1.0 / 6000.0;
    for (int o = 0; o < 4; o++) {
      float r = 1.0 - abs(2.0 * vnoise(w * f, o) - 1.0);
      sum += r * r * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return sum / norm;
  }
  float wild(vec2 p) {
    float r = length(p), b = sstep(11000.0, 17000.0, r);
    float plain = 6.0 * (vnoise(p / 900.0, 11) - 0.4) - 30.0 * (1.0 - sstep(2500.0 * 0.6, 2500.0, r));
    if (b <= 0.0) return plain;
    float canyon = 1.0 - sstep(0.0, 220.0, cells(p, 3500.0, 20).y);
    return plain * (1.0 - b) + b * (650.0 * pow(fold(p), 1.5) * (1.0 - canyon) - 60.0 * canyon);
  }
  // dermal ridges over the wilderness: flowing lines 35 m apart that curl into a few giant whorls
  float wildPhase(vec2 p) {
    float flow = p.y + 160.0 * sin(p.x / 900.0 + 2.0 * vnoise(p / 3000.0, 14)) + 300.0 * vnoise(p / 2000.0, 15);
    float id;
    vec2 d = p - cellCentre(p, 8000.0, 30, id);
    float rr = length(d);
    float whorl = rr / 35.0 + atan(d.y, d.x) / 6.2831853;
    return mix(flow / 35.0, whorl, step(0.55, id) * (1.0 - sstep(900.0, 1700.0, rr)));
  }`;
