import * as THREE from 'three';
import { createInk } from './ink.js';

// Wire birds. Each one is a real ridge of a print: it peels off the land, folds into a V at its
// middle and flies. Its wings keep the exact wiggle of that ridge, so no two birds are alike.
const PTS = 17;
const MAX = 64;
const UP = new THREE.Vector3(0, 1, 0);

// Resample a polyline (Vector3[] or [x, y] pairs) to n points evenly spaced along its length.
export function resample(points, n) {
  const p = points.map((q) => (Array.isArray(q) ? { x: q[0], y: q[1] } : { x: q.x, y: q.z }));
  const cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y));
  const total = cum[cum.length - 1] || 1;
  const out = [];
  for (let k = 0, j = 1; k < n; k++) {
    const s = (total * k) / (n - 1);
    while (j < p.length - 1 && cum[j] < s) j++;
    const t = (s - cum[j - 1]) / Math.max(1e-9, cum[j] - cum[j - 1]);
    out.push([p[j - 1].x + (p[j].x - p[j - 1].x) * t, p[j - 1].y + (p[j].y - p[j - 1].y) * t]);
  }
  return { points: out, length: total };
}

// A ridge as a wing shape: chord along x (-0.5..0.5), its wiggle across it, plus a song.
export function wingShape(points2d) {
  const { points } = resample(points2d, PTS);
  const [ax, ay] = points[0], [bx, by] = points[PTS - 1];
  const chord = Math.hypot(bx - ax, by - ay) || 1, c = (bx - ax) / chord, s = (by - ay) / chord;
  const mid = points[(PTS - 1) / 2];
  const curve = points.map(([x, y]) => {
    const dx = x - mid[0], dy = y - mid[1];
    return [(dx * c + dy * s) / chord, (-dx * s + dy * c) / chord];
  });
  // the song follows how much the ridge bends along its length
  const song = [];
  for (let i = 2; i < PTS; i += 3) song.push(Math.min(1, Math.abs(curve[i][1] - curve[i - 2][1]) * 6 + (i / PTS) * 0.3));
  return { curve, chord, song };
}

export function createFlock() {
  const ink = createInk(MAX * (PTS - 1));
  const birds = [];
  const f = new THREE.Vector3(), r = new THREE.Vector3(), u = new THREE.Vector3(), tmp = new THREE.Vector3();
  const desired = new THREE.Vector3(), pts = Array.from({ length: PTS }, () => new THREE.Vector3());

  function shapeInto(b, t, scale) {
    f.copy(b.heading);
    r.crossVectors(f, UP).normalize();
    u.crossVectors(r, f).normalize();
    const fold = 0.3 + 0.45 * Math.sin(b.phase + t * b.flap);
    const span = b.span * scale;
    for (let i = 0; i < PTS; i++) {
      const [cx, cz] = b.curve[i];
      const x = cx * span, y = Math.abs(cx) * span * Math.tan(fold), back = cz * span * 0.8 + Math.abs(cx) * span * 0.35;
      pts[i].copy(b.pos).addScaledVector(r, x).addScaledVector(u, y).addScaledVector(f, -back);
    }
  }

  return {
    mesh: ink.mesh,
    birds,

    // ridge: world points along the ridge on the table. Returns the bird.
    add({ ridge, span = null, origin = 'home', rare = false }) {
      if (birds.length >= MAX) birds.shift();
      const shape = wingShape(ridge);
      const mid = ridge[Math.floor(ridge.length / 2)];
      const b = {
        curve: shape.curve,
        song: shape.song,
        span: span ?? THREE.MathUtils.clamp(shape.chord, 0.035, 0.09),
        flat: resample(ridge, PTS).points.map(([x, z], i) => new THREE.Vector3(x, THREE.MathUtils.lerp(ridge[0].y, ridge[ridge.length - 1].y, i / (PTS - 1)), z)),
        pos: mid.clone().add(new THREE.Vector3(0, 0.05, 0)),
        vel: new THREE.Vector3(),
        heading: new THREE.Vector3(0, 0, -1),
        phase: Math.random() * 6.28,
        flap: 6 + Math.random() * 2.5,
        mode: 'peel',
        t: 0,
        slot: birds.length,
        origin,
        rare,
      };
      birds.push(b);
      return b;
    },

    // a bird remembered from an earlier session: same wings and song, no peeling off
    revive({ curve, span, song, origin = 'home', rare = false }, at) {
      if (birds.length >= MAX) return null;
      const b = {
        curve, song, span, flat: null,
        pos: at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.2, (Math.random() - 0.5) * 0.2)),
        vel: new THREE.Vector3(), heading: new THREE.Vector3(0, 0, -1),
        phase: Math.random() * 6.28, flap: 6 + Math.random() * 2.5,
        mode: 'circle', t: 0, slot: birds.length, origin, rare,
      };
      birds.push(b);
      return b;
    },

    // move every bird by a world offset (the world re-roots under you when you land)
    shift(delta) {
      for (const b of birds) {
        b.pos.add(delta);
        b.flat?.forEach((p) => p.add(delta));
      }
    },

    // what a bird needs to be remembered (its wing is a generated ridge, never anything measured)
    memory: (b) => ({ curve: b.curve.map(([x, z]) => [+x.toFixed(4), +z.toFixed(4)]), span: +b.span.toFixed(4), song: b.song.map((v) => +v.toFixed(3)), origin: b.origin, rare: b.rare }),

    // ctx: { fingertip: Vector3|null, center: Vector3 (circle centre), follow: {point, forward, spread}|null }
    update(dt, time, ctx) {
      birds.forEach((b, i) => {
        b.t += dt;
        if (b.mode === 'peel' && b.t > 1.3) { b.mode = ctx.fingertip ? 'perch' : 'circle'; b.t = 0; }
        if (b.mode === 'perch' && (b.t > 3 || !ctx.fingertip)) { b.mode = 'circle'; b.t = 0; }
        if (ctx.follow && b.mode !== 'peel') b.mode = 'follow';
        if (!ctx.follow && b.mode === 'follow') { b.mode = 'circle'; b.t = 0; }

        let speed = 0.35;
        if (b.mode === 'peel') desired.set(0, 0.03, 0);
        else {
          if (b.mode === 'perch') { tmp.copy(ctx.fingertip); tmp.y += 0.03; }
          else if (b.mode === 'circle') {
            const a = time * (0.45 + (i % 5) * 0.06) + i * 1.7, rad = 0.12 + (i % 3) * 0.035;
            tmp.set(Math.cos(a) * rad, 0.2 + Math.sin(a * 0.7) * 0.03 + (i % 4) * 0.012, Math.sin(a) * rad).add(ctx.center);
          } else {
            const { point, forward, spread } = ctx.follow;
            r.crossVectors(forward, UP).normalize();
            const side = ((i % 2) * 2 - 1) * (0.5 + Math.floor(i / 2) * 0.35);
            tmp.copy(point).addScaledVector(r, side * spread).addScaledVector(UP, (Math.sin(time + i) * 0.25 + (i % 3) * 0.15) * spread)
              .addScaledVector(forward, -Math.floor(i / 2) * 0.3 * spread);
            speed = 7 * spread; // spread = world metres per felt metre while you are bird-sized
          }
          desired.subVectors(tmp, b.pos).multiplyScalar(2.2);
          if (desired.length() > speed) desired.setLength(speed);
        }
        b.vel.lerp(desired, 1 - Math.exp(-dt * 3.5));
        b.pos.addScaledVector(b.vel, dt);
        if (b.vel.lengthSq() > 1e-6) {
          tmp.copy(b.vel).setY(b.vel.y * 0.3).normalize();
          b.heading.lerp(tmp, 1 - Math.exp(-dt * 4)).normalize();
        }
      });
    },

    draw(time, scale = 1) {
      ink.begin();
      ink.width = 0.0016 * scale;
      for (const b of birds) {
        shapeInto(b, time, scale);
        if (b.mode === 'peel') {
          const e = THREE.MathUtils.smootherstep(Math.min(1, b.t / 1.3), 0, 1);
          for (let i = 0; i < PTS; i++) pts[i].lerpVectors(b.flat[i], pts[i], e);
        }
        ink.polyline(pts);
      }
      ink.end();
    },
  };
}
