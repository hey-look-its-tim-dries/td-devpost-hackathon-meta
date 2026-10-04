# M1b: The Macro World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the world ten times larger and far more detailed, and endless from the first second. The Hands become 6 km long, an endless skin wilderness fills every horizon, everything is drawn as one level-of-detail terrain, and an AI splat world can be tried as a distant backdrop.

**Architecture:**
- **Scale.** One `WORLD = 10` factor scales the Hands into the world. The DNA → hand pipeline is unchanged.
- **Wilderness.** `wild.js` defines the endless land twice, identically: in JS (for flight clearance, tested) and as a GLSL string (for the GPU). Both use the same integer hash.
- **Level of detail.** `cdlod.js` picks quadtree patches around you (pure, tested).
- **One surface.** `surface.js` draws every patch with one instanced grid. Its vertex shader takes the highest of the wilderness and the Hands, sampling the Hands' baked textures from one texture array. Its fragment shader layers the detail and fades into a world-space sky.
- **Splat horizon.** `horizon.js` optionally loads a Gaussian splat backdrop with Spark 2.

**Tech Stack:** three.js 0.186.1 (importmap, WebGL2: texture arrays, uint maths, instancing), Spark 2.3.1 (CDN, optional), node:test.

**Spec:** `docs/superpowers/specs/2026-10-04-handbit-atlas-design.md`, section 16 (and sections 5 and 9 for the Hands and scribbles)

## Global Constraints

- No build step, no npm dependencies. Spark loads from `https://cdn.jsdelivr.net/npm/@sparkjsdev/spark@2.3.1/dist/spark.module.js`, and only when `?horizon=` is set.
- Workers never import `three`.
- `WORLD = 10`: hand metres × 10 = world metres. A span is 6 km.
- The JS and GLSL wilderness must use the same constants and the same integer hash (`Math.imul` ≡ `uint` multiply), so the flight clearance matches what you see.
- Near plane ≤ 0.1 m (your hands); far plane past the fog; far/near < 5e5.
- No em dashes in docs or player-facing copy. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `node --test tests/*.test.mjs` stays green.

## Review Focus

1. Flying far from the centre (100 km and more): the terrain must still be there, detailed and without precision artefacts. Pinned in Tasks 2 and 3 (endless selection, finite heights far away).
2. Neighbouring terrain patches whose levels differ by more than one: these crack. Pinned in Task 3 (the neighbour-level test).
3. A Hand standing on or next to wilderness hills: the higher surface must win cleanly, with no gaps at the coast. Checked in Task 5 (screenshot at the basin edge).
4. Gliding low over 10 m ridge relief that the CPU doesn't know about: you must never dip inside them. Clearance covers it, checked in Task 4.
5. A `?horizon=` URL that fails to load: the game keeps running without a backdrop. Checked in Task 6.

---

### Task 1: The world, ten times larger

**Files:**
- Create: `src/world/units.js`
- Modify: `src/world/founders.js`, `tests/founders.test.mjs`

**Interfaces:**
- Produces: `WORLD = 10`. `RING_WRIST = 4050`, `SOURCE_RADIUS = 2500` (world metres). `toWorld(pose, X, Y)` takes hand metres and returns world metres; `toHand` does the reverse.

- [ ] **Step 1: Write the failing test.** In `tests/founders.test.mjs`:
  - import `WORLD` from `../src/world/units.js`;
  - replace `assert.deepEqual(toWorld({ x: 0, z: 0, rot: 0, mirror: false }, 0, 100).map(Math.round), [0, -100]);` with `assert.deepEqual(toWorld({ x: 0, z: 0, rot: 0, mirror: false }, 0, 100).map(Math.round), [0, -100 * WORLD]);`;
  - in "every hand reaches away from the Source", replace `+ 400` with `+ 400 * WORLD`;
  - in "the First Ten never overlap", change both loops to `-12000; ... <= 12000; ... += 100`.
- [ ] **Step 2: Run** `node --test tests/founders.test.mjs`. Expected: FAIL (`Cannot find module .../units.js`).
- [ ] **Step 3: Implement.**

```js
// src/world/units.js
// World scale: the hand pipeline works in hand metres (a span is 600). The world shows every Hand ten
// times larger, so a span is 6 km, a palm stands about 200 m tall and print ridges lie 35 m apart.
export const WORLD = 10;
```

In `src/world/founders.js`:
- add `import { WORLD } from './units.js';`;
- set `export const RING_WRIST = 405 * WORLD;` and `export const SOURCE_RADIUS = 250 * WORLD;` (comment: world metres);
- replace `toWorld` and `toHand` with:

```js
export function toWorld(pose, X, Y) {
  const c = Math.cos(pose.rot), s = Math.sin(pose.rot), x = (pose.mirror ? -X : X) * WORLD, y = Y * WORLD;
  return [pose.x + c * x + s * y, pose.z + s * x - c * y];
}
export function toHand(pose, x, z) {
  const c = Math.cos(pose.rot), s = Math.sin(pose.rot), dx = x - pose.x, dz = z - pose.z;
  const X = (c * dx + s * dz) / WORLD;
  return [pose.mirror ? -X : X, (s * dx - c * dz) / WORLD];
}
```

- [ ] **Step 4: Run** `node --test tests/founders.test.mjs`. Expected: PASS (5).
- [ ] **Step 5: Commit** `feat: the world shows every Hand ten times larger`.

---

### Task 2: The endless wilderness

**Files:**
- Create: `src/world/wild.js`
- Test: `tests/wild.test.mjs`

**Interfaces:**
- Produces: `BASIN_IN = 11000`, `BASIN_OUT = 17000`, `SOURCE_R = 2500`, `hashI(x, z, k) → [0,1)`, `vnoise(x, z, k)`, `cells(x, z, size, k) → { f1, edge, id }`, `wildHeight(x, z) → metres` (below 0 is water), and `WILD_GLSL`, a string defining the same `hashI`, `vnoise`, `cells` (`vec3(f1, edge, id)`), `fold`, `wild`, plus `wildPhase` (GPU only: the dermal ridge phase, 35 m period, with whorls) and `sstep`.

- [ ] **Step 1: Write the failing test**

```js
// tests/wild.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wildHeight, BASIN_OUT, SOURCE_R, hashI, WILD_GLSL } from '../src/world/wild.js';

test('the wilderness is endless: finite and bounded everywhere, even 1000 km out', () => {
  for (let x = -200000; x <= 200000; x += 2500) for (let z = -200000; z <= 200000; z += 2500) {
    const h = wildHeight(x, z);
    assert.ok(Number.isFinite(h) && h > -140 && h < 720, `${h} at ${x}, ${z}`);
  }
  assert.ok(Number.isFinite(wildHeight(1e6, -1e6)));
});

test('the First Ten lie on a low plain round the Source lake', () => {
  assert.ok(wildHeight(0, 0) < -20, 'the Source is a lake');
  for (let a = 0; a < 6.28; a += 0.2) for (const r of [SOURCE_R + 800, 6000, 9500]) {
    const h = wildHeight(Math.cos(a) * r, Math.sin(a) * r);
    assert.ok(Math.abs(h) < 8, `${h} at r ${r}`);
  }
});

test('beyond the basin: fold mountains, and canyons below sea level', () => {
  let top = -Infinity, low = Infinity;
  for (let a = 0; a < 6.28; a += 0.01) {
    const h = wildHeight(Math.cos(a) * (BASIN_OUT + 5000), Math.sin(a) * (BASIN_OUT + 5000));
    top = Math.max(top, h);
    low = Math.min(low, h);
  }
  assert.ok(top > 250, `highest ${top}`);
  assert.ok(low < -20, `lowest ${low}`);
});

test('the land is smooth enough to fly over: no cliff steeper than 15 m per metre', () => {
  for (let i = 0; i < 4000; i++) {
    const x = (hashI(i, 1, 9) - 0.5) * 60000, z = (hashI(i, 2, 9) - 0.5) * 60000;
    assert.ok(Math.abs(wildHeight(x + 1, z) - wildHeight(x, z)) < 15);
  }
});

test('the GPU twin uses the same constants', () => {
  for (const s of ['0x27d4eb2du', '0x165667b1u', '0x1b873593u', '0x2c1b3c6du', '0x297a2d39u', '11000.0', '17000.0', '2500.0', '650.0', '90.0', '3500.0', '6000.0', '2.03', '900.0', '4000.0'])
    assert.ok(WILD_GLSL.includes(s), s);
});
```

- [ ] **Step 2: Run** `node --test tests/wild.test.mjs`. Expected: FAIL (`Cannot find module`).
- [ ] **Step 3: Implement**

```js
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
  return plain * (1 - b) + b * (650 * Math.pow(fold(x, z), 1.5) - 90 * canyon);
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
    return plain * (1.0 - b) + b * (650.0 * pow(fold(p), 1.5) - 90.0 * canyon);
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
```

- [ ] **Step 4: Run** `node --test tests/wild.test.mjs`. Expected: PASS (5). If "fold mountains" finds the highest point under 250 m at that radius, raise the fold amplitude in both twins together (and in the constants test).
- [ ] **Step 5: Commit** `feat: the endless skin wilderness, twin JS and GLSL`.

---

### Task 3: Continuous level of detail

**Files:**
- Create: `src/world/cdlod.js`
- Test: `tests/cdlod.test.mjs`

**Interfaces:**
- Produces: `selectNodes(cam: [x,y,z], { leaf = 48, levels = 12, k = 2.3, minY = -120, maxY = 750 } = {}) → { nodes: { x, z, size, level, part }[], ranges: number[], morphStart: number[], root: number }`. A `part` node is a quarter drawn at its parent's level, using the half-size grid. Every node of level l has grid spacing `leaf * 2^l / N` (N cells per full node).

- [ ] **Step 1: Write the failing test**

```js
// tests/cdlod.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectNodes } from '../src/world/cdlod.js';

const levelAt = (nodes, x, z) => nodes.filter((n) => x >= n.x && x < n.x + n.size && z >= n.z && z < n.z + n.size);

for (const cam of [[0, 300, 0], [1234, 40, -5678], [250000, 900, -800000]]) {
  test(`patches tile the ground exactly once around ${cam}`, () => {
    const { nodes, root } = selectNodes(cam);
    const area = nodes.reduce((s, n) => s + n.size * n.size, 0);
    assert.equal(area, root * root);
    for (let i = 0; i < 3000; i++) {
      const x = cam[0] + (((i * 7919) % 1000) / 1000 - 0.5) * root * 0.4, z = cam[2] + (((i * 104729) % 1000) / 1000 - 0.5) * root * 0.4;
      assert.equal(levelAt(nodes, x, z).length, 1, `at ${x}, ${z}`);
    }
  });
  test(`finest under you, coarser with distance, neighbours never more than one level apart, around ${cam}`, () => {
    const { nodes, ranges } = selectNodes(cam);
    assert.equal(levelAt(nodes, cam[0], cam[2])[0].level, 0);
    assert.ok(nodes.length < 400, `${nodes.length} patches`);
    for (const n of nodes.filter((q) => !q.part)) { // quarters may reach past their level: their vertices morph fully
      const dx = Math.max(n.x - cam[0], 0, cam[0] - n.x - n.size), dz = Math.max(n.z - cam[2], 0, cam[2] - n.z - n.size);
      const dy = Math.max(-120 - cam[1], 0, cam[1] - 750);
      assert.ok(Math.hypot(dx, dy, dz) <= ranges[n.level] + 1e-6);
    }
    const step = 24;
    for (let i = -400; i < 400; i++) {
      const x = cam[0] + i * step, z = cam[2] + ((i * 37) % 200) * step;
      const a = levelAt(nodes, x, z)[0], b = levelAt(nodes, x + step, z)[0], c = levelAt(nodes, x, z + step)[0];
      if (a && b) assert.ok(Math.abs(a.level - b.level) <= 1);
      if (a && c) assert.ok(Math.abs(a.level - c.level) <= 1);
    }
  });
}
```

- [ ] **Step 2: Run** `node --test tests/cdlod.test.mjs`. Expected: FAIL (`Cannot find module`).
- [ ] **Step 3: Implement**

```js
// src/world/cdlod.js
// Continuous level of detail (after Strugar's CDLOD): a quadtree of square patches round you. Near
// patches are small (fine grids), far ones large. Each level reaches out to a range, and vertices
// slide onto the next level's grid as they near that range, so levels meet without cracks or
// popping. The tree is re-centred under you in steps of half its size, so the ground never ends.
// Pure.

export function selectNodes(cam, { leaf = 48, levels = 12, k = 2.3, minY = -120, maxY = 750 } = {}) {
  const ranges = Array.from({ length: levels }, (_, l) => leaf * 2 ** l * k);
  const morphStart = ranges.map((r, l) => r - 0.35 * (r - (l ? ranges[l - 1] : 0)));
  const root = leaf * 2 ** (levels - 1), half = root / 2;
  const ox = Math.round(cam[0] / half) * half - half, oz = Math.round(cam[2] / half) * half - half;
  const dy = Math.max(minY - cam[1], 0, cam[1] - maxY);
  const dist2 = (x, z, size) => {
    const dx = Math.max(x - cam[0], 0, cam[0] - (x + size)), dz = Math.max(z - cam[2], 0, cam[2] - (z + size));
    return dx * dx + dy * dy + dz * dz;
  };
  const nodes = [];
  // true when this patch (at this level or finer) is drawn; false leaves it to the parent
  function visit(x, z, size, level) {
    if (dist2(x, z, size) > ranges[level] ** 2) return false;
    if (level === 0 || dist2(x, z, size) > ranges[level - 1] ** 2) {
      nodes.push({ x, z, size, level, part: false });
      return true;
    }
    const h = size / 2;
    for (const [cx, cz] of [[x, z], [x + h, z], [x, z + h], [x + h, z + h]]) {
      if (!visit(cx, cz, h, level - 1)) nodes.push({ x: cx, z: cz, size: h, level, part: true });
    }
    return true;
  }
  if (!visit(ox, oz, root, levels - 1)) nodes.push({ x: ox, z: oz, size: root, level: levels - 1, part: false });
  return { nodes, ranges, morphStart, root };
}
```

- [ ] **Step 4: Run** `node --test tests/cdlod.test.mjs`. Expected: PASS (6). If the neighbour test fails, raise `k` to 2.5 (larger ranges keep level jumps to one).
- [ ] **Step 5: Commit** `feat: continuous level-of-detail patches that follow you forever`.

---

### Task 4: Flight and view at the new scale

**Files:**
- Modify: `src/glide.js`, `src/view.js`, `tests/glide.test.mjs`, `tests/view.test.mjs`

**Interfaces:**
- Produces: `createGlide({ ..., speedAt = null })`, where `speedAt(heightAboveGround)` sets the speed each update. `NEAR = 0.1`, `FAR = 40000`, `FOG_DENSITY = Math.sqrt(Math.log(100)) / 30000`.

- [ ] **Step 1: Write the failing tests.** Append to `tests/glide.test.mjs`:

```js
test('higher is faster: the speed follows your height above the ground', () => {
  const speedAt = (h) => Math.min(220, Math.max(30, 30 + 0.25 * (h - 60)));
  const low = createGlide({ pos: [0, 60, 0], speedAt, clearance: 20 }), high = createGlide({ pos: [0, 900, 0], speedAt, clearance: 20 });
  low.update(0.1, {}, () => 0);
  high.update(0.1, {}, () => 0);
  assert.ok(high.speed > low.speed * 3, `${low.speed} vs ${high.speed}`);
});
```

Append to `tests/view.test.mjs`:

```js
test('you see the wilderness to 30 km before the fog closes', () => {
  assert.ok(Math.sqrt(Math.log(100)) / FOG_DENSITY >= 29000);
});
```

- [ ] **Step 2: Run** `node --test tests/glide.test.mjs tests/view.test.mjs`. Expected: FAIL (speed unchanged; fog closes at about 9 km).
- [ ] **Step 3: Implement.**
  - In `src/glide.js`, add `speedAt = null` to the options. As the first line of `update`, add `if (speedAt) this.speed = speedAt(this.pos[1] - groundAt(this.pos[0], this.pos[2]));`. Change the look-ahead from `60` to `Math.max(60, this.speed * 2.5)` in both places.
  - In `src/view.js`:

```js
export const NEAR = 0.1;
export const FAR = 40000;
export const FOG_DENSITY = Math.sqrt(Math.log(100)) / 30000; // exp2 fog closes at 30 km
```

- [ ] **Step 4: Run** `node --test tests/*.test.mjs`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: flight speed follows your height; the view reaches 30 km`.

---

### Task 5: One surface for Hands and wilderness

**Files:**
- Create: `src/world/surface.js`
- Modify: `src/world/scene.js` (sky in world space with cirrus and sun, `skyColor` chunk, water reflecting the sky, no sea plane), `src/main.js` (surface instead of hand meshes, world-scale ground, start pose, scribble sizes)
- Delete: `src/world/handmesh.js` (replaced by the surface)
- Scratch: `<scratchpad>/m1/shot.mjs` (exists)

**Interfaces:**
- Consumes: `WILD_GLSL`, `wildHeight` (Task 2); `selectNodes` (Task 3); `WORLD` (Task 1); the worker message (`w, h, cell, x0, y0, texA, info, height`).
- Produces: `createSurface(shared) → { meshes: THREE.Mesh[2], addHand(index, data, pose), update(camWorld: THREE.Vector3) }`; in `scene.js`, `SKY_GLSL` (`skyColor(vec3 dir)`) and `createWorldScene() → { shared, sky }`.

- [ ] **Step 1: The sky and the water.** In `src/world/scene.js`:
  - Remove the sea mesh, `SEA_VERT` and `SEA_FRAG`.
  - Add these to `shared`: `uZenith` `#8fa9bd`, `uHorizon` `#efdcc4`, `uSunColor` `#ffcf9a`.
  - Set `uSunDir` to `new THREE.Vector3(-0.55, 0.42, 0.72).normalize()`, and set `uFogColor` to the horizon colour.
  - Add `SKY_GLSL`:

```js
// the sky's colour in a world direction: shared by the sky and the terrain's haze, so they meet
// without a seam at the horizon. Needs uZenith, uHorizon, uSunColor and uSunDir.
export const SKY_GLSL = /* glsl */ `
  vec3 skyColor(vec3 d) {
    vec3 c = mix(uHorizon, uZenith, pow(clamp(d.y, 0.0, 1.0), 0.55));
    float s = max(dot(d, uSunDir), 0.0);
    return c + uSunColor * (pow(s, 8.0) * 0.2 + pow(s, 64.0) * 0.35);
  }`;
```

  - Change `WATER_GLSL` to reflect the sky: replace `col = mix(col, uSky, 0.12 + 0.55 * fres);` with `col = mix(col, skyColor(reflect(-V, n)), 0.15 + 0.6 * fres);`. It now needs `SKY_GLSL` included before it.
  - Make the sky shader work in world space, with a sun disc and cirrus:

```js
const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = (modelMatrix * vec4(position, 0.0)).xyz; // world direction: the sun stays put when you turn
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const SKY_FRAG = /* glsl */ `
  uniform vec3 uZenith, uHorizon, uSunColor, uSunDir;
  uniform float uTime;
  varying vec3 vDir;
  ${NOISE_GLSL}
  ${SKY_GLSL}
  void main() {
    vec3 d = normalize(vDir);
    vec3 col = skyColor(d);
    col += uSunColor * smoothstep(0.9993, 0.9997, dot(d, uSunDir)) * 1.5; // the sun's disc
    vec2 q = d.xz / (d.y + 0.12) * 1.6 + vec2(uTime * 0.004, 0.0);
    float cirrus = smoothstep(0.55, 0.9, vnoise(q * vec2(1.0, 6.0)) * 0.7 + vnoise(q * 5.0) * 0.3);
    col = mix(col, vec3(1.0, 0.97, 0.93), cirrus * 0.35 * smoothstep(0.02, 0.3, d.y));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;
```

  - `createWorldScene()` returns `{ shared, sky }`, with the sky sphere radius 30000 (inside FAR).

- [ ] **Step 2: The surface.**

```js
// src/world/surface.js
import * as THREE from 'three';
import { selectNodes } from './cdlod.js';
import { WILD_GLSL } from './wild.js';
import { WORLD } from './units.js';
import { NOISE_GLSL, WATER_GLSL, INK_GLSL, SKY_GLSL } from './scene.js';

// The whole world as one surface: level-of-detail patches round you (cdlod.js), lifted to the higher
// of the endless wilderness and the Hands. The Hands' baked textures live in one texture array.
// Detail is layered per pixel, each layer fading before it gets finer than a pixel: patchwork tones
// and stitched seams, dermal ridges and whorls, pores, wrinkle networks, grain. Everything fades into
// the sky's own colour.
const N = 32; // grid cells per full patch
const MAX_HANDS = 16, LEVELS = 12, LEAF = 48, MAX_NODES = 600;

const COMMON = /* glsl */ `
  #define MAX_HANDS ${MAX_HANDS}
  uniform highp sampler2DArray uHandA;
  uniform highp sampler2DArray uHandB;
  uniform int uHandCount;
  uniform vec4 uHandPose[MAX_HANDS]; // x, z (world m), cos, sin of the rotation
  uniform vec4 uHandBox[MAX_HANDS];  // x0, y0 (hand m), width, height (texels)
  uniform float uHandMirror[MAX_HANDS];
  uniform vec2 uLayer;
  uniform float uCell, uWorld;
  ${WILD_GLSL}
  // the highest Hand at p: its height in world metres (or -1e9), its texture coordinates and info
  float handAt(vec2 p, out vec3 tc, out vec4 info) {
    float best = -1e9;
    tc = vec3(0.0);
    info = vec4(0.0);
    for (int i = 0; i < MAX_HANDS; i++) {
      if (i >= uHandCount) break;
      vec4 pose = uHandPose[i], box = uHandBox[i];
      vec2 d = (p - pose.xy) / uWorld;
      vec2 c = (vec2((pose.z * d.x + pose.w * d.y) * uHandMirror[i], pose.w * d.x - pose.z * d.y) - box.xy) / uCell;
      if (c.x < 0.5 || c.y < 0.5 || c.x > box.z - 0.5 || c.y > box.w - 0.5) continue;
      vec4 b = texelFetch(uHandB, ivec3(ivec2(c), i), 0);
      if (b.b < 0.5 / 255.0) continue; // outside this Hand
      vec3 t = vec3(c / uLayer, float(i));
      float h = textureLod(uHandA, t, 0.0).r * uWorld;
      if (h > best) { best = h; tc = t; info = b; }
    }
    return best;
  }`;

const VERT = /* glsl */ `
  ${COMMON}
  attribute vec4 node; // x, z, size, level
  uniform float uLeaf, uN, uMinY, uMaxY;
  uniform float uMorphStart[${LEVELS}], uMorphEnd[${LEVELS}];
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vWild;
  // the world's height at p, with the ridges as geometry where the grid is fine enough to hold them
  float surface(vec2 p, float spacing, out float wildH) {
    wildH = wild(p);
    float h = max(wildH, 0.0);
    vec3 tc;
    vec4 info;
    float hh = handAt(p, tc, info);
    float fine = 1.0 - sstep(4.0, 10.0, spacing);
    if (hh > h) {
      vec4 a = textureLod(uHandA, tc, 0.0);
      return hh + fine * a.g / max(length(a.gb), 1e-3) * info.a * 5.0;
    }
    return h + fine * cos(6.2831853 * wildPhase(p)) * 3.0 * sstep(0.0, 20.0, wildH);
  }
  void main() {
    int level = int(node.w + 0.5);
    float s = uLeaf * exp2(node.w) / uN;
    vec2 grid = position.xz;
    vec2 xz = node.xy + grid * s;
    vec2 dxz = xz - cameraPosition.xz;
    float dy = max(max(uMinY - cameraPosition.y, 0.0), cameraPosition.y - uMaxY);
    float k = clamp((sqrt(dot(dxz, dxz) + dy * dy) - uMorphStart[level]) / (uMorphEnd[level] - uMorphStart[level]), 0.0, 1.0);
    xz -= mod(grid, 2.0) * s * k; // odd vertices slide onto the coarser grid
    float sp = s * (1.0 + k), w, w1, w2;
    float h = surface(xz, sp, w);
    float hx = surface(xz + vec2(sp, 0.0), sp, w1), hz = surface(xz + vec2(0.0, sp), sp, w2);
    vNormal = normalize(vec3(h - hx, sp, h - hz));
    vWild = w;
    vWorld = vec3(xz.x, h, xz.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }`;

const FRAG = /* glsl */ `
  ${COMMON}
  uniform vec3 uTones[18];
  uniform vec3 uSunDir, uZenith, uHorizon, uSunColor;
  uniform float uFogDensity, uTime;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vWild;
  ${NOISE_GLSL}
  ${SKY_GLSL}
  ${WATER_GLSL}
  ${INK_GLSL}
  void main() {
    vec2 p = vWorld.xz;
    vec3 dpx = dFdx(vWorld), dpy = dFdy(vWorld);
    float px = max(length(dpx), length(dpy)); // metres per pixel
    vec3 V = normalize(cameraPosition - vWorld), n = normalize(vNormal);
    vec3 tc;
    vec4 info;
    float hh = handAt(p, tc, info);
    vec4 a = textureLod(uHandA, tc, 0.0);
    float hfw = length(fwidth(a.gb));
    float wph = wildPhase(p), wfw = fwidth(wph);
    bool onHand = hh > max(vWild, 0.0) - 1.0;
    vec3 albedo;
    float bh = 0.0, sheen = 0.0;
    bool isWater = false; // (water() is the shading function)
    float depth = 0.0;
    if (onHand) {
      float code = floor(info.b * 255.0 + 0.5), coast = step(15.5, code), kind = code - 16.0 * coast;
      if (kind > 3.5) {
        isWater = true;
        depth = max(a.a * uWorld, 2.0);
        albedo = INK * step(4.5, kind) * smoothstep(0.8, 0.9, a.g / max(length(a.gb), 1e-3)); // stitches over canals
      } else {
        float r = a.g / max(length(a.gb), 1e-3), s = info.a * (1.0 - sstep(0.6, 1.6, hfw));
        float pore = sstep(0.55, 0.8, r) * step(0.88, hashI(int(floor(p.x / 8.0)), int(floor(p.y / 8.0)), 50)) * (1.0 - sstep(2.0, 6.0, px));
        vec3 skin = uTones[int(info.r * 255.0 + 0.5)];
        albedo = skin * (0.92 + 0.12 * r * s);
        albedo = mix(albedo, skin * vec3(0.7, 0.52, 0.48), (0.5 - 0.5 * r) * s * 0.5);
        albedo = mix(albedo, INK, sstep(0.86, 0.97, r) * s * (kind < 1.5 ? 0.6 : 0.2));
        albedo *= 1.0 - pore * 0.35;
        bh = (r * 5.0 - pore * 3.0) * s;
        sheen = sstep(0.5, 0.9, r) * s;
      }
      albedo = mix(albedo, INK, coast * 0.8);
    } else if (vWorld.y < 0.5) {
      isWater = true;
      depth = -vWild;
    } else {
      vec3 cell = cells(p, 5000.0, 40); // the patchwork: one palm per cell, each its own skin
      vec3 skin = uTones[int(cell.z * 17.99)];
      float aa = 1.0 - sstep(0.25, 0.7, wfw), r = cos(6.2831853 * wph);
      float pore = sstep(0.6, 0.85, r) * step(0.9, hashI(int(floor(p.x / 4.0)), int(floor(p.y / 4.0)), 51)) * (1.0 - sstep(0.5, 2.0, px));
      float wr = (1.0 - sstep(0.6, 1.6, cells(p, 90.0, 60).y)) * (1.0 - sstep(1.5, 4.0, px));    // wrinkles
      float fw = (1.0 - sstep(0.2, 0.5, cells(p, 22.0, 70).y)) * (1.0 - sstep(0.3, 1.0, px));    // fine wrinkles
      float grain = (vnoise(p / 1.2, 80) - 0.5) * (1.0 - sstep(0.3, 1.0, px));
      float seam = 1.0 - sstep(3.0, 7.0, cell.y), stitch = step(0.5, fract((p.x + p.y) / 16.0));
      albedo = skin * (0.9 + 0.12 * r * aa);
      albedo = mix(albedo, skin * vec3(0.68, 0.5, 0.46), (0.5 - 0.5 * r) * aa * 0.5);
      albedo *= (1.0 - 0.35 * wr - 0.2 * fw - 0.3 * pore) * (1.0 + 0.08 * grain);
      albedo = mix(albedo, skin * 1.12, sstep(350.0, 650.0, vWorld.y) * 0.4); // pale fold crests
      albedo = mix(albedo, INK, seam * (0.3 + 0.4 * stitch));
      bh = (r * 3.0 * aa - pore * 1.5 - wr * 2.0 - fw * 0.6 + grain * 0.3);
      sheen = sstep(0.5, 0.9, r) * aa;
    }
    // bump from the detail height (derivatives taken here, in uniform control flow)
    vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
    float det = dot(dpx, r1);
    n = normalize(abs(det) * n - sign(det) * (dFdx(bh) * r1 + dFdy(bh) * r2));
    vec3 col;
    if (isWater) {
      col = water(vWorld, V, depth, uTime);
      col = mix(col, albedo, step(0.001, length(albedo)));
    } else {
      float dif = max(dot(n, uSunDir) * 0.8 + 0.2, 0.0); // soft wrap: skin scatters light
      vec3 hemi = mix(uHorizon * 0.55, uZenith * 0.75, 0.5 + 0.5 * n.y);
      col = albedo * (hemi * 0.55 + uSunColor * dif * 0.95);
      col += uSunColor * pow(max(dot(n, normalize(V + uSunDir)), 0.0), 36.0) * 0.18 * sheen;
      col += albedo * vec3(0.25, 0.07, 0.04) * pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.6; // warm rim
    }
    float dist = length(cameraPosition - vWorld);
    col = mix(col, skyColor(-V), 1.0 - exp(-pow(dist * uFogDensity, 2.0)));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

function grid(cells) {
  const pos = [], index = [];
  for (let j = 0; j <= cells; j++) for (let i = 0; i <= cells; i++) pos.push(i, 0, j);
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
    const a = j * (cells + 1) + i, b = a + 1, c = a + cells + 1, d = c + 1;
    index.push(a, c, b, b, c, d);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.setAttribute('node', new THREE.InstancedBufferAttribute(new Float32Array(MAX_NODES * 4), 4).setUsage(THREE.DynamicDrawUsage));
  g.instanceCount = 0;
  return g;
}

export function createSurface(shared) {
  let layer = null, A = null, B = null, texA = null, texB = null;
  const uniforms = {
    ...shared,
    uHandA: { value: null }, uHandB: { value: null }, uHandCount: { value: 0 },
    uHandPose: { value: Array.from({ length: MAX_HANDS }, () => new THREE.Vector4()) },
    uHandBox: { value: Array.from({ length: MAX_HANDS }, () => new THREE.Vector4()) },
    uHandMirror: { value: new Array(MAX_HANDS).fill(1) },
    uLayer: { value: new THREE.Vector2(1, 1) }, uCell: { value: 0.75 }, uWorld: { value: WORLD },
    uLeaf: { value: LEAF }, uN: { value: N }, uMinY: { value: -120 }, uMaxY: { value: 750 },
    uMorphStart: { value: new Array(LEVELS).fill(0) }, uMorphEnd: { value: new Array(LEVELS).fill(1) },
  };
  // until the first Hand arrives, empty 1-texel arrays keep the shader valid
  const empty = () => {
    const a = new THREE.DataArrayTexture(new Uint16Array(4), 1, 1, 1);
    a.type = THREE.HalfFloatType;
    const b = new THREE.DataArrayTexture(new Uint8Array(4), 1, 1, 1);
    a.needsUpdate = b.needsUpdate = true;
    return [a, b];
  };
  [uniforms.uHandA.value, uniforms.uHandB.value] = empty();
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG });
  const meshes = [grid(N), grid(N / 2)].map((g) => {
    const m = new THREE.Mesh(g, material);
    m.frustumCulled = false;
    return m;
  });
  return {
    meshes,
    // one Hand's baked arrays into its layer of the texture arrays (every Hand shares the template's size)
    addHand(i, d, pose) {
      if (!layer) {
        layer = { w: d.w, h: d.h };
        A = new Uint16Array(d.w * d.h * 4 * MAX_HANDS);
        B = new Uint8Array(d.w * d.h * 4 * MAX_HANDS);
        texA = new THREE.DataArrayTexture(A, d.w, d.h, MAX_HANDS);
        texA.type = THREE.HalfFloatType;
        texA.magFilter = texA.minFilter = THREE.LinearFilter;
        texB = new THREE.DataArrayTexture(B, d.w, d.h, MAX_HANDS);
        uniforms.uHandA.value = texA;
        uniforms.uHandB.value = texB;
        uniforms.uLayer.value.set(d.w, d.h);
        uniforms.uCell.value = d.cell;
      }
      if (d.w !== layer.w || d.h !== layer.h) throw new Error('every Hand must share the template size');
      A.set(d.texA, i * d.w * d.h * 4);
      B.set(d.info, i * d.w * d.h * 4);
      texA.needsUpdate = texB.needsUpdate = true;
      uniforms.uHandPose.value[i].set(pose.x, pose.z, Math.cos(pose.rot), Math.sin(pose.rot));
      uniforms.uHandBox.value[i].set(d.x0, d.y0, d.w, d.h);
      uniforms.uHandMirror.value[i] = pose.mirror ? -1 : 1;
      uniforms.uHandCount.value = Math.max(uniforms.uHandCount.value, i + 1);
    },
    // choose the patches round the camera and hand them to the two instanced grids
    update(cam) {
      const { nodes, ranges, morphStart } = selectNodes([cam.x, cam.y, cam.z], { leaf: LEAF, levels: LEVELS });
      uniforms.uMorphStart.value = morphStart;
      uniforms.uMorphEnd.value = ranges;
      for (const [m, part] of [[meshes[0], false], [meshes[1], true]]) {
        const attr = m.geometry.attributes.node, arr = attr.array;
        let n = 0;
        for (const node of nodes) {
          if (node.part !== part || n >= MAX_NODES) continue;
          arr.set([node.x, node.z, node.size, node.level], n * 4);
          n++;
        }
        m.geometry.instanceCount = n;
        attr.needsUpdate = true;
      }
    },
  };
}
```

Note: the half-size grid (`grid(N / 2)`) has N/2 cells over half the size, so its spacing equals its level's spacing. The vertex shader computes the spacing from the level alone, so both grids line up.

- [ ] **Step 3: Wire it into the page.** In `src/main.js`:
  - Remove the `createHandMesh` import and `scene.add(world.sea)`. Import `createSurface` from `./world/surface.js`, `wildHeight` from `./world/wild.js`, and `WORLD` from `./world/units.js`.
  - After `const world = createWorldScene();`, add `const surface = createSurface(world.shared); surface.meshes.forEach((m) => scene.add(m));`.
  - In the worker `onmessage`, replace `scene.add(createHandMesh(data, f.pose, world.shared));` with `surface.addHand(data.id, data, f.pose);`.
  - In `groundAt`, start with `let top = Math.max(0, wildHeight(x, z));` and multiply the sampled hand height by `WORLD` (`top = Math.max(top, WORLD * (...bilinear...))`). The in-box check stays as it is, because `toHand` already returns hand metres.
  - Start pose: `createGlide({ pos: params.get('at')?.split(',').map(Number) ?? [0, 1400, 15000], clearance: 25, speedAt: (h) => Math.min(220, Math.max(30, 30 + 0.25 * (h - 60))) })`. Default look pitch: `-0.22`.
  - In the frame loop, before rendering: `surface.update((renderer.xr.isPresenting ? renderer.xr.getCamera() : camera).getWorldPosition(camPos));` with `const camPos = new THREE.Vector3();` declared once.
  - Scribbles at scale:
    - `LINE = { points: 90, spacing: 3 }`;
    - ink width `1.4`;
    - knot `center: [cx, 480 + j * 35, cz]` (above the palms, which stand up to about 400 m), `radius: 110 + j * 20`, knot step speed `45`, scribble base speed `45`;
    - your swarm: `95 → 420` ahead, `side (j - 2) * 60`, `lift -80 + 20 * Math.sin(t * 0.7 + j)`;
    - spawn `mine` at `[pos.x + (j - 2) * 60, pos.y - 80, pos.z - 420]`.
- [ ] **Step 4: Delete** `src/world/handmesh.js` (`git rm`). Run `node --test tests/*.test.mjs`. Expected: all pass.
- [ ] **Step 5: Look at it.** With the server on 8130:
  - `node <scratchpad>/m1/shot.mjs "http://localhost:8130/?auto" <scratchpad>/m1b-wide.png "#previewButton"`
  - `... "?auto&at=0,350,9000&pitch=-0.25" ... m1b-hand.png` (low over a Hand)
  - `... "?auto&at=0,900,26000&pitch=-0.15" ... m1b-wild.png` (out in the wilderness)
  - `... "?auto&at=0,70,7600&pitch=-0.5" ... m1b-ridges.png` (ridges as valleys)

  Expected: `"hands":10`, `no errors`. Check that:
  - the ring sits on a plain with a lake, and fold mountains rise on the horizon;
  - the terrain fades into the sky with no edge;
  - the Hands show rivers and print ridges;
  - close up, ridges are 3D valleys with pores and wrinkles;
  - the wilderness shows a patchwork of tones with stitched seams;
  - there are no cracks or holes between patches.

  Fix what the pictures show in one pass, then measure fps on the GPU with `<scratchpad>/m1/fps.mjs`. Expected: ≥ 60.
- [ ] **Step 6: Commit** `feat: the macro world: one level-of-detail surface for the Hands and an endless skin wilderness`.

---

### Task 6: A splat horizon to try

**Files:**
- Create: `src/world/horizon.js`
- Modify: `src/main.js`

**Interfaces:**
- Produces: `loadHorizon(scene, renderer, url, { scale = 500, y = -400 }) → Promise<SplatMesh | null>`. Resolves to null, with a console warning, when Spark or the file fails to load.

- [ ] **Step 1: Implement**

```js
// src/world/horizon.js
// A test: an AI-generated Gaussian splat world (for example World Labs Marble, made from Tim's concept
// art) as a distant backdrop round the world, drawn by Spark 2. Only loaded with ?horizon=<url>; if
// anything fails, the world simply has no backdrop.
const SPARK = 'https://cdn.jsdelivr.net/npm/@sparkjsdev/spark@2.3.1/dist/spark.module.js';

export async function loadHorizon(scene, renderer, url, { scale = 500, y = -400 } = {}) {
  try {
    const { SparkRenderer, SplatMesh } = await import(SPARK);
    scene.add(new SparkRenderer({ renderer }));
    const splat = new SplatMesh({ url });
    splat.quaternion.set(1, 0, 0, 0); // splat captures are upside down in three.js
    splat.scale.setScalar(scale);
    splat.position.y = y;
    scene.add(splat);
    await splat.initialized;
    return splat;
  } catch (e) {
    console.warn('splat horizon unavailable', e);
    return null;
  }
}
```

In `src/main.js`, after the surface: `if (params.get('horizon')) loadHorizon(scene, renderer, params.get('horizon'), { scale: +(params.get('horizonScale') ?? 500) });` (import `loadHorizon`).

- [ ] **Step 2: Check it.**
  - Run `shot.mjs` on `?auto&horizon=https://sparkjs.dev/assets/splats/butterfly.spz&horizonScale=2000`. Expected: `no errors` and a giant splat visible in the distance.
  - Then run it on `?auto&horizon=https://example.invalid/none.spz`. Expected: the world renders, and the only console output is a warning.
- [ ] **Step 3: Commit** `feat: try an AI splat world as a distant horizon (?horizon=)`.

---

## After M1b

- Tim generates a Marble world from the concept image and passes its .spz URL with `?horizon=`.
- Quest pass: measure, then use N = 16 per patch, fewer wilderness octaves, and fragment detail limited by distance if needed.
- M2: the atelier and the merge, now at world scale.
