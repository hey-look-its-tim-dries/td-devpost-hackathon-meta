// src/world/fit.js
// The fit finder (spec 6.2): where a new Hand can lie on the world's frontier. The world goes on a
// grid of 60 m cells, each knowing how far it is from land and whose land that is (the Source counts
// as land: it stays open water). A candidate pose puts one point of the new Hand's coast (its wrist,
// its little-finger edge, its thumb edge or its middle fingertip) on a frontier cell, at one of 48
// rotations. Poses that cover land are out; the rest score for rivers whose mouths meet, a snug
// coast, a round world, and nobody crowded. The three best that lie far enough apart win. Pure.
import { insideHand, inPolygon, OUTLINE, FINGERS } from '../hand/shape.js';
import { toWorld, toHand, SOURCE_RADIUS } from './founders.js';
import { WORLD } from './units.js';

const SPAN = 600 * WORLD;
const NEAR = 5; // cells (300 m, 30 hand metres): a coast this close counts as snug
const BOX = [[-200, -20], [300, -20], [-200, 640], [300, 640]]; // round any Hand, hand metres
const along = (f, u, t) => [f.base[0] + f.side[0] * u + f.dir[0] * t, f.base[1] + f.side[1] * u + f.dir[1] * t];
const tip = (f) => along(f, 0, f.len);
const ANCHORS = [OUTLINE[40], OUTLINE[8], OUTLINE[60], tip(FINGERS[2])]; // wrist, little-finger edge, thumb edge, middle fingertip

const segDist = (px, py, [ax, ay], [bx, by]) => {
  const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(px - ax - vx * t, py - ay - vy * t);
};
const toOutline = (shape, X, Y) => {
  let d = Infinity;
  for (let i = 0; i < shape.outline.length; i++) d = Math.min(d, segDist(X, Y, shape.outline[i], shape.outline[(i + 1) % shape.outline.length]));
  return d;
};

// the points that stand for a Hand (hand metres): its coast, palm and fingers; and inside it
export function handSamples(shape) {
  const coast = [
    ...shape.outline.filter((_, i) => i % 2 === 0),
    ...shape.fingers.flatMap((f) => [tip(f), ...[0.25, 0.5, 0.75].flatMap((s) => [along(f, -f.width / 2, s * f.len), along(f, f.width / 2, s * f.len)])]),
  ];
  const inner = shape.fingers.flatMap((f) => [0.15, 0.4, 0.65, 0.9].map((s) => along(f, 0, s * f.len)));
  for (let X = -140; X <= 160; X += 40) for (let Y = 30; Y <= 330; Y += 40) if (inPolygon(shape.outline, X, Y)) inner.push([X, Y]);
  return { coast, inner };
}

// where the Hand's rivers reach its coast, and which way they flow out (hand metres)
export function riverMouths(shape) {
  const out = [];
  for (const l of shape.lines) for (const [end, prev] of [[l.pts[0], l.pts[1]], [l.pts[l.pts.length - 1], l.pts[l.pts.length - 2]]]) {
    if (toOutline(shape, end[0], end[1]) > 25) continue;
    const dx = end[0] - prev[0], dy = end[1] - prev[1], d = Math.hypot(dx, dy) || 1;
    out.push({ at: end, dir: [dx / d, dy / d] });
  }
  return out;
}

export const scorePose = ({ rivers, snug, distance, crowd }) => 40 * rivers + 30 * snug - 8 * (distance / SPAN) - 5 * Math.max(0, crowd - 4);

const worldMouth = (pose, m) => {
  const a = toWorld(pose, m.at[0], m.at[1]), b = toWorld(pose, m.at[0] + m.dir[0], m.at[1] + m.dir[1]), d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return { at: a, dir: [(b[0] - a[0]) / d, (b[1] - a[1]) / d] };
};

export function findFits(world, shape, { cell = 60, rotations = 48, stride = 3, keep = 3, apart = 3000 } = {}) {
  let minX = -SOURCE_RADIUS, maxX = SOURCE_RADIUS, minZ = -SOURCE_RADIUS, maxZ = SOURCE_RADIUS;
  for (const h of world) for (const [X, Y] of BOX) {
    const [x, z] = toWorld(h.pose, X, Y);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  const pad = 1.3 * SPAN, x0 = minX - pad, z0 = minZ - pad;
  const W = Math.ceil((maxX - minX + 2 * pad) / cell), H = Math.ceil((maxZ - minZ + 2 * pad) / cell);
  // land and the Source are 0; every cell up to NEAR away gets its distance and whose land it is
  const dist = new Uint8Array(W * H).fill(255), owner = new Int8Array(W * H), queue = [];
  const inBox = ([X, Y]) => X > -200 && X < 300 && Y > -20 && Y < 640;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const x = x0 + (c + 0.5) * cell, z = z0 + (r + 0.5) * cell, source = Math.hypot(x, z) < SOURCE_RADIUS;
    const who = source ? -1 : world.findIndex((h) => { const p = toHand(h.pose, x, z); return inBox(p) && insideHand(h.shape, p[0], p[1]); });
    if (!source && who < 0) continue;
    dist[r * W + c] = 0;
    owner[r * W + c] = who;
    queue.push(r * W + c);
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], d = dist[i] + 1;
    if (d > NEAR) continue;
    for (const j of [i - 1, i + 1, i - W, i + W]) if (dist[j] > d) { dist[j] = d; owner[j] = owner[i]; queue.push(j); }
  }
  const { coast, inner } = handSamples(shape), samples = [...coast, ...inner].map(([X, Y]) => [X * WORLD, Y * WORLD]);
  const mouths = riverMouths(shape), open = world.flatMap((h) => riverMouths(h.shape).map((m) => worldMouth(h.pose, m)));
  const centres = world.map((h) => toWorld(h.pose, 0, 230));
  const found = [];
  // ponytail: every pose scored in one pass on the main thread (~0.25 s); a worker when the world grows past a few dozen Hands
  for (let i = 0, k = 0; i < W * H; i++) {
    if (dist[i] !== 2 || k++ % stride) continue; // the frontier: two cells off the coast (one cell is the overlap margin)
    const fx = x0 + ((i % W) + 0.5) * cell, fz = z0 + (Math.floor(i / W) + 0.5) * cell;
    for (let q = 0; q < rotations; q++) {
      const rot = (q / rotations) * Math.PI * 2, c = Math.cos(rot), s = Math.sin(rot);
      for (const [ax, ay] of ANCHORS) {
        const px = fx - (c * ax + s * ay) * WORLD, pz = fz - (s * ax - c * ay) * WORLD;
        let overlap = 0, snug = 0, ok = true;
        const next = new Set();
        for (let n = 0; n < samples.length; n++) {
          const [X, Y] = samples[n], gc = Math.floor((px + c * X + s * Y - x0) / cell), gr = Math.floor((pz + s * X - c * Y - z0) / cell);
          if (gc < 0 || gr < 0 || gc >= W || gr >= H) { ok = false; break; }
          const d = dist[gr * W + gc];
          if (d <= 1 && ++overlap > 1) { ok = false; break; }
          if (n < coast.length && d >= 2 && d <= NEAR) { snug++; next.add(owner[gr * W + gc]); }
        }
        if (!ok || !snug) continue;
        const pose = { x: px, z: pz, rot, mirror: false };
        let rivers = 0;
        for (const m of mouths) {
          const w = worldMouth(pose, m);
          if (open.some((o) => Math.hypot(o.at[0] - w.at[0], o.at[1] - w.at[1]) < 400 && o.dir[0] * w.dir[0] + o.dir[1] * w.dir[1] < -0.82)) rivers++; // within 35 degrees of head-on
        }
        const centre = toWorld(pose, 0, 230);
        const crowd = centres.filter(([x, z]) => Math.hypot(x - centre[0], z - centre[1]) < 1.6 * SPAN).length;
        const fit = { pose, rivers, snug: snug / coast.length, centre, next: [...next] };
        fit.score = scorePose({ rivers, snug: fit.snug, distance: Math.hypot(centre[0], centre[1]), crowd });
        found.push(fit);
      }
    }
  }
  found.sort((a, b) => b.score - a.score);
  const best = [];
  for (const f of found) {
    if (best.every((b) => Math.hypot(b.centre[0] - f.centre[0], b.centre[1] - f.centre[1]) >= apart)) best.push(f);
    if (best.length === keep) break;
  }
  return best;
}
