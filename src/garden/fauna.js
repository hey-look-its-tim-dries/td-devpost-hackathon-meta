// src/garden/fauna.js
// The wildlife a blooming plot draws, as you see it from the air: flocks of birds circling over their plot,
// clouds of insects low over the flowers, fish leaping from the river beside it, herds walking on the sand.
// Stylised and big (a songbird spans 6 m, a giraffe stands 22 m), flat-shaded in the species' own two
// colours. Four instanced draws in all: every kind is one mesh that holds all its forms, and the vertex
// shader folds away the forms an individual is not. Wings fold and legs swing in the vertex shader too.
// Flyers and fish are pure functions of time (nothing to integrate, nothing to remember but the height of
// the ground under them); the herds walk, so they keep a little state. Who lives where: fauna-plan.js.
import * as THREE from 'three';
import { FORMS } from './species.js';
import { planFauna, herdSize, hash32, KIND_KEY, DEFAULT_MAX } from './fauna-plan.js';

export { herdSize, planFauna };

const TAU = Math.PI * 2;
const SHADE = '0.5'; // how much of the scene's light shapes them (1: plain Lambert, 0: flat colour). The haze always applies
const RANGE = { birds: 5000, insects: 2600, fish: 3600, animals: 5000 }; // metres from you to the edge of a plot; the small ones are specks long before
const SONGBIRD = 0, RAPTOR = 1, WADER = 2, HUMMER = 3, BUTTERFLY = 0, DRAGONFLY = 1, HARE = 5;
// birds: how fast they fly (m/s) and how many wingbeats a second
const BIRDS = [{ v: 30, flap: 3.2 }, { v: 20, flap: 0.8 }, { v: 19, flap: 1.5 }, { v: 0, flap: 11 }];
const INSECT_FLAP = [4.5, 13, 18];
// animals: walking speed (m/s), how far the legs swing (rad), a full stride (m), half the body (m, to feel the
// slope), how fast they turn (rad/s), the room each takes in the herd (m), the height of a hop (m)
const ANIMALS = [
  { v: 8, amp: 0.55, stride: 11.3, half: 3.8, turn: 1.3, room: 12, hop: 0 },
  { v: 7, amp: 0.6, stride: 5.2, half: 3.3, turn: 1.8, room: 11, hop: 0 },
  { v: 5.5, amp: 0.45, stride: 12.2, half: 4.5, turn: 0.9, room: 15, hop: 0 },
  { v: 7, amp: 0.3, stride: 11.8, half: 3.4, turn: 0.8, room: 14, hop: 0 },
  { v: 1.1, amp: 0.35, stride: 2.1, half: 3.7, turn: 0.45, room: 11, hop: 0 },
  { v: 9, amp: 0.7, stride: 9, half: 2.4, turn: 2.4, room: 8, hop: 2.2 },
];
const SEAT = [9.5, 5.5, 13.5, 14, 5.5, 4.5]; // how high a rider sits on each body plan (m, at size 1): antelope, fox, camel, giraffe, tortoise, hare
const BP = 17, IP = 17, FP = 6, AP = 6; // numbers per individual that never change (see the init functions)
const GS = 4, FS = 6, AS = 10, HS = 6; // numbers per individual, and per herd, that do

const rnd = (seed, k) => hash32(seed, k) / 4294967296;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (x) => x * x * (3 - 2 * x);

// ---------- shapes: z is forward, y is up, metres at size 1 ----------

const AXES = [1, 0, Math.SQRT1_2, Math.SQRT1_2, 0, 1, -Math.SQRT1_2, Math.SQRT1_2];
const FACES = [[0, 4, 6, 2], [1, 3, 7, 5], [0, 1, 5, 4], [2, 6, 7, 3], [0, 2, 3, 1], [4, 5, 7, 6]];

// Collects triangles for one mesh. Every vertex knows its form and whether it wears the accent colour, and
// four numbers more: for a wing its side and how far out along the span it sits (before and beyond the wrist);
// for a leg its hip (y, z), when in the stride it swings and how much.
function shapes() {
  const pos = [], info = [], ext = [], idx = [], seen = new Map();
  let form = 0;
  // faces are shaded flat from screen derivatives, so triangles of one colour may share their corners
  const v = (x, y, z, acc, a = 0, b = 0, c = 0, d = 0) => {
    const key = `${form} ${x} ${y} ${z} ${acc} ${a} ${b} ${c} ${d}`;
    if (!seen.has(key)) { seen.set(key, pos.length / 3); pos.push(x, y, z); info.push(form, acc); ext.push(a, b, c, d); }
    return seen.get(key);
  };
  const api = {
    form(i) { form = i; return api; },
    tri(a, b, c, acc = 0) { idx.push(v(a[0], a[1], a[2], acc), v(b[0], b[1], b[2], acc), v(c[0], c[1], c[2], acc)); return api; },
    // a body: diamonds [z, width, height, y] joined nose to tail (0 wide: a point). tones per joint: 0 back in
    // the body colour and belly in the accent, 1 all accent, 2 all body colour
    spindle(rings, tones = []) {
      const corner = ([z, w, h, y = 0], q) => (q === 0 ? [0, y + h / 2, z] : q === 1 ? [w / 2, y, z] : q === 2 ? [0, y - h / 2, z] : [-w / 2, y, z]);
      for (let k = 0; k + 1 < rings.length; k++) {
        const a = rings[k], b = rings[k + 1], tone = tones[k] || 0;
        for (let q = 0; q < 4; q++) {
          const q2 = (q + 1) % 4, acc = tone === 1 ? 1 : tone === 2 ? 0 : q === 1 || q === 2 ? 1 : 0;
          if (a[1] > 0) api.tri(corner(a, q), corner(a, q2), corner(b, q2), acc);
          if (b[1] > 0) api.tri(corner(a, q), corner(b, q2), corner(b, q), acc);
        }
      }
      return api;
    },
    // a pair of wings from the root (x, y) outward: stations [distance along the span, z of the leading edge,
    // z of the trailing edge]; beyond `wrist` the wing folds a second time. tones: accent per panel
    wing(rootX, rootY, st, wrist, tones = []) {
      for (const side of [-1, 1]) for (let k = 0; k + 1 < st.length; k++) {
        const acc = tones[k] || 0, a = st[k], b = st[k + 1];
        const p = (s, z) => v(side * rootX, rootY, z, acc, side, Math.min(s[0], wrist), Math.max(s[0] - wrist, 0), 0);
        const i0 = p(a, a[1]), i1 = p(a, a[2]), i2 = p(b, b[2]);
        idx.push(i0, i1, i2);
        if (b[1] !== b[2]) idx.push(i0, i2, p(b, b[1]));
      }
      return api;
    },
    // a box standing on the middle of its base (bx, by, bz): sx wide, sy tall, sz long; its top may be smaller
    // (top, topZ), and it may lean forward (pitch) or sideways (roll) about its base. leg: [hip y, hip z, phase, swing]
    box(bx, by, bz, sx, sy, sz, { acc = 0, pitch = 0, roll = 0, top = 1, topZ = top, leg = null } = {}) {
      const cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll), at = [];
      for (let i = 0; i < 8; i++) {
        const up = i & 2 ? 1 : 0, x = (i & 1 ? 0.5 : -0.5) * sx * (up ? top : 1), y = up * sy, z = (i & 4 ? 0.5 : -0.5) * sz * (up ? topZ : 1);
        const y1 = y * cp - z * sp, z1 = z * cp + y * sp;
        at.push(v(bx + x * cr + y1 * sr, by + y1 * cr - x * sr, bz + z1, acc, leg ? leg[0] : 0, leg ? leg[1] : 0, leg ? leg[2] : 0, leg ? leg[3] : 0));
      }
      for (const f of FACES) idx.push(at[f[0]], at[f[1]], at[f[2]], at[f[0]], at[f[2]], at[f[3]]);
      return api;
    },
    // four legs of a walker: the diagonal pairs swing together (or, bounding, the front pair and the hind pair)
    legs(x, zFront, zHind, len, w, { bound = false, wHind = w, lenHind = len } = {}) {
      for (const side of [-1, 1]) {
        api.box(side * x, 0, zFront, w, len, w, { acc: 1, top: 1.25, leg: [len, zFront, bound ? 0 : side > 0 ? 0 : Math.PI, 1] });
        api.box(side * x, 0, zHind, wHind, lenHind, wHind, { acc: 1, top: 1.35, leg: [lenHind, zHind, bound ? Math.PI : side > 0 ? Math.PI : 0, 1] });
      }
      return api;
    },
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 2));
      g.setAttribute('aExt', new THREE.Float32BufferAttribute(ext, 4));
      g.setIndex(idx);
      return g;
    },
  };
  return api;
}

function birdShapes() {
  const s = shapes();
  // songbird: 6 m across, short pointed wings, a fan of a tail
  s.form(SONGBIRD).spindle([[1.7, 0, 0], [1.1, 0.7, 0.7], [0.2, 1.1, 1.0], [-1.5, 0.3, 0.25]], [1])
    .tri([0, 0.05, -1.1], [-0.85, 0.05, -2.6], [0.85, 0.05, -2.6])
    .wing(0.35, 0.15, [[0, 0.9, -0.7], [1.5, 1.0, -0.8], [2.65, -0.9, -0.9]], 1.5, [0, 1]);
  // raptor: 14 m, broad square wings with dark hands, a wide banded tail
  s.form(RAPTOR).spindle([[2.9, 0, 0], [2.1, 1.0, 0.95], [0.4, 1.7, 1.4], [-2.4, 0.5, 0.4]], [1])
    .tri([0, 0, -1.8], [-1.7, 0, -4.2], [1.7, 0, -4.2])
    .tri([-1.7, 0, -4.2], [1.7, 0, -4.2], [2.0, 0, -5.0], 1).tri([-1.7, 0, -4.2], [2.0, 0, -5.0], [-2.0, 0, -5.0], 1)
    .wing(0.6, 0.2, [[0, 1.7, -1.7], [3.4, 2.0, -1.6], [6.4, 1.3, -1.1]], 3.4, [0, 1]);
  // wader: 9 m, the neck and the bill stretched out ahead, the legs trailing behind
  s.form(WADER).spindle([[6.0, 0, 0, 0.2], [4.6, 0.55, 0.6, 0.25], [3.2, 0.4, 0.4, 0.15], [1.2, 1.1, 1.0], [-0.2, 1.2, 1.1], [-1.9, 0.3, 0.3]], [1, 2])
    .tri([0, 0.05, -1.5], [-0.6, 0.05, -2.5], [0.6, 0.05, -2.5]);
  for (const x of [-0.25, 0.25]) s.tri([x - 0.16, -0.2, -1.4], [x + 0.16, -0.2, -1.4], [x, -0.3, -5.6], 1);
  s.wing(0.45, 0.2, [[0, 1.3, -0.9], [2.2, 1.5, -0.9], [4.05, -0.3, -0.3]], 2.2, [0, 1]);
  // hummer: a fat little body, a needle of a bill, narrow wings that never stop
  s.form(HUMMER).spindle([[2.4, 0, 0, 0.05], [1.0, 0.45, 0.45, 0.05], [0.4, 0.95, 0.9], [-0.3, 0.8, 0.8], [-1.2, 0.3, 0.2]], [1])
    .tri([0, 0, -0.9], [-0.55, 0, -1.8], [0.55, 0, -1.8])
    .wing(0.35, 0.2, [[0, 0.5, -0.15], [0.65, 0.4, -0.4], [1.25, -0.55, -0.55]], 9, [0, 1]);
  return s.geometry();
}

function insectShapes() {
  const s = shapes();
  // butterfly: 3 m, two pairs of broad wings with dark edges
  s.form(BUTTERFLY).spindle([[0.8, 0, 0], [0.3, 0.28, 0.28], [-0.9, 0.12, 0.12]], [1, 1])
    .wing(0.1, 0.05, [[0, 0.55, 0.0], [0.9, 1.15, -0.1], [1.4, 1.0, 0.25]], 9, [0, 1])
    .wing(0.1, 0.05, [[0, 0.0, -0.5], [0.75, -0.1, -1.15], [1.1, -0.45, -0.95]], 9, [0, 1]);
  // dragonfly: a long needle of a tail, a big head, four narrow wings
  s.form(DRAGONFLY).spindle([[1.0, 0, 0], [0.7, 0.6, 0.55], [0.35, 0.4, 0.4], [0.0, 0.55, 0.5], [-0.6, 0.24, 0.24], [-3.4, 0.1, 0.1]], [1, 1, 2, 0, 0])
    .wing(0.2, 0.2, [[0, 0.3, -0.05], [1.1, 0.5, -0.1], [1.85, 0.3, 0.05]], 9, [1, 1])
    .wing(0.2, 0.2, [[0, -0.2, -0.55], [1.0, -0.2, -0.85], [1.7, -0.45, -0.7]], 9, [1, 1]);
  // bee: round and banded, small wings
  s.form(2).spindle([[0.85, 0, 0], [0.45, 0.75, 0.7], [0.0, 0.95, 0.9], [-0.4, 0.9, 0.85], [-0.75, 0.6, 0.55], [-1.0, 0, 0]], [1, 2, 1, 2, 1])
    .wing(0.3, 0.35, [[0, 0.3, -0.1], [0.7, 0.3, -0.5], [1.0, 0.0, -0.4]], 9, [1, 1]);
  return s.geometry();
}

function fishShapes() {
  // 6 m long, a tall thin body, a forked tail, a fin on its back and two at its sides
  const s = shapes();
  s.spindle([[3.0, 0, 0], [1.8, 0.7, 1.5], [0.3, 0.9, 1.9], [-1.6, 0.35, 0.7], [-2.2, 0.15, 0.4]])
    .tri([0, 0, -2.0], [0, 1.4, -3.2], [0, 0, -2.7], 1).tri([0, 0, -2.0], [0, -1.4, -3.2], [0, 0, -2.7], 1)
    .tri([0, 0.9, 0.9], [0, 1.8, -0.4], [0, 0.7, -0.9], 1);
  for (const x of [-1, 1]) s.tri([x * 0.4, -0.3, 1.2], [x * 1.4, -0.7, 0.3], [x * 0.4, -0.4, 0.5], 1);
  return s.geometry();
}

function animalShapes() {
  const s = shapes(), H = Math.PI / 2;
  // antelope: 9 m at the shoulder, slender legs, a raised neck, long horns swept back
  s.form(0).legs(0.85, 2.6, -2.6, 5.4, 0.7)
    .box(0, 5.2, 0, 2.4, 3.6, 7.6).box(0, 4.9, 0, 2.0, 0.9, 6.2, { acc: 1 })
    .box(0, 7.4, 3.0, 1.3, 4.6, 1.6, { pitch: 0.55, top: 0.8 })
    .box(0, 11.9, 4.6, 1.4, 3.2, 1.6, { pitch: H + 0.25, top: 0.6, acc: 1 })
    .box(0, 6.2, -3.9, 1.9, 2.2, 0.5, { acc: 1 })
    .box(0, 8.2, -3.9, 0.5, 1.8, 0.5, { pitch: -2.6, acc: 1, leg: [8.2, -3.9, 0, 0.4] });
  for (const x of [-1, 1]) s.box(x * 0.45, 12.4, 5.3, 0.32, 4.6, 0.32, { pitch: -0.55, roll: x * 0.16, top: 0.3, acc: 1 });
  // fox: low and long, a pointed muzzle, pricked ears, a great brush of a tail with a pale tip
  s.form(1).legs(0.75, 2.3, -2.3, 2.3, 0.7)
    .box(0, 2.1, 0, 2.1, 2.2, 6.6)
    .box(0, 3.3, 3.0, 2.3, 2.2, 2.4)
    .box(0, 4.2, 4.1, 1.4, 2.6, 1.3, { pitch: H, top: 0.4, acc: 1 })
    .box(0, 3.5, -3.1, 1.1, 3.0, 1.1, { pitch: -1.75, top: 1.7 })
    .box(0, 2.97, -6.05, 1.87, 3.0, 1.87, { pitch: -1.75, top: 0.2, acc: 1 });
  for (const x of [-1, 1]) s.box(x * 0.7, 5.4, 3.0, 0.9, 1.9, 0.6, { roll: x * 0.2, top: 0.1, topZ: 0.4, acc: 1 });
  // camel: long legs, one great hump, the neck carried forward and up
  s.form(2).legs(1.1, 3.2, -3.2, 7.0, 0.95)
    .box(0, 6.6, 0, 3.2, 4.0, 9.0)
    .box(0, 10.4, -0.4, 2.6, 3.8, 5.0, { top: 0.3 })
    .box(0, 8.4, 4.0, 1.5, 6.4, 1.8, { pitch: 0.5, top: 0.8 })
    .box(0, 14.3, 6.4, 1.4, 3.4, 1.6, { pitch: H + 0.1, top: 0.65, acc: 1 })
    .box(0, 9.8, -4.5, 0.45, 3.2, 0.45, { pitch: -2.8, acc: 1, leg: [9.8, -4.5, 0, 0.3] });
  // giraffe: 22 m to the horns, a short sloping body on stilts, patches on its back
  s.form(3).legs(1.0, 2.4, -2.4, 10, 0.95)
    .box(0, 9.6, 0, 2.8, 4.0, 6.8)
    .box(0, 11.4, 1.9, 2.5, 3.4, 3.0)
    .box(0, 13.4, 2.8, 1.6, 8.4, 1.8, { pitch: 0.42, top: 0.7 })
    .box(0, 21.3, 5.5, 1.2, 3.2, 1.4, { pitch: H + 0.2, top: 0.65, acc: 1 })
    .box(0, 13.2, -3.4, 0.4, 4.4, 0.4, { pitch: -2.9, acc: 1, leg: [13.2, -3.4, 0, 0.3] });
  for (const x of [-1, 1]) {
    s.box(x * 0.38, 21.9, 5.9, 0.28, 1.1, 0.28, { acc: 1 });
    s.box(x * 0.7, 13.55, -2.0, 1.0, 0.12, 1.5, { acc: 1 }).box(x * 0.7, 13.55, 0.1, 0.9, 0.12, 1.2, { acc: 1 }).box(x * 0.65, 14.75, 2.0, 0.8, 0.12, 1.4, { acc: 1 });
    s.box(x * 1.42, 10.4, -1.6, 0.1, 1.5, 1.8, { acc: 1 }).box(x * 1.42, 11.6, 0.4, 0.1, 1.3, 1.3, { acc: 1 }).box(x * 1.42, 10.0, 1.6, 0.1, 1.2, 1.2, { acc: 1 });
    s.box(x * 0.78, 15.6, 3.6, 0.1, 1.6, 1.0, { pitch: 0.42, acc: 1 }).box(x * 0.68, 18.2, 4.75, 0.1, 1.4, 0.9, { pitch: 0.42, acc: 1 });
  }
  // tortoise: a stepped dome of a shell on four stumps, the head poking out in front
  s.form(4).legs(2.3, 2.3, -2.3, 1.6, 1.4)
    .box(0, 1.0, 0, 5.8, 1.7, 7.6, { top: 0.82 })
    .box(0, 2.7, 0, 4.5, 1.2, 6.0, { top: 0.6, acc: 1 })
    .box(0, 3.9, 0, 2.5, 0.5, 3.4, { top: 0.5 })
    .box(0, 2.0, 3.4, 1.1, 2.6, 1.1, { pitch: H - 0.2, acc: 1 })
    .box(0, 1.9, 5.6, 1.6, 1.4, 1.9, { acc: 1, top: 0.8 })
    .box(0, 1.7, -3.6, 0.7, 1.5, 0.7, { pitch: -1.8, top: 0.2, acc: 1 });
  // hare: a round rump on big hind legs, tall ears, a pale scut
  s.form(HARE).legs(0.75, 1.7, -1.5, 2.0, 0.6, { bound: true, wHind: 1.0, lenHind: 2.6 })
    .box(0, 1.8, 0.3, 2.2, 2.3, 4.4)
    .box(0, 2.3, -1.3, 2.6, 2.5, 2.8, { top: 0.8 })
    .box(0, 3.5, 2.2, 1.7, 1.9, 2.2, { top: 0.85 })
    .box(0, 3.0, -2.9, 1.2, 1.2, 0.9, { acc: 1 });
  for (const x of [-1, 1]) {
    s.box(x * 0.45, 5.2, 2.0, 0.6, 3.6, 0.4, { pitch: -0.3, roll: x * 0.14, top: 0.6, acc: 1 });
    s.box(x * 0.95, 0, -0.7, 0.9, 0.5, 2.2, { acc: 1, leg: [2.6, -1.5, Math.PI, 1] });
  }
  return s.geometry();
}

// ---------- the two materials: Lambert in the scene's light and haze, with a fold for wings or a swing for legs ----------

const WING_GLSL = /* glsl */ `
  if (aExt.x != 0.0) { // a wing: turn it up about the root, and again beyond the wrist
    float a = iAnim.x, b = iAnim.x + iAnim.y;
    transformed.x += aExt.x * (cos(a) * aExt.y + cos(b) * aExt.z);
    transformed.y += sin(a) * aExt.y + sin(b) * aExt.z;
  }`;
const LEG_GLSL = /* glsl */ `
  if (aExt.w > 0.0) { // a leg (or a tail): swing it about its hip
    float a = iAnim.x * aExt.w * sin(iAnim.y + aExt.z), c = cos(a), s = sin(a);
    vec2 d = transformed.yz - aExt.xy;
    transformed.yz = aExt.xy + vec2(c * d.x - s * d.y, s * d.x + c * d.y);
  }`;

function material(deform, key, side) {
  const m = new THREE.MeshLambertMaterial({ flatShading: true, side });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
  attribute vec4 aExt;
  attribute vec2 aInfo;  // which form this vertex belongs to, and whether it wears the accent
  attribute vec4 iAnim;  // per individual: two angles, its form
  attribute vec3 iColA;
  attribute vec3 iColB;
  varying vec3 vFauna;`)
      .replace('#include <begin_vertex>', `vec3 transformed = position;
  ${deform}
  if (abs(aInfo.x - iAnim.z) > 0.5) transformed = vec3(0.0); // not this individual's form: folded away to nothing
  vFauna = mix(iColA, iColB, aInfo.y);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n  varying vec3 vFauna;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= vFauna;')
      .replace('#include <opaque_fragment>', `outgoingLight = mix(diffuseColor.rgb, outgoingLight, ${SHADE}); // flat colour first, a hint of the light on it\n  #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

// rotation (heading from its sine and cosine, nose up by pitch, rolled about the nose), scale and place, written
// straight into an instance matrix
let GROW = 1; // in the foxfire every animal and bird stands five times as tall (main.js sets it)
function put(m, o, x, y, z, sy, cy, sp, cp, sr, cr, s) {
  s *= GROW;
  m[o] = (cy * cr - sy * sp * sr) * s; m[o + 1] = cp * sr * s; m[o + 2] = (-sy * cr - cy * sp * sr) * s; m[o + 3] = 0;
  m[o + 4] = (-cy * sr - sy * sp * cr) * s; m[o + 5] = cp * cr * s; m[o + 6] = (sy * sr - cy * sp * cr) * s; m[o + 7] = 0;
  m[o + 8] = sy * cp * s; m[o + 9] = sp * s; m[o + 10] = cy * cp * s; m[o + 11] = 0;
  m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
}

// hover and dart (hummers, dragonflies): hangs at a stop, turns to the next, shoots across. Stops are hashed
// from the seed, so the path is a pure function of time. Leaves its answer in D.
const D = { x: 0, y: 0, z: 0, sy: 0, cy: 1, dart: 0 };
function dart(seed, q, cx, cz, reach, y0, yReach) {
  const k = Math.floor(q), u = q - k, k3 = k * 3;
  const x0 = cx + (rnd(seed, k3) * 2 - 1) * reach, z0 = cz + (rnd(seed, k3 + 2) * 2 - 1) * reach;
  const x1 = cx + (rnd(seed, k3 + 3) * 2 - 1) * reach, y1 = y0 + rnd(seed, k3 + 4) * yReach, z1 = cz + (rnd(seed, k3 + 5) * 2 - 1) * reach;
  const x2 = cx + (rnd(seed, k3 + 6) * 2 - 1) * reach, y2 = y0 + rnd(seed, k3 + 7) * yReach, z2 = cz + (rnd(seed, k3 + 8) * 2 - 1) * reach;
  const s = u < 0.7 ? 0 : smooth((u - 0.7) / 0.3);
  D.x = x1 + (x2 - x1) * s; D.y = y1 + (y2 - y1) * s; D.z = z1 + (z2 - z1) * s;
  const a0 = Math.atan2(x1 - x0, z1 - z0);
  let da = Math.atan2(x2 - x1, z2 - z1) - a0;
  da -= TAU * Math.round(da / TAU);
  const yaw = a0 + da * smooth(Math.min(1, u / 0.45));
  D.sy = Math.sin(yaw); D.cy = Math.cos(yaw); D.dart = 4 * s * (1 - s);
}

export function createFauna(species, { max = DEFAULT_MAX } = {}) {
  const caps = { ...DEFAULT_MAX, ...max };
  const group = new THREE.Group();
  group.name = 'fauna';

  // the species as numbers: two colours, a size, a form
  const colours = new Float32Array(species.length * 6), sizeOf = new Float32Array(species.length), formOf = new Uint8Array(species.length);
  const c = new THREE.Color();
  species.forEach((s, i) => {
    if (!s || !KIND_KEY[s.kind]) return;
    c.set(s.color || '#d9a05b'); colours[i * 6] = c.r; colours[i * 6 + 1] = c.g; colours[i * 6 + 2] = c.b;
    c.set(s.color2 || s.color || '#3a2a20'); colours[i * 6 + 3] = c.r; colours[i * 6 + 4] = c.g; colours[i * 6 + 5] = c.b;
    sizeOf[i] = clamp(+s.size || 1, 0.25, 4);
    formOf[i] = Math.max(0, FORMS[s.kind].indexOf(s.form));
  });

  // one mesh and one pool of individuals per kind
  const wingMat = material(WING_GLSL, 'fauna-wing', THREE.DoubleSide), legMat = material(LEG_GLSL, 'fauna-leg', THREE.FrontSide);
  function pool(key, geometry, mat, PS, SS) {
    const cap = Math.max(1, Math.floor(caps[key]));
    const inst = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    const anim = inst(4), ca = inst(3), cb = inst(3);
    geometry.setAttribute('iAnim', anim).setAttribute('iColA', ca).setAttribute('iColB', cb);
    const mesh = new THREE.InstancedMesh(geometry, mat, cap);
    mesh.name = `fauna-${key}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; // they are all over the sky; the count is what keeps this cheap
    mesh.count = 0;
    mesh.visible = false;
    group.add(mesh);
    return {
      key, cap, PS, SS, n: 0, mesh, anim, ca, cb, attrs: [mesh.instanceMatrix, anim, ca, cb], ranges: [0, 1, 2, 3].map(() => ({ start: 0, count: 0 })),
      sp: new Uint16Array(cap), seed: new Uint32Array(cap), P: new Float64Array(cap * PS), S: new Float64Array(cap * SS),
      first: new Int32Array(0), last: new Int32Array(0), old: null, oldS: null,
    };
  }
  const B = pool('birds', birdShapes(), wingMat, BP, GS), I = pool('insects', insectShapes(), wingMat, IP, GS);
  const F = pool('fish', fishShapes(), wingMat, FP, FS), A = pool('animals', animalShapes(), legMat, AP, AS);
  const pools = { bird: B, insect: I, fish: F, animal: A };
  // the herds: where each is heading, when it moves on
  const herd = { n: 0, seed: new Uint32Array(A.cap), plot: new Uint16Array(A.cap), S: new Float64Array(A.cap * HS) };
  let plots = [];
  let ox = 0, oz = 0; // the group sits near you and the instances are placed from there: no float jitter far from the origin

  // ---------- set(): who lives where ----------

  // P: 0 form, 1 2 centre, 3 radius, 4 turn (rad/s), 5 angle at 0 s, 6 height, 7 swoop, 8 sideways in the flock,
  // 9 10 phases, 11 wingbeat phase, 12 wingbeat (rad/s), 13 scale, 14 how far the circle breathes, 15 swoops per round, 16 above the flock
  // (a hummer: 1 2 the middle of its patch, 3 its reach, 4 seconds per stop, 5 offset, 6 lowest, 7 how much higher)
  function initBird(i, it, p) {
    const P = B.P, o = i * BP, G = it.group, s = it.seed, f = formOf[it.sp], sz = sizeOf[it.sp];
    const dir = rnd(G, 4) < 0.5 ? -1 : 1, a = rnd(G, 2) * TAU, nw = p.water.length / 2;
    P[o] = f; P[o + 11] = rnd(s, 7) * TAU; P[o + 12] = (BIRDS[f].flap * TAU * (0.9 + 0.2 * rnd(s, 8))) / Math.sqrt(sz); P[o + 13] = sz * (0.88 + 0.24 * rnd(s, 9));
    if (f === HUMMER) { // darts about a patch of flowers, low
      const d = p.r * 0.6 * Math.sqrt(rnd(G, 3));
      P[o + 1] = p.x + Math.cos(a) * d + (rnd(s, 1) - 0.5) * 50; P[o + 2] = p.z + Math.sin(a) * d + (rnd(s, 2) - 0.5) * 50;
      P[o + 3] = 30; P[o + 4] = 2 + rnd(s, 3) * 1.4; P[o + 5] = rnd(s, 4) * 40; P[o + 6] = 9; P[o + 7] = 20;
      return;
    }
    let cx = p.x, cz = p.z, R, h0, hA, lag = 0, lat = 0, up = 0, th = rnd(G, 7) * TAU, e, kh;
    if (f === RAPTOR) { // each soars its own slow wide circle, high
      R = Math.max(140, p.r * (0.55 + 0.35 * rnd(s, 1))); h0 = 150 + 60 * rnd(G, 5) + 10 * it.i; hA = 6; th = rnd(s, 4) * TAU; e = 0.07; kh = 0.6;
      cx += Math.cos(a) * p.r * 0.15; cz += Math.sin(a) * p.r * 0.15;
    } else if (f === WADER) { // a V low over the river, if there is one
      const mid = (it.n - 1) / 2;
      lag = Math.abs(it.i - mid) * 9 * sz; lat = (it.i - mid) * 7 * sz; e = 0.12; kh = 1.3; hA = 4;
      if (nw) { const w = Math.min(nw - 1, Math.floor(rnd(G, 9) * nw)); cx = p.water[w * 2]; cz = p.water[w * 2 + 1]; R = 50 + 50 * rnd(G, 1); h0 = 18 + 12 * rnd(G, 5); }
      else { cx += Math.cos(a) * p.r * 0.3; cz += Math.sin(a) * p.r * 0.3; R = p.r * (0.25 + 0.2 * rnd(G, 1)); h0 = 32 + 10 * rnd(G, 5); }
    } else { // a loose flock circling and swooping over the plot
      R = p.r * (0.3 + 0.3 * rnd(G, 1)); h0 = 60 + 50 * rnd(G, 5); hA = Math.min(h0 - 38, 152 - h0, 30) * (0.6 + 0.4 * rnd(G, 6)); e = 0.28; kh = 2.3;
      cx += Math.cos(a) * p.r * 0.25 * rnd(G, 3); cz += Math.sin(a) * p.r * 0.25 * rnd(G, 3);
      lag = (rnd(s, 1) - 0.5) * 60; lat = (rnd(s, 2) - 0.5) * 40; up = (rnd(s, 3) - 0.5) * 14;
    }
    P[o + 1] = cx; P[o + 2] = cz; P[o + 3] = R; P[o + 4] = (dir * BIRDS[f].v) / R; P[o + 5] = th - (dir * lag) / R;
    P[o + 6] = h0; P[o + 7] = hA; P[o + 8] = lat; P[o + 9] = rnd(G, 8) * TAU; P[o + 10] = rnd(G, 10) * TAU; P[o + 14] = e; P[o + 15] = kh; P[o + 16] = up;
  }

  // P: 0 form, 1 2 the middle of its cloud, 3 reach, 4 5 two paces (rad/s), 6..9 phases, 10 height, 11 wingbeat phase,
  // 12 wingbeat (rad/s), 13 scale, 14 rise and fall (a dragonfly: 4 seconds per stop, 5 offset, 10 lowest, 14 how much higher)
  function initInsect(i, it, p) {
    const P = I.P, o = i * IP, G = it.group, s = it.seed, f = formOf[it.sp], sz = sizeOf[it.sp];
    const cloud = it.i % Math.ceil(it.n / 8), a = rnd(G, 10 + 2 * cloud) * TAU, d = p.r * 0.8 * Math.sqrt(rnd(G, 11 + 2 * cloud)), nw = p.water.length / 2;
    P[o] = f; P[o + 1] = p.x + Math.cos(a) * d; P[o + 2] = p.z + Math.sin(a) * d;
    P[o + 11] = rnd(s, 7) * TAU; P[o + 12] = INSECT_FLAP[f] * TAU * (0.85 + 0.3 * rnd(s, 8)); P[o + 13] = sz * (0.85 + 0.3 * rnd(s, 9));
    for (let k = 0; k < 4; k++) P[o + 6 + k] = rnd(s, 10 + k) * TAU;
    if (f === DRAGONFLY) { // over the water, if there is any
      if (nw) { const w = Math.min(nw - 1, Math.floor(rnd(G, 30 + cloud) * nw)); P[o + 1] = p.water[w * 2]; P[o + 2] = p.water[w * 2 + 1]; }
      P[o + 3] = 24; P[o + 4] = 1.5 + rnd(s, 3); P[o + 5] = rnd(s, 4) * 40; P[o + 10] = 5; P[o + 14] = 16;
    } else if (f === BUTTERFLY) {
      P[o + 3] = 20 + 14 * rnd(s, 1); P[o + 4] = 0.22 + 0.2 * rnd(s, 2); P[o + 5] = 0.9 + 0.6 * rnd(s, 3); P[o + 10] = 11 + 11 * rnd(s, 4);
      P[o + 14] = Math.min(P[o + 10] - 6, 29 - P[o + 10]) * 0.9;
    } else { // bees: a tight busy knot
      P[o + 3] = 8 + 6 * rnd(s, 1); P[o + 4] = 0.9 + 0.7 * rnd(s, 2); P[o + 5] = 2.4 + 1.5 * rnd(s, 3); P[o + 10] = 8 + 6 * rnd(s, 4); P[o + 14] = 2.5;
    }
  }

  // P: 0 seconds between leaps, 1 offset, 2 how high, 3 how far, 4 scale, 5 seconds in the air
  function initFish(i, it) {
    const P = F.P, o = i * FP, s = it.seed, sz = sizeOf[it.sp];
    P[o] = 3.6 + 3.4 * rnd(s, 1); P[o + 1] = rnd(s, 2) * 60; P[o + 2] = (8 + 7 * rnd(s, 3)) * sz; P[o + 3] = (12 + 8 * rnd(s, 4)) * sz;
    P[o + 4] = sz * (0.85 + 0.3 * rnd(s, 5)); P[o + 5] = (1.9 + 0.5 * rnd(s, 6)) * Math.sqrt(sz);
  }

  // P: 0 form, 1 2 its place in the herd, 3 its pace (m/s), 4 scale, 5 its herd
  function initAnimal(i, it, p) {
    const P = A.P, o = i * AP, G = it.group, s = it.seed, f = formOf[it.sp], sz = sizeOf[it.sp], K = ANIMALS[f];
    if (it.i === 0) { // a new herd; one that was here before goes on from where it was heading
      const h = herd.n++, ho = h * HS, was = herd.old.get(G);
      herd.seed[h] = G; herd.plot[h] = it.plot;
      if (was !== undefined) for (let k = 0; k < HS; k++) herd.S[ho + k] = herd.oldS[was * HS + k];
      else { herd.S[ho + 2] = -1; herd.S[ho + 3] = 0; }
      herd.S[ho + 4] = Math.max(0, p.r * 0.8 - K.room * sz * Math.sqrt(it.n)); herd.S[ho + 5] = K.v * sz;
      if (was === undefined) herdStop(h, p);
    }
    const a = it.i * 2.399963 + rnd(G, 1) * TAU, d = K.room * sz * Math.sqrt(it.i + 0.6);
    P[o] = f; P[o + 1] = Math.cos(a) * d; P[o + 2] = Math.sin(a) * d; P[o + 3] = K.v * sz * (0.85 + 0.3 * rnd(s, 1)); P[o + 4] = sz * (0.88 + 0.24 * rnd(s, 2)); P[o + 5] = herd.n - 1;
  }
  // herd S: 0 1 where it is heading, 2 when it moves on (s; below 0: not started), 3 how many stops so far, 4 how far from the middle of the plot it may go, 5 its pace
  function herdStop(h, p) {
    const ho = h * HS, k = herd.S[ho + 3], G = herd.seed[h], a = rnd(G, 20 + 2 * k) * TAU, d = herd.S[ho + 4] * Math.sqrt(rnd(G, 21 + 2 * k));
    herd.S[ho] = p.x + Math.cos(a) * d; herd.S[ho + 1] = p.z + Math.sin(a) * d;
    // herds keep to the land: a stop in the water is tried again a little elsewhere (the game says what is land)
    for (let i = 1; land && i < 9 && !land(herd.S[ho], herd.S[ho + 1]); i++) { const b = rnd(G, 300 + 9 * k + i) * TAU, e = herd.S[ho + 4] * Math.sqrt(rnd(G, 400 + 9 * k + i)); herd.S[ho] = p.x + Math.cos(b) * e; herd.S[ho + 1] = p.z + Math.sin(b) * e; }
  }
  let land = null;
  const seat = { animals: new Float32Array(80), na: 0, birds: new Float32Array(80), nb: 0 };
  const INIT = { bird: initBird, insect: initInsect, fish: initFish, animal: initAnimal };

  function set(list) {
    list = Array.isArray(list) ? list : [];
    const plan = planFauna(list, species, caps), was = new Map(plots.map((p) => [`${p.x},${p.z}`, p.g]));
    plots = list.map((p) => {
      const water = new Float64Array((p.water || []).length * 2);
      (p.water || []).forEach((w, k) => { water[k * 2] = w[0]; water[k * 2 + 1] = w[1]; });
      return { x: +p.x || 0, z: +p.z || 0, r: +p.r || 100, water, river: new Float64Array(water.length * 2), g: was.get(`${+p.x || 0},${+p.z || 0}`) ?? NaN, d: Infinity };
    });
    // whoever was here before keeps what it remembers (the ground under it, where it stood)
    herd.old = new Map(); herd.oldS = herd.S.slice(0, herd.n * HS);
    for (let h = 0; h < herd.n; h++) herd.old.set(herd.seed[h], h);
    herd.n = 0;
    for (const kind in pools) {
      const pl = pools[kind];
      pl.old = new Map(); pl.oldS = pl.S.slice(0, pl.n * pl.SS);
      for (let i = 0; i < pl.n; i++) pl.old.set(pl.seed[i], i);
      pl.n = 0; pl.first = new Int32Array(plots.length); pl.last = new Int32Array(plots.length);
    }
    for (const it of plan) {
      const pl = pools[it.kind], i = pl.n++, so = i * pl.SS, o = pl.old.get(it.seed);
      if (pl.last[it.plot] === 0) pl.first[it.plot] = i;
      pl.last[it.plot] = i + 1;
      pl.sp[i] = it.sp; pl.seed[i] = it.seed;
      if (o !== undefined) for (let k = 0; k < pl.SS; k++) pl.S[so + k] = pl.oldS[o * pl.SS + k];
      else { pl.S.fill(0, so, so + pl.SS); pl.S[so + (it.kind === 'fish' ? 5 : it.kind === 'animal' ? 9 : 2)] = it.kind === 'animal' ? 0 : -1; }
      INIT[it.kind](i, it, plots[it.plot]);
    }
    for (const kind in pools) pools[kind].old = pools[kind].oldS = null;
    herd.old = herd.oldS = null;
  }

  // ---------- update(): one pass per kind, the plots in range only ----------

  const fade = (d, range) => clamp((range - d) / (range * 0.06), 0, 1); // they shrink to nothing at the edge of the range instead of popping
  const height = (groundAt, x, z, was) => { const h = groundAt(x, z); return h === h ? h : was; };

  // the ground under a flyer: its plot's to begin with, then sampled under it now and then, carried on at the
  // rate it was changing, and eased towards. S: 0 now, 1 the last sample, 2 when to sample next, 3 its rate (m/s)
  function ground(S, so, i, p, x, z, t, dt, every, groundAt) {
    const next = S[so + 2];
    if (next < 0 || t > next + every) { // new here, or back in range after a while: every one its own moment to sample, never the whole flock in one frame
      if (next < 0) S[so] = S[so + 1] = p.g;
      S[so + 2] = t + every * ((i * 0.618034) % 1); S[so + 3] = NaN;
    } else if (t >= next) {
      const h = height(groundAt, x, z, S[so + 1]);
      S[so + 3] = S[so + 3] === S[so + 3] ? clamp((h - S[so + 1]) / every, -20, 20) : 0;
      S[so + 1] = h; S[so + 2] = t + every;
    }
    S[so] += (S[so + 1] + (S[so + 3] || 0) * (t - S[so + 2] + every) - S[so]) * Math.min(1, dt * 6);
    return S[so];
  }
  function tint(pl, n, sp) {
    const o = n * 3, s = sp * 6;
    pl.ca.array[o] = colours[s]; pl.ca.array[o + 1] = colours[s + 1]; pl.ca.array[o + 2] = colours[s + 2];
    pl.cb.array[o] = colours[s + 3]; pl.cb.array[o + 1] = colours[s + 4]; pl.cb.array[o + 2] = colours[s + 5];
  }
  function flush(pl, n) {
    pl.mesh.count = n;
    pl.mesh.visible = n > 0;
    if (!n) return;
    for (let k = 0; k < 4; k++) { // upload only what is drawn; the range objects are kept (the renderer empties the list after each upload)
      const a = pl.attrs[k], r = pl.ranges[k];
      r.count = n * a.itemSize;
      if (a.updateRanges.length === 0) a.updateRanges.push(r);
      a.needsUpdate = true;
    }
  }

  function birds(dt, t, groundAt) {
    const P = B.P, S = B.S, M = B.mesh.instanceMatrix.array, AN = B.anim.array;
    let n = 0;
    for (let j = 0; j < plots.length; j++) {
      const p = plots[j], k = fade(p.d, RANGE.birds);
      if (k <= 0) continue;
      for (let i = B.first[j], end = B.last[j]; i < end; i++) {
        const o = i * BP, f = P[o], fl = P[o + 11] + P[o + 12] * t;
        let x, z, h, sy, cy, sp = 0, cp = 1, roll = 0, a, b = 0;
        if (f === HUMMER) {
          dart(B.seed[i], (t + P[o + 5]) / P[o + 4], P[o + 1], P[o + 2], P[o + 3], P[o + 6], P[o + 7]);
          x = D.x; z = D.z; h = D.y + 0.5 * Math.sin(t * 2.3 + P[o + 11]); sy = D.sy; cy = D.cy;
          const pitch = 0.75 - 0.6 * D.dart; // upright while it hovers, flat out when it darts
          sp = Math.sin(pitch); cp = Math.cos(pitch); a = Math.sin(fl);
        } else {
          const w = P[o + 4], th = P[o + 5] + w * t, st = Math.sin(th), ct = Math.cos(th), a1 = 1.6 * th + P[o + 9], a2 = P[o + 15] * th + P[o + 10];
          const rho = P[o + 3] * (1 + P[o + 14] * Math.sin(a1)) + P[o + 8], dr = P[o + 3] * P[o + 14] * 1.6 * w * Math.cos(a1);
          x = P[o + 1] + rho * ct; z = P[o + 2] + rho * st;
          h = P[o + 6] + P[o + 7] * Math.sin(a2) + P[o + 16];
          const vx = dr * ct - rho * w * st, vz = dr * st + rho * w * ct, vy = P[o + 7] * P[o + 15] * w * Math.cos(a2);
          const vh = Math.hypot(vx, vz) || 1, vv = Math.hypot(vh, vy);
          sy = vx / vh; cy = vz / vh; sp = vy / vv; cp = vh / vv;
          // banks into the turn it is really making: its sideways acceleration
          const ddr = -P[o + 3] * P[o + 14] * 2.56 * w * w * Math.sin(a1), ax = ddr * ct - 2 * dr * w * st - rho * w * w * ct, az = ddr * st + 2 * dr * w * ct - rho * w * w * st;
          roll = clamp((-0.16 * (ax * vz - az * vx)) / vh, -0.9, 0.9);
          if (f === RAPTOR) { // soars on raised wings, a few slow beats now and then
            const e = clamp((Math.sin(0.31 * t + P[o + 11]) - 0.75) * 4, 0, 1);
            a = 0.16 + e * 0.45 * Math.sin(fl); b = 0.12 + e * 0.35 * Math.sin(fl - 1.1);
          } else if (f === WADER) { a = 0.05 + 0.6 * Math.sin(fl); b = 0.45 * Math.sin(fl - 1.1); }
          else { // a songbird: a burst of beats, a short glide
            const e = clamp(Math.sin(0.9 * t + P[o + 11] * 1.7) * 2 + 0.6, 0, 1);
            a = 0.08 + e * 0.8 * Math.sin(fl); b = e * 0.5 * Math.sin(fl - 1.1);
          }
        }
        const g = ground(S, i * GS, i, p, x, z, t, dt, f === HUMMER ? 0.4 : 1, groundAt);
        if (n < 16) { const q = n * 5; seat.birds[q] = x; seat.birds[q + 1] = g + h + 1.2 * P[o + 13] * k; seat.birds[q + 2] = z; seat.birds[q + 3] = Math.atan2(sy, cy); seat.birds[q + 4] = P[o + 13] * k; } // a place for a gnome
        put(M, n * 16, x - ox, g + h, z - oz, sy, cy, sp, cp, Math.sin(roll), Math.cos(roll), P[o + 13] * k);
        AN[n * 4] = a; AN[n * 4 + 1] = b; AN[n * 4 + 2] = f;
        tint(B, n++, B.sp[i]);
      }
    }
    flush(B, n);
    seat.nb = Math.min(16, n);
  }

  function insects(dt, t, groundAt) {
    const P = I.P, S = I.S, M = I.mesh.instanceMatrix.array, AN = I.anim.array;
    let n = 0;
    for (let j = 0; j < plots.length; j++) {
      const p = plots[j], k = fade(p.d, RANGE.insects);
      if (k <= 0) continue;
      for (let i = I.first[j], end = I.last[j]; i < end; i++) {
        const o = i * IP, f = P[o], fl = P[o + 11] + P[o + 12] * t, beat = Math.sin(fl);
        let x, z, h, sy, cy, sp = 0, cp = 1, a;
        if (f === DRAGONFLY) {
          dart(I.seed[i], (t + P[o + 5]) / P[o + 4], P[o + 1], P[o + 2], P[o + 3], P[o + 10], P[o + 14]);
          x = D.x; z = D.z; h = D.y; sy = D.sy; cy = D.cy; a = 0.1 + 0.45 * beat;
        } else { // a jittery wander about the middle of the cloud: two paces on every axis
          const A0 = P[o + 3], f1 = P[o + 4], f2 = P[o + 5];
          const u1 = f1 * t + P[o + 6], u2 = f2 * t + P[o + 7], u3 = f1 * 0.87 * t + P[o + 8], u4 = f2 * 1.13 * t + P[o + 9], u5 = f1 * 1.31 * t + P[o + 9], u6 = f2 * 0.9 * t + P[o + 6];
          x = P[o + 1] + A0 * (Math.sin(u1) + 0.4 * Math.sin(u2)); z = P[o + 2] + A0 * (Math.sin(u3) + 0.4 * Math.sin(u4));
          h = P[o + 10] + P[o + 14] * (0.7 * Math.sin(u5) + 0.3 * Math.sin(u6));
          const vx = A0 * (f1 * Math.cos(u1) + 0.4 * f2 * Math.cos(u2)), vz = A0 * (0.87 * f1 * Math.cos(u3) + 0.4 * 1.13 * f2 * Math.cos(u4));
          const vy = P[o + 14] * (0.7 * 1.31 * f1 * Math.cos(u5) + 0.3 * 0.9 * f2 * Math.cos(u6)), vh = Math.hypot(vx, vz) || 1, vv = Math.hypot(vh, vy);
          sy = vx / vh; cy = vz / vh; sp = (0.5 * vy) / vv; cp = Math.sqrt(1 - sp * sp);
          if (f === BUTTERFLY) { a = 0.3 + 0.95 * beat; h -= 0.7 * P[o + 13] * beat; } // each stroke lifts it a little
          else a = 0.9 * beat;
        }
        const g = ground(S, i * GS, i, p, x, z, t, dt, 0.5, groundAt);
        put(M, n * 16, x - ox, g + h, z - oz, sy, cy, sp, cp, 0, 1, P[o + 13] * k);
        AN[n * 4] = a; AN[n * 4 + 1] = 0; AN[n * 4 + 2] = f;
        tint(I, n++, I.sp[i]);
      }
    }
    flush(I, n);
  }

  // Which way a river runs at one of a plot's water points: the banks are higher than the water, so the lowest of
  // four lines through the point is the river. Felt once per point (9 samples), then kept: x, z of the direction,
  // the height of the water, 1 a river / 2 open water with no banks to tell
  function riverAt(p, w, groundAt) {
    const x = p.water[w * 2], z = p.water[w * 2 + 1], R = p.river, o = w * 4, y = height(groundAt, x, z, p.g);
    let best = 0, lo = Infinity, hi = -Infinity;
    for (let k = 0; k < 4; k++) {
      const dx = AXES[k * 2] * 30, dz = AXES[k * 2 + 1] * 30, banks = height(groundAt, x + dx, z + dz, y) + height(groundAt, x - dx, z - dz, y);
      if (banks < lo) { lo = banks; best = k; }
      if (banks > hi) hi = banks;
    }
    R[o] = AXES[best * 2]; R[o + 1] = AXES[best * 2 + 1]; R[o + 2] = y; R[o + 3] = hi - lo > 1 ? 1 : 2;
  }

  // S: 0 1 2 where it leaves the water (x, z and the water's height), 3 4 which way, 5 which leap this is
  function fish(t, groundAt) {
    const P = F.P, S = F.S, M = F.mesh.instanceMatrix.array, AN = F.anim.array;
    let n = 0;
    for (let j = 0; j < plots.length; j++) {
      const p = plots[j], k = fade(p.d, RANGE.fish), W = p.water, nw = W.length / 2;
      if (k <= 0 || !nw) continue;
      for (let i = F.first[j], end = F.last[j]; i < end; i++) {
        const o = i * FP, so = i * FS, q = (t + P[o + 1]) / P[o], leap = Math.floor(q), s = ((q - leap) * P[o]) / P[o + 5];
        if (S[so + 5] !== leap) { // a new leap, at another of the plot's water points, up or down stream
          const seed = F.seed[i], w = Math.min(nw - 1, Math.floor(rnd(seed, leap * 4) * nw)), R = p.river, ro = w * 4;
          if (!R[ro + 3]) riverAt(p, w, groundAt);
          let dx = R[ro], dz = R[ro + 1];
          if (R[ro + 3] === 2) { const a = rnd(seed, leap * 4 + 1) * TAU; dx = Math.sin(a); dz = Math.cos(a); } // open water: any way will do
          const slide = (rnd(seed, leap * 4 + 2) - 0.5) * 24, turn = rnd(seed, leap * 4 + 3) < 0.5 ? -1 : 1;
          S[so] = W[w * 2] + dx * slide; S[so + 1] = W[w * 2 + 1] + dz * slide; S[so + 2] = R[ro + 2];
          S[so + 3] = dx * turn; S[so + 4] = dz * turn; S[so + 5] = leap;
        }
        if (s >= 1) continue; // under water
        const L = P[o + 3], H = P[o + 2], along = L * (s - 0.5), vy = 4 * H * (1 - 2 * s), vv = Math.hypot(L, vy), roll = (s - 0.5) * 1.4;
        put(M, n * 16, S[so] + S[so + 3] * along - ox, S[so + 2] + 4 * H * s * (1 - s) - 0.6 * P[o + 4], S[so + 1] + S[so + 4] * along - oz,
          S[so + 3], S[so + 4], vy / vv, L / vv, Math.sin(roll), Math.cos(roll), P[o + 4] * k);
        AN[n * 4] = 0; AN[n * 4 + 1] = 0; AN[n * 4 + 2] = 0;
        tint(F, n++, F.sp[i]);
      }
    }
    flush(F, n);
  }

  // S: 0 1 where it stands, 2 heading, 3 speed, 4 where in its stride, 5 6 the ground it left and the ground it is coming to,
  // 7 when it last felt for it, 8 how it leans with the slope, 9 0 new, 1 walking, 2 standing
  function animals(dt, t, groundAt) {
    const P = A.P, S = A.S, M = A.mesh.instanceMatrix.array, AN = A.anim.array, HD = herd.S;
    for (let h = 0; h < herd.n; h++) { // the herds in range move on to a new stop now and then
      const p = plots[herd.plot[h]], ho = h * HS;
      if (p.d >= RANGE.animals) continue;
      if (HD[ho + 2] < 0) HD[ho + 2] = t + 1 + 7 * rnd(herd.seed[h], 3);
      else if (t >= HD[ho + 2]) {
        const x0 = HD[ho], z0 = HD[ho + 1];
        HD[ho + 3]++;
        herdStop(h, p);
        HD[ho + 2] = t + Math.hypot(HD[ho] - x0, HD[ho + 1] - z0) / HD[ho + 5] + 4 + 9 * rnd(herd.seed[h], 40 + HD[ho + 3]);
      }
    }
    let n = 0;
    for (let j = 0; j < plots.length; j++) {
      const p = plots[j], k = fade(p.d, RANGE.animals);
      if (k <= 0) continue;
      for (let i = A.first[j], end = A.last[j]; i < end; i++) {
        const o = i * AP, so = i * AS, f = P[o], K = ANIMALS[f], sc = P[o + 4], ho = P[o + 5] * HS;
        const tx = HD[ho] + P[o + 1], tz = HD[ho + 1] + P[o + 2];
        if (S[so + 9] === 0) { // new here: standing at its place in the herd
          S[so] = tx; S[so + 1] = tz; S[so + 2] = rnd(A.seed[i], 5) * TAU; S[so + 3] = 0; S[so + 4] = rnd(A.seed[i], 6) * TAU;
          S[so + 5] = S[so + 6] = height(groundAt, tx, tz, p.g); S[so + 7] = t - 0.25 * ((i * 0.618034) % 1); S[so + 8] = 0; S[so + 9] = 2;
        }
        // walk to its place: turn towards it, step out once it faces it, stop when it is there
        const dx = tx - S[so], dz = tz - S[so + 1], dist = Math.hypot(dx, dz), near = 2 + sc;
        let want = 0;
        if (dist > (S[so + 9] === 2 ? near * 3 : near)) {
          S[so + 9] = 1;
          let err = Math.atan2(dx, dz) - S[so + 2];
          err -= TAU * Math.round(err / TAU);
          S[so + 2] += clamp(err, -K.turn * dt, K.turn * dt);
          want = P[o + 3] * Math.min(1, dist / (4 + 3 * sc)) * Math.max(0.15, Math.cos(err));
        } else S[so + 9] = 2;
        S[so + 3] += (want - S[so + 3]) * Math.min(1, dt * 3);
        const v = S[so + 3], sy = Math.sin(S[so + 2]), cy = Math.cos(S[so + 2]);
        S[so] += sy * v * dt; S[so + 1] += cy * v * dt; S[so + 4] += (v * dt * TAU) / (K.stride * sc);
        // the ground: felt for a few times a second, a quarter of a second ahead, and under its nose for the slope
        if (t > S[so + 7] + 1) { S[so + 5] = S[so + 6]; S[so + 7] = t - 0.25 * ((i * 0.618034) % 1); } // back in range: not the whole herd in one frame
        if (t >= S[so + 7] + 0.25) {
          const y = S[so + 6], reach = K.half * sc;
          S[so + 5] = y; S[so + 6] = height(groundAt, S[so] + sy * v * 0.25, S[so + 1] + cy * v * 0.25, y); S[so + 7] = t;
          S[so + 8] = clamp(Math.atan2(height(groundAt, S[so] + sy * reach, S[so + 1] + cy * reach, y) - y, reach), -0.5, 0.5);
        }
        const go = Math.min(1, v / (0.35 * P[o + 3]));
        let y = S[so + 5] + (S[so + 6] - S[so + 5]) * Math.min(1, (t - S[so + 7]) / 0.25), pitch = S[so + 8];
        if (K.hop) { y += K.hop * sc * go * Math.max(0, Math.sin(S[so + 4])); pitch += 0.28 * go * Math.cos(S[so + 4]); }
        if (n < 16) { const q = n * 5; seat.animals[q] = S[so]; seat.animals[q + 1] = y + SEAT[f] * sc * k; seat.animals[q + 2] = S[so + 1]; seat.animals[q + 3] = Math.atan2(sy, cy); seat.animals[q + 4] = sc * k; } // a place for a gnome, on its back
        put(M, n * 16, S[so] - ox, y, S[so + 1] - oz, sy, cy, Math.sin(pitch), Math.cos(pitch), 0, 1, sc * k);
        AN[n * 4] = K.amp * go; AN[n * 4 + 1] = S[so + 4]; AN[n * 4 + 2] = f;
        tint(A, n++, A.sp[i]);
      }
    }
    flush(A, n);
    seat.na = Math.min(16, n);
  }

  function update(dt, t, eye, groundAt) {
    const ex = eye[0] ?? eye.x ?? 0, ez = eye[2] ?? eye.z ?? 0;
    dt = clamp(dt || 0, 0, 0.1);
    ox = Math.round(ex / 2048) * 2048; oz = Math.round(ez / 2048) * 2048;
    group.position.set(ox, 0, oz);
    for (let j = 0; j < plots.length; j++) {
      const p = plots[j];
      p.d = Math.hypot(p.x - ex, p.z - ez) - p.r;
      if (p.d < RANGE.birds && p.g !== p.g) p.g = height(groundAt, p.x, p.z, 0);
    }
    birds(dt, t, groundAt);
    insects(dt, t, groundAt);
    fish(t, groundAt);
    animals(dt, t, groundAt);
  }

  return { group, set, update, set grow(k) { GROW = k; }, setLand(fn) { land = fn; }, seats: seat, // the first sixteen birds and animals in sight, as x, y, z, heading, size: gnomes ride them
    get count() { return B.n + I.n + F.n + A.n; } };
}
