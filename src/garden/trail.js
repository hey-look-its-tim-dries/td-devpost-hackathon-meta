// src/garden/trail.js
// The foxfire's seed trails: a long winding row of seeds laid out ahead of you. Fly the line and every seed rings
// a step higher (ting, ting, ting); lose the line for a moment and the tune starts over. Pure: main.js draws the
// seeds, plays the notes and hands out what was caught.
const N = 30, STEP = 62, REACH = 60, GAP = 2.2; // seeds in a line, metres between them, how near counts, seconds before a streak is lost
const rnd = (seed, i) => { const x = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453; return x - Math.floor(x); };

// a line of N points from 300 m ahead of `pos`, flying `yaw` (0 looks along -z), bending gently left and right and rising and falling a little
export function makeTrail(pos, yaw, seed = 1) {
  const pts = [], a = 0.5 + rnd(seed, 1), b = rnd(seed, 2) * 6.28, c = (rnd(seed, 3) - 0.5) * 0.02;
  let x = pos[0] - Math.sin(yaw) * 300, z = pos[2] - Math.cos(yaw) * 300, h = yaw;
  for (let i = 0; i < N; i++) {
    pts.push([x, pos[1] + 30 * Math.sin(i * 0.33 + b), z]);
    h += 0.085 * Math.sin(i * 0.3 * a + b) + c; // never more than a few degrees a seed: a line you can follow at speed
    x -= Math.sin(h) * STEP; z -= Math.cos(h) * STEP;
  }
  return pts;
}
// the note of the i-th seed in a row: C major pentatonic from C5, two octaves up and round again
const SCALE = [0, 2, 4, 7, 9];
export const tingHz = (i) => { const k = ((i % 10) + 10) % 10; return 523.25 * 2 ** ((SCALE[k % 5] + 12 * Math.floor(k / 5)) / 12); };

export function createTrail() {
  let pts = [], taken = new Set(), streak = 0, since = 99;
  return {
    begin(pos, yaw, seed) { pts = makeTrail(pos, yaw, seed); taken = new Set(); },
    lift(groundAt, clear = 70) { for (const p of pts) p[1] = Math.max(p[1], groundAt(p[0], p[2]) + clear); }, // never under the sand
    points: () => pts,
    isTaken: (i) => taken.has(i),
    get left() { return pts.length - taken.size; },
    get done() { return pts.length > 0 && taken.size === pts.length; },
    get streak() { return streak; },
    // you are at `pos`: the seeds you just flew through, each { i, streak (its note), last (it finished the line) }
    update(pos, dt) {
      since += dt;
      const got = [];
      for (let i = 0; i < pts.length; i++) {
        if (taken.has(i) || Math.hypot(pts[i][0] - pos[0], pts[i][1] - pos[1], pts[i][2] - pos[2]) > REACH) continue;
        if (since > GAP) streak = 0;
        taken.add(i); since = 0;
        got.push({ i, streak: streak++, last: taken.size === pts.length });
      }
      return got;
    },
  };
}
