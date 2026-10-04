// src/scribble.js
// A scribble is one long ink line. Its head steers smoothly; its body is the path the head has
// drawn, kept as points exactly `spacing` apart, so the line always slides along its own trail and
// reads as a line being drawn in the air. Knotting, a scribble chases a point that runs along its
// owner's print ridges, so the trail tangles into a scribbled fingerprint. Pure (arrays only).
import { printPhase } from './print/phase.js';
import { rng, PATTERN_OF } from './hand/dna.js';

const TAU = Math.PI * 2;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
// v rotated about the unit axis k by angle a (Rodrigues)
function rotate(v, k, a) {
  const c = Math.cos(a), s = Math.sin(a), kv = cross(k, v), kd = dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
}
function turnTowards(dir, want, max) {
  const angle = Math.acos(Math.min(1, Math.max(-1, dot(dir, want))));
  if (angle <= max) return want.slice();
  let axis = cross(dir, want);
  if (len(axis) < 1e-6) axis = cross(dir, Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]); // straight behind: any side
  return norm(rotate(dir, norm(axis), max));
}

export function createScribble({ points = 90, spacing = 0.55, at = [0, 0, 0], dir = [0, 0, -1], seed = 1 } = {}) {
  const buf = new Float32Array(points * 3), line = new Float32Array((points + 1) * 3), rand = rng(seed);
  buf.set(at, 0);
  let newest = 0, filled = 1;
  const push = (p) => {
    newest = (newest + 1) % points;
    buf.set(p, newest * 3);
    filled = Math.min(points, filled + 1);
  };
  return {
    pos: at.slice(), dir: norm(dir), loop: 0, loopAxis: [1, 0, 0], sway: rand() * TAU,

    step(dt, target, { speed = 9, turn = 2.5, loops = 0.06, loopTime = 1.1, wander = 0.35 } = {}) {
      let want = sub(target, this.pos);
      want = len(want) < 1e-3 ? this.dir : norm(want);
      this.sway += dt * (0.6 + 0.3 * Math.sin(this.sway * 0.37));
      if (wander) want = norm(rotate(want, [0, 1, 0], wander * Math.sin(this.sway)));
      if (this.loop > 0) {
        this.dir = norm(rotate(this.dir, this.loopAxis, (TAU / loopTime) * dt));
        this.loop -= dt;
      } else {
        this.dir = turnTowards(this.dir, want, turn * dt);
        if (rand() < loops * dt) {
          this.loop = loopTime;
          const side = cross(this.dir, [0, 1, 0]);
          this.loopAxis = len(side) > 1e-3 ? norm(rotate(norm(side), this.dir, (rand() - 0.5) * 1.2)) : [1, 0, 0];
        }
      }
      for (let k = 0; k < 3; k++) this.pos[k] += this.dir[k] * speed * dt;
      // lay trail points exactly `spacing` apart, however far this step went
      let last = [buf[newest * 3], buf[newest * 3 + 1], buf[newest * 3 + 2]], gap = sub(this.pos, last), g = len(gap);
      while (g >= spacing) {
        last = [last[0] + (gap[0] / g) * spacing, last[1] + (gap[1] / g) * spacing, last[2] + (gap[2] / g) * spacing];
        push(last);
        gap = sub(this.pos, last);
        g = len(gap);
      }
    },

    // head first; once drawn out, the tail is trimmed by however far the head is past the newest
    // point, so the line's length never changes while it moves
    polyline() {
      line.set(this.pos, 0);
      let n = 1;
      for (let k = 0; k < filled; k++, n++) {
        const j = ((newest - k + points) % points) * 3;
        line[n * 3] = buf[j];
        line[n * 3 + 1] = buf[j + 1];
        line[n * 3 + 2] = buf[j + 2];
      }
      if (filled === points) {
        const e = Math.min(1, len(sub(this.pos, [buf[newest * 3], buf[newest * 3 + 1], buf[newest * 3 + 2]])) / spacing);
        const t = (n - 1) * 3, u = (n - 2) * 3;
        for (let d = 0; d < 3; d++) line[t + d] += (line[u + d] - line[t + d]) * e;
      }
      return { xyz: line, count: n };
    },
  };
}

// The point a knotting scribble chases: it runs along the ridges of a print in a tilted plane over
// the hand, turns back at the edge onto the next ridge, and slowly drifts across the ridges so the
// knot fills in.
export function createKnot({ cls = 'whorl', seed = 1, center = [0, 0, 0], radius = 14, tilt = 0.5 } = {}) {
  const [pattern, mirror] = PATTERN_OF[cls], rand = rng(seed);
  const phase = (x, y) => printPhase(pattern, mirror ? -x : x, y, seed);
  let qx = (rand() - 0.5) * 1.2, qy = (rand() - 0.5) * 1.2, sign = 1, drift = rand() * TAU, spin = rand() * TAU;
  return {
    center: center.slice(), radius,
    step(dt, speed) {
      const e = 0.01;
      const gx = (phase(qx + e, qy) - phase(qx - e, qy)) / (2 * e), gy = (phase(qx, qy + e) - phase(qx, qy - e)) / (2 * e);
      const gl = Math.hypot(gx, gy) || 1;
      drift += dt * 0.4;
      const across = 0.25 * Math.sin(drift);
      const step = (speed * dt) / this.radius;
      qx += ((-gy / gl) * sign + (gx / gl) * across) * step;
      qy += ((gx / gl) * sign + (gy / gl) * across) * step;
      const r = Math.hypot(qx, qy);
      if (r > 0.95) {
        sign = -sign;
        qx *= 0.95 / r;
        qy *= 0.95 / r;
      }
      spin += dt * 0.05;
      const u = [Math.cos(spin), 0, Math.sin(spin)];
      const v = [-Math.sin(spin) * Math.cos(tilt), Math.sin(tilt), Math.cos(spin) * Math.cos(tilt)];
      return [0, 1, 2].map((k) => this.center[k] + this.radius * (qx * u[k] + qy * v[k]));
    },
  };
}
