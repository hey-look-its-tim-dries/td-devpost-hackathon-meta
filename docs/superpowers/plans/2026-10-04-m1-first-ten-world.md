# M1: The First Ten World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the table game with the first slice of the Handbit Atlas: ten founding hands built from synthetic DNA, lying in a ring around the Source, each cut into handbits, with rivers and canals as water, macro skin ridges, black-ink scribbles knotting over them, and gliding flight over it all.

**Architecture:** Pure modules turn DNA into a hand: `dna.js` (the stored format) → `shape.js` (template hand + lines in metres) → `label.js` (handbits by flood fill between the rivers) → `bake.js` (heights, water, ridge phase). A module worker runs that chain and hands typed arrays to `handmesh.js`, which draws each hand as a displaced grid with a skin and water shader. `scribble.js` and `glide.js` are pure motion modules; `main.js` wires it into a WebXR page.

**Tech Stack:** three.js 0.186.1 over the CDN importmap, WebXR (immersive-vr, hand-tracking), module workers, node:test.

**Spec:** `docs/superpowers/specs/2026-10-04-handbit-atlas-design.md`

## Global Constraints

- Plain three.js 0.186.1 + WebXR through the importmap in `index.html`. No build step, no new npm dependencies.
- Workers cannot use the importmap: nothing a worker imports may import `three`.
- Pure modules (`src/print/phase.js`, `src/hand/*`, `src/scribble.js`, `src/glide.js`, `src/world/founders.js`) are tested with `node --test tests/*.test.mjs` (node 22).
- 1 span (wrist to middle fingertip) = 600 m. The template is drawn in "board units"; metres = units × `MPU` = 600 / 770.
- Print DNA v1 is exactly 44 bytes. Palm DNA v1 is 28 + 13 × (number of lines) bytes.
- Skin tones come only from the chosen palette (6 palettes × 3 tones), never from images.
- Hand-tracking joints are used live for steering only, never stored or sent.
- No em dashes in docs or player-facing copy.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- The table-era modules (`terrain.js`, `walk.js`, `city.js`, `chooser.js`, `guide.js`, `room.js`, `desert.js`, `flight.js`, `director.js`, `birds.js`, `atlas.js`) stay in the repo (removal needs Tim's OK); the new `main.js` no longer imports them. Their tests keep passing.
- Target: 60 fps on desktop Chrome and in the IWER emulator.

## Review Focus

1. A palm whose head line stops mid-palm: the palm should get fewer handbits, never a sliver or a crash. Pinned in Task 3.
2. A left hand (mirrored pose): hand and world coordinates must round-trip, or ground heights and meshes disagree. Pinned in Task 5.
3. A print with no singular points (arch) and one with two cores and two deltas: both must survive pack and unpack. Pinned in Task 2.
4. Gliding for minutes over open sea, away from every hand: the position stays finite and above the clearance. Pinned in Task 7.
5. A long frame (tab hidden, then resumed) moving a scribble 15 m in one step: its trail must still be evenly spaced. Pinned in Task 6.

---

### Task 1: Print ridge patterns

**Files:**
- Create: `src/print/phase.js`
- Test: `tests/phase.test.mjs`

**Interfaces:**
- Produces: `RIDGES` (number, ridges per unit), `PATTERNS` (object of six functions `(x, y) => number`, keys `arch tented loop pocket whorl double`), `printPhase(pattern: string, x: number, y: number, seed = 0): number` (phase in ridges; ridges are the integer level lines), `ridgeAngle(pattern, x, y, seed = 0): number` (radians, along the ridge). Coordinates: x across the fingertip, y towards the tip, both about -1..1. Loops open towards +x.

- [ ] **Step 1: Write the failing test**

```js
// tests/phase.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, printPhase, ridgeAngle } from '../src/print/phase.js';

const disc = () => {
  const out = [];
  for (let y = -0.9; y <= 0.9; y += 0.1) for (let x = -0.9; x <= 0.9; x += 0.1) if (x * x + y * y < 0.85) out.push([x, y]);
  return out;
};

test('every pattern gives a finite phase over the whole fingertip', () => {
  for (const p of Object.keys(PATTERNS)) for (const [x, y] of disc()) assert.ok(Number.isFinite(printPhase(p, x, y, 3)), p);
});

test('an arch climbs steadily from base to tip: no closed ridges', () => {
  let prev = -Infinity;
  for (let y = -0.9; y <= 0.9; y += 0.05) {
    const v = printPhase('arch', 0, y);
    assert.ok(v > prev);
    prev = v;
  }
});

test('loops and whorls ring their core: the phase grows away from it', () => {
  assert.ok(printPhase('loop', 0, 0.22) < printPhase('loop', 0, 0.75));
  assert.ok(printPhase('whorl', 0, 0.08) < printPhase('whorl', 0.6, 0.08));
});

test('a whorl is one spiral ridge: once round the core adds exactly one ridge', () => {
  let total = 0, prev = printPhase('whorl', 0.2, 0.08);
  for (let k = 1; k <= 720; k++) {
    const a = (k / 720) * 2 * Math.PI;
    const v = printPhase('whorl', 0.2 * Math.cos(a), 0.08 + (0.2 / 1.1) * Math.sin(a));
    let d = v - prev;
    d -= Math.round(d); // the spiral's branch cut jumps by a whole ridge
    total += d;
    prev = v;
  }
  assert.ok(Math.abs(total - 1) < 0.02, `total ${total}`);
});

test('the six patterns are six different prints', () => {
  const keys = Object.keys(PATTERNS);
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const pts = disc();
    const diff = pts.reduce((s, [x, y]) => s + Math.abs(Math.cos(2 * Math.PI * printPhase(keys[i], x, y)) - Math.cos(2 * Math.PI * printPhase(keys[j], x, y))), 0) / pts.length;
    assert.ok(diff > 0.2, `${keys[i]} vs ${keys[j]}: ${diff}`);
  }
});

test('ridgeAngle runs along the ridge: stepping along it barely changes the phase', () => {
  for (const p of Object.keys(PATTERNS)) for (const [x, y] of [[0.3, -0.45], [-0.5, 0.25], [0.15, 0.62]]) {
    const a = ridgeAngle(p, x, y), v = printPhase(p, x, y);
    const along = Math.abs(printPhase(p, x + 0.01 * Math.cos(a), y + 0.01 * Math.sin(a)) - v);
    const across = Math.abs(printPhase(p, x - 0.01 * Math.sin(a), y + 0.01 * Math.cos(a)) - v);
    assert.ok(along < across * 0.2, `${p} at ${x},${y}: ${along} vs ${across}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/phase.test.mjs`
Expected: FAIL with `Cannot find module .../src/print/phase.js`

- [ ] **Step 3: Write the implementation**

```js
// src/print/phase.js
// Ridge phase of each print class: the ridges are the integer level lines of this function, so
// cos(2π·phase) draws the print. x runs across the fingertip, y towards the tip, both about -1..1.
// The same functions shape the print lands, the class glyphs and the knots the scribbles draw.
// Loops open towards +x; mirror x for the other side. Pure: node, workers and the page.

export const RIDGES = 7; // per unit: about 22 ridges across a print land
const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const segD = (x, y, ax, ay, bx, by) => {
  const vx = bx - ax, vy = by - ay, t = clamp(((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy), 0, 1);
  return Math.hypot(x - ax - vx * t, y - ay - vy * t);
};
const arch = (x, y) => y + 0.38 * Math.exp(-3 * x * x) * (1 - 0.45 * y);
// rings round (cx, cy) that climb one ridge per turn: a single spiral ridge
const spiral = (x, y, cx, cy) => {
  const dx = x - cx, dy = (y - cy) * 1.1;
  return Math.hypot(dx, dy) + Math.atan2(dy, dx) / (TAU * RIDGES);
};

export const PATTERNS = {
  arch,
  tented: (x, y) => y + 0.62 * Math.exp(-2.8 * Math.abs(x)) * (1 - 0.5 * y),
  loop: (x, y) => {
    const d = segD(x, y, -0.02, 0.22, 0.55, -0.72);
    return mix(d, arch(x, y), sstep(0.5, 0.92, d));
  },
  pocket: (x, y) => {
    const d = segD(x, y, 0, 0.2, 0.5, -0.72), r = Math.hypot(x, y - 0.17);
    return mix(mix(spiral(x, y, 0, 0.17), d, sstep(0.13, 0.33, r)), arch(x, y), sstep(0.5, 0.92, d));
  },
  whorl: (x, y) => {
    const r = Math.hypot(x, (y - 0.08) * 1.1);
    return mix(spiral(x, y, 0, 0.08), arch(x, y), sstep(0.6, 0.95, r));
  },
  double: (x, y) => {
    const d = Math.min(segD(x, y, -0.2, 0.3, 0.42, -0.55), segD(x, y, 0.2, -0.02, -0.45, 0.72));
    return mix(d, arch(x, y), sstep(0.45, 0.9, d));
  },
};

// the seed sways the ridges a little, so no two prints of one class are the same
export function printPhase(pattern, x, y, seed = 0) {
  const s = (seed % 1000) * 0.0137;
  return RIDGES * PATTERNS[pattern](x + 0.05 * Math.sin(5.1 * y + s), y + 0.05 * Math.sin(4.3 * x + 2 * s));
}

// the direction of the ridge through (x, y): perpendicular to the phase gradient
export function ridgeAngle(pattern, x, y, seed = 0, e = 0.01) {
  const gx = printPhase(pattern, x + e, y, seed) - printPhase(pattern, x - e, y, seed);
  const gy = printPhase(pattern, x, y + e, seed) - printPhase(pattern, x, y - e, seed);
  return Math.atan2(gx, -gy);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/phase.test.mjs`
Expected: PASS (6 tests). If the `ridgeAngle` test fails at one sample point, that point sits on a core where the gradient vanishes; move it 0.1 away and note the change in the commit.

- [ ] **Step 5: Commit**

```bash
git add src/print/phase.js tests/phase.test.mjs
git commit -m "feat: ridge phase functions for the six print classes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Hand DNA

**Files:**
- Create: `src/hand/dna.js`, `src/hand/half.js`
- Modify: `docs/superpowers/specs/2026-10-04-handbit-atlas-design.md` (section 8.3 sizes)
- Test: `tests/dna.test.mjs`

**Interfaces:**
- Consumes: `printPhase` from Task 1.
- Produces:
  - `rng(seed: number): () => number` (mulberry32, 0..1)
  - `PRINT_CLASSES` = `['arch','tented','ulnar','radial','whorl','pocket','double','accidental']`
  - `PATTERN_OF[cls]: [pattern: string, mirror: boolean]`
  - `LINE_KINDS` = `['heart','head','life','fate','sun','mercury','fused','other']`
  - Print object: `{ finger: 0..9, cls: string, ridgeCount: 0..31, quality: 0..3, scanned: boolean, freq: 0..15, slant: 0..15, cores: [col,row][], deltas: [col,row][], orient: Uint8Array(64) of 0..15, seed: uint32 }`
  - `packPrint(print): Uint8Array(44)`, `unpackPrint(bytes): print`, `synthPrint(finger, cls, seed): print`, `jitterPrint(print, rand): print`
  - Palm object: `{ side: 'R'|'L', lines: {kind, strength: 0..15, pts: [x,y][8]}[], creases: number[10] (0..1, fraction from the tip, two per finger thumb first), proportions: number[5] (0..3), triradii: [x,y][5], patterns: number[5] (0..7), palette: 0..5, seed: uint32 }`. Palm frame: wrist centre origin, x towards the thumb, y towards the fingers, unit = index-to-little knuckle distance; x in -1..1, y in -0.25..1.75.
  - `packPalm(palm): Uint8Array`, `unpackPalm(bytes): palm`, `palmBytes(lines: number): number`
  - `toB64(bytes): string` (base64url), `fromB64(string): Uint8Array`
  - `toHalf(v: number): number` (IEEE half float bits) in `half.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/dna.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRINT_CLASSES, packPrint, unpackPrint, synthPrint, jitterPrint,
  packPalm, unpackPalm, palmBytes, rng, toB64, fromB64,
} from '../src/hand/dna.js';
import { toHalf } from '../src/hand/half.js';

test('Print DNA is 44 bytes and survives a round trip, for every class', () => {
  for (const cls of PRINT_CLASSES) {
    const p = synthPrint(3, cls, 123456789);
    const b = packPrint(p);
    assert.equal(b.length, 44);
    const q = unpackPrint(b);
    assert.equal(q.cls, cls);
    assert.equal(q.finger, 3);
    assert.equal(q.ridgeCount, p.ridgeCount);
    assert.equal(q.seed, 123456789);
    assert.deepEqual(q.cores, p.cores);
    assert.deepEqual(q.deltas, p.deltas);
    assert.deepEqual([...q.orient], [...p.orient]);
  }
});

test('arches have no singular points; double loops have two cores and two deltas (Review Focus 3)', () => {
  const arch = unpackPrint(packPrint(synthPrint(0, 'arch', 1)));
  assert.deepEqual([arch.cores, arch.deltas], [[], []]);
  const dbl = unpackPrint(packPrint(synthPrint(0, 'double', 1)));
  assert.equal(dbl.cores.length, 2);
  assert.equal(dbl.deltas.length, 2);
});

test('a seed above 2^31 keeps all 32 bits', () => {
  assert.equal(unpackPrint(packPrint(synthPrint(0, 'whorl', 0xfedcba98))).seed, 0xfedcba98);
});

test('the shuffle moves every field by at most one step', () => {
  const p = synthPrint(1, 'ulnar', 42), q = jitterPrint(p, rng(7));
  assert.ok(Math.abs(q.ridgeCount - p.ridgeCount) <= 1);
  q.orient.forEach((o, i) => { const d = Math.abs(o - p.orient[i]); assert.ok(d <= 1 || d === 15, `orient ${i}`); });
  q.cores.forEach(([x, y], k) => assert.ok(Math.abs(x - p.cores[k][0]) <= 1 && Math.abs(y - p.cores[k][1]) <= 1));
  q.deltas.forEach(([x, y], k) => assert.ok(Math.abs(x - p.deltas[k][0]) <= 1 && Math.abs(y - p.deltas[k][1]) <= 1));
});

test('Palm DNA is 28 + 13 bytes per line and keeps points to half a grid step', () => {
  const line = (kind, strength, f) => ({ kind, strength, pts: Array.from({ length: 8 }, (_, i) => f(i)) });
  const palm = {
    side: 'L',
    lines: [line('heart', 2, (i) => [-0.7 + i * 0.2, 1.2 - i * 0.05]), line('fate', 0, (i) => [0.05, i * 0.2])],
    creases: Array.from({ length: 10 }, (_, i) => 0.3 + (i % 2) * 0.3),
    proportions: [1, 2, 0, 1, 3],
    triradii: [[-0.5, 1.4], [-0.2, 1.45], [0.2, 1.45], [0.5, 1.4], [0, 0.1]],
    patterns: [0, 1, 2, 3, 4],
    palette: 4,
    seed: 0xdeadbeef,
  };
  const b = packPalm(palm);
  assert.equal(palmBytes(2), 54);
  assert.equal(b.length, 54);
  const q = unpackPalm(b);
  assert.equal(q.side, 'L');
  assert.equal(q.palette, 4);
  assert.equal(q.seed, 0xdeadbeef);
  assert.deepEqual(q.lines.map((l) => [l.kind, l.strength]), [['heart', 2], ['fate', 0]]);
  const half = 1 / 63 + 1e-9;
  q.lines.forEach((l, k) => l.pts.forEach(([x, y], i) => {
    assert.ok(Math.abs(x - palm.lines[k].pts[i][0]) <= half);
    assert.ok(Math.abs(y - palm.lines[k].pts[i][1]) <= half);
  }));
  q.creases.forEach((c, i) => assert.ok(Math.abs(c - palm.creases[i]) <= 0.5 / 63 + 1e-9));
  q.triradii.forEach(([x, y], i) => assert.ok(Math.abs(x - palm.triradii[i][0]) <= half && Math.abs(y - palm.triradii[i][1]) <= half));
  assert.deepEqual(q.proportions, palm.proportions);
  assert.deepEqual(q.patterns, palm.patterns);
});

test('DNA travels as base64url', () => {
  const b = packPrint(synthPrint(9, 'pocket', 5)), s = toB64(b);
  assert.match(s, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual([...fromB64(s)], [...b]);
});

test('half floats for the GPU', () => {
  assert.equal(toHalf(0), 0);
  assert.equal(toHalf(1), 0x3c00);
  assert.equal(toHalf(-2), 0xc000);
  assert.equal(toHalf(0.5), 0x3800);
  assert.equal(toHalf(65504), 0x7bff);
  assert.equal(toHalf(1e6), 0x7c00);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/dna.test.mjs`
Expected: FAIL with `Cannot find module .../src/hand/dna.js`

- [ ] **Step 3: Write the implementation**

```js
// src/hand/dna.js
// Fingerprint and palm "DNA": the only things about a hand the game keeps. A Print DNA is 44 bytes
// (pattern class, ridge count, a coarse 8 x 8 ridge flow, cores and deltas, a seed); a Palm DNA keeps
// the main lines as 8 points each in a palm frame without size. Both are coarse on purpose and get a
// small random shuffle before they leave the device. Pure: node, workers and the page.
import { printPhase } from '../print/phase.js';

export const PRINT_CLASSES = ['arch', 'tented', 'ulnar', 'radial', 'whorl', 'pocket', 'double', 'accidental'];
// the ridge pattern that draws each class, and whether it is mirrored (a right hand's ulnar side is -x)
export const PATTERN_OF = {
  arch: ['arch', false], tented: ['tented', false], ulnar: ['loop', true], radial: ['loop', false],
  whorl: ['whorl', false], pocket: ['pocket', true], double: ['double', false], accidental: ['double', true],
};
export const LINE_KINDS = ['heart', 'head', 'life', 'fate', 'sun', 'mercury', 'fused', 'other'];

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// a bit cursor over a byte array, most significant bit first (safe for 32-bit values)
function bits(bytes) {
  let pos = 0;
  return {
    put(v, n) {
      for (let i = n - 1; i >= 0; i--, pos++) if (Math.floor(v / 2 ** i) % 2) bytes[pos >> 3] |= 0x80 >> (pos & 7);
    },
    get(n) {
      let v = 0;
      for (let i = 0; i < n; i++, pos++) v = v * 2 + ((bytes[pos >> 3] >> (7 - (pos & 7))) & 1);
      return v;
    },
  };
}

// ---------- Print DNA v1: 44 bytes ----------

export function packPrint(p) {
  const out = new Uint8Array(44), w = bits(out);
  w.put(1, 8);
  w.put(p.finger, 4);
  w.put(PRINT_CLASSES.indexOf(p.cls), 4);
  w.put(p.ridgeCount, 5);
  w.put(p.quality, 2);
  w.put(p.scanned ? 1 : 0, 1);
  w.put(p.freq, 4);
  w.put(p.slant, 4);
  const sp = [p.cores[0], p.cores[1], p.deltas[0], p.deltas[1]];
  for (const q of sp) w.put(q ? q[1] * 8 + q[0] : 0, 6); // [col, row] on the 8 x 8 grid
  for (const q of sp) w.put(q ? 1 : 0, 1);
  w.put(0, 4);
  for (let i = 0; i < 64; i++) w.put(p.orient[i], 4);
  w.put(p.seed >>> 0, 32);
  return out;
}

export function unpackPrint(b) {
  const r = bits(b);
  if (r.get(8) !== 1) throw new Error('unknown Print DNA version');
  const finger = r.get(4), cls = PRINT_CLASSES[r.get(4)];
  const ridgeCount = r.get(5), quality = r.get(2), scanned = r.get(1) === 1;
  const freq = r.get(4), slant = r.get(4);
  const cells = [r.get(6), r.get(6), r.get(6), r.get(6)], has = [r.get(1), r.get(1), r.get(1), r.get(1)];
  r.get(4);
  const at = (k) => (has[k] ? [cells[k] % 8, Math.floor(cells[k] / 8)] : null);
  const orient = new Uint8Array(64);
  for (let i = 0; i < 64; i++) orient[i] = r.get(4);
  return {
    finger, cls, ridgeCount, quality, scanned, freq, slant,
    cores: [at(0), at(1)].filter(Boolean), deltas: [at(2), at(3)].filter(Boolean), orient, seed: r.get(32),
  };
}

// where the cores and deltas of each pattern sit on the 8 x 8 grid ([col, row], row 0 at the tip)
const SINGULAR = {
  arch: [[], []],
  tented: [[[4, 3]], [[4, 5]]],
  loop: [[[4, 3]], [[1, 6]]],
  pocket: [[[4, 3]], [[1, 6]]],
  whorl: [[[4, 3]], [[1, 6], [6, 6]]],
  double: [[[3, 3], [5, 4]], [[1, 6], [6, 6]]],
};

// the ridge flow on an 8 x 8 grid, 16 directions (0..π)
export function orientationField(cls, seed) {
  const [pattern, mirror] = PATTERN_OF[cls], o = new Uint8Array(64), e = 0.01;
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    const x = ((i + 0.5) / 8) * 2 - 1, y = 1 - ((j + 0.5) / 8) * 2, xx = mirror ? -x : x;
    const gx = printPhase(pattern, xx + e, y, seed) - printPhase(pattern, xx - e, y, seed);
    const gy = printPhase(pattern, xx, y + e, seed) - printPhase(pattern, xx, y - e, seed);
    let a = Math.atan2(mirror ? -gx : gx, -gy);
    a = ((a % Math.PI) + Math.PI) % Math.PI;
    o[j * 8 + i] = Math.round((a / Math.PI) * 16) % 16;
  }
  return o;
}

// a print that was chosen, not scanned (founders, and the read-by-eye route)
export function synthPrint(finger, cls, seed) {
  const rand = rng(seed);
  const [pattern, mirror] = PATTERN_OF[cls];
  const flip = (p) => (mirror ? [7 - p[0], p[1]] : p.slice());
  const [cores, deltas] = SINGULAR[pattern].map((l) => l.map(flip));
  return {
    finger, cls, ridgeCount: pattern === 'arch' ? 0 : 6 + Math.floor(rand() * 14), quality: 3, scanned: false,
    freq: 9, slant: 0, cores, deltas, orient: orientationField(cls, seed), seed: seed >>> 0,
  };
}

// the privacy shuffle: every field moves by at most one step
export function jitterPrint(p, rand) {
  const nudge = (v, lo, hi) => Math.min(hi, Math.max(lo, v + Math.floor(rand() * 3) - 1));
  return {
    ...p,
    ridgeCount: p.ridgeCount ? nudge(p.ridgeCount, 1, 31) : 0,
    cores: p.cores.map(([x, y]) => [nudge(x, 0, 7), nudge(y, 0, 7)]),
    deltas: p.deltas.map(([x, y]) => [nudge(x, 0, 7), nudge(y, 0, 7)]),
    orient: p.orient.map((o) => (o + Math.floor(rand() * 3) - 1 + 16) % 16),
  };
}

// ---------- Palm DNA v1: 28 + 13 bytes per line ----------

const qx = (x) => Math.max(0, Math.min(63, Math.round(((x + 1) / 2) * 63)));
const qy = (y) => Math.max(0, Math.min(63, Math.round(((y + 0.25) / 2) * 63)));
const dx = (q) => (q / 63) * 2 - 1;
const dy = (q) => (q / 63) * 2 - 0.25;
export const palmBytes = (lines) => 28 + 13 * lines;

export function packPalm(p) {
  const out = new Uint8Array(palmBytes(p.lines.length)), w = bits(out);
  w.put(1, 8);
  w.put(p.side === 'L' ? 1 : 0, 1);
  w.put(0, 7);
  w.put(p.lines.length, 8);
  for (const l of p.lines) {
    w.put(LINE_KINDS.indexOf(l.kind), 4);
    w.put(l.strength, 4);
    for (const [x, y] of l.pts) { w.put(qx(x), 6); w.put(qy(y), 6); }
  }
  for (const c of p.creases) w.put(Math.max(0, Math.min(63, Math.round(c * 63))), 6);
  w.put(0, 4);
  for (const v of p.proportions) w.put(v, 2);
  w.put(0, 6);
  for (const [x, y] of p.triradii) { w.put(qx(x), 6); w.put(qy(y), 6); }
  w.put(0, 4);
  for (const v of p.patterns) w.put(v, 3);
  w.put(0, 1);
  w.put(p.palette, 8);
  w.put(p.seed >>> 0, 32);
  return out;
}

export function unpackPalm(b) {
  const r = bits(b);
  if (r.get(8) !== 1) throw new Error('unknown Palm DNA version');
  const side = r.get(1) ? 'L' : 'R';
  r.get(7);
  const n = r.get(8), lines = [];
  for (let k = 0; k < n; k++) {
    const kind = LINE_KINDS[r.get(4)], strength = r.get(4), pts = [];
    for (let i = 0; i < 8; i++) { const x = dx(r.get(6)); pts.push([x, dy(r.get(6))]); }
    lines.push({ kind, strength, pts });
  }
  const creases = Array.from({ length: 10 }, () => r.get(6) / 63);
  r.get(4);
  const proportions = Array.from({ length: 5 }, () => r.get(2));
  r.get(6);
  const triradii = Array.from({ length: 5 }, () => { const x = dx(r.get(6)); return [x, dy(r.get(6))]; });
  r.get(4);
  const patterns = Array.from({ length: 5 }, () => r.get(3));
  r.get(1);
  const palette = r.get(8), seed = r.get(32);
  return { side, lines, creases, proportions, triradii, patterns, palette, seed };
}

// ---------- transport ----------

export const toB64 = (b) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromB64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
```

```js
// src/hand/half.js
// Float to IEEE half-float bits, for RGBA16F textures built in a worker (which can't load three.js).
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);

export function toHalf(v) {
  f32[0] = v;
  const x = u32[0], sign = (x >>> 16) & 0x8000, e = ((x >>> 23) & 0xff) - 112, m = x & 0x7fffff;
  if (e <= 0) return e < -10 ? sign : sign | (((m | 0x800000) >> (1 - e)) + 0x1000) >> 13;
  if (e >= 31) return sign | 0x7c00;
  return sign | ((e << 10) + ((m + 0x1000) >> 13));
}
```

Then edit the spec, section 8.3. Replace the heading line `### 8.3 Palm DNA v1 (about 200 bytes)` with `### 8.3 Palm DNA v1 (28 + 13 bytes per line: 80 bytes for four lines)`, the row `| version, side (L/R), flags (fused crease, fate present, ...) | 2 bytes |` with `| version, side (L/R), line count | 3 bytes |`, and the row `| finger creases: 2 per finger (3 for the thumb) along the axis, 6 bits | 8 bytes |` with `| finger creases: 2 per finger, thumb included, along the axis, 6 bits | 8 bytes |`. In section 10, change `so 10,000 Hands are about 3 MB of DNA` only if the arithmetic no longer holds (5 × 44 + 80 = 300 bytes, so 10,000 Hands are 3 MB: unchanged).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/dna.test.mjs`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hand/dna.js src/hand/half.js tests/dna.test.mjs docs/superpowers/specs/2026-10-04-handbit-atlas-design.md
git commit -m "feat: Print DNA and Palm DNA formats with the privacy shuffle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The hand's shape and its handbits

**Files:**
- Create: `src/hand/shape.js`, `src/hand/label.js`
- Test: `tests/hand.test.mjs`

**Interfaces:**
- Consumes: `rng`, `LINE_KINDS` from Task 2 (palm objects as produced by `unpackPalm`).
- Produces (`shape.js`):
  - `MPU` (600/770), `PALM_UNIT` (212.9 m), `TAIL` (11 m), `BASE_CREASE` (2.3 m), `fromTemplate([bx, by]): [X, Y]` (board units → hand metres)
  - `OUTLINE: [X, Y][]` (palm polygon), `FINGERS: {id, base, dir, side, len, width}[]` (T, I, M, R, L)
  - `templatePalm({ seed, fate, sun, mercury, fused, palette, side }): palm` (synthetic Palm DNA object)
  - `handShape(palm): { outline, fingers: (finger & {creases: [c0, c1]})[], lines: {kind, strength, pts: [X, Y][]}[], palette, seed, side }`
  - `fingerAt(finger, X, Y): {u, t} | null`, `inPolygon(poly, X, Y): boolean`, `insideHand(shape, X, Y): boolean`
- Produces (`label.js`):
  - `RIVER = -1`, `CANAL = -2`, `OUTSIDE = -3`, `CANAL_HALF = 1.6`, `waterHalf(strength): metres`
  - `labelHand(shape, cell = 0.75): { cell, x0, y0, w, h, label: Int16Array, lineOf: Int8Array, lineDist: Float32Array, fingerOf: Int8Array, along: Float32Array, across: Float32Array, handbits: {code, name, kind: 'tip'|'segment'|'palm', area, cx, cy, finger?, seg?}[], palmCount }`. Labels: 0..14 finger handbits (T1 T2 T3 I1 ... L3), 15.. palm handbits P1.. (numbered from the wrist up), or RIVER / CANAL / OUTSIDE. Cell (c, r) has its centre at `X = x0 + (c + 0.5) * cell`, `Y = y0 + (r + 0.5) * cell`.

- [ ] **Step 1: Write the failing test**

```js
// tests/hand.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templatePalm, handShape } from '../src/hand/shape.js';
import { packPalm, unpackPalm } from '../src/hand/dna.js';
import { labelHand } from '../src/hand/label.js';

const hand = (opts = {}) => handShape(unpackPalm(packPalm(templatePalm({ seed: 5, ...opts }))));
const palmNames = (lab) => lab.handbits.filter((b) => b.kind === 'palm').map((b) => b.name).sort();

test('fingers give 15 handbits, three per finger', () => {
  const lab = labelHand(hand(), 1.5);
  const fingers = lab.handbits.filter((b) => b.kind !== 'palm');
  assert.deepEqual(fingers.map((b) => b.code), ['T1', 'T2', 'T3', 'I1', 'I2', 'I3', 'M1', 'M2', 'M3', 'R1', 'R2', 'R3', 'L1', 'L2', 'L3']);
  for (const b of fingers) assert.ok(b.area > 300, `${b.code}: ${b.area} m²`);
});

test('heart, head, life and fate lines cut the palm into five handbits', () => {
  const lab = labelHand(hand({ fate: true }), 1.5);
  assert.equal(lab.palmCount, 5);
  assert.deepEqual(palmNames(lab), ['Crown', 'Heartland', 'Mount of Luna', 'Mount of Venus', 'Plain of Mars']);
});

test('without a fate line the Plain and Luna stay one lowland', () => {
  const lab = labelHand(hand({ fate: false }), 1.5);
  assert.equal(lab.palmCount, 4);
  assert.ok(palmNames(lab).includes('Lowlands'));
});

test('a sun line splits the Crown in two', () => {
  const lab = labelHand(hand({ sun: true }), 1.5);
  assert.equal(lab.palmCount, 6);
  assert.ok(palmNames(lab).includes('Crown of Mercury'));
  assert.ok(palmNames(lab).includes('Crown of Jupiter'));
});

test('a fused crease (heart and head as one) gives one handbit fewer', () => {
  assert.equal(labelHand(hand({ fused: true }), 1.5).palmCount, 4);
});

test('palm handbits are numbered from the wrist up', () => {
  const palm = labelHand(hand(), 1.5).handbits.filter((b) => b.kind === 'palm');
  palm.forEach((b, i) => assert.equal(b.code, `P${i + 1}`));
  for (let i = 1; i < palm.length; i++) assert.ok(palm[i].cy >= palm[i - 1].cy);
});

test('a head line that stops mid-palm joins the regions it fails to split (Review Focus 1)', () => {
  const p = templatePalm({ seed: 5, fate: false });
  const head = p.lines.find((l) => l.kind === 'head');
  const [a, b] = [head.pts[0], head.pts[3]];
  head.pts = Array.from({ length: 8 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / 7, a[1] + ((b[1] - a[1]) * i) / 7]);
  const lab = labelHand(handShape(unpackPalm(packPalm(p))), 1.5);
  assert.equal(lab.palmCount, 3); // Crown, Venus, and everything else as one
  const areas = lab.handbits.filter((h) => h.kind === 'palm').map((h) => h.area);
  const total = areas.reduce((s, v) => s + v, 0);
  for (const v of areas) assert.ok(v / total > 0.03);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hand.test.mjs`
Expected: FAIL with `Cannot find module .../src/hand/shape.js`

- [ ] **Step 3: Write the implementation**

```js
// src/hand/shape.js
// The hand as a map: a canonical right hand, palm view, in metres. The wrist centre is the origin,
// X runs towards the thumb, Y towards the fingertips, and 1 span (wrist to middle fingertip) is
// 600 m. The lines come from the Palm DNA; the outline and fingers are the same for everyone (hand
// size and shape are never read, so they can't identify anyone). Pure.
import { rng } from './dna.js';

export const MPU = 600 / 770; // metres per unit of the drawing the template was made on
export const fromTemplate = ([x, y]) => [(x - 292) * MPU, (832 - y) * MPU];
export const PALM_UNIT = 212.9; // index to little-finger knuckle, metres
export const TAIL = 11; // finger bases tuck this far under the palm edge
export const BASE_CREASE = 2.3; // where a finger meets the palm, along the finger
const EXTEND = 10; // a line ending this close to another line or the coast is taken to meet it

const cubic = (a, b, c, d, t) => {
  const u = 1 - t;
  return [0, 1].map((k) => u * u * u * a[k] + 3 * u * u * t * b[k] + 3 * u * t * t * c[k] + t * t * t * d[k]);
};

// the palm outline, as cubic pieces in template units
const PALM_PATH = [
  [[118, 432], [100, 520], [96, 640], [128, 742]],
  [[128, 742], [140, 790], [160, 815], [175, 832]],
  [[175, 832], [175, 832], [410, 832], [410, 832]],
  [[410, 832], [440, 790], [498, 720], [505, 640]],
  [[505, 640], [510, 560], [490, 500], [468, 470]],
  [[468, 470], [468, 470], [462, 405], [462, 405]],
  [[462, 405], [420, 380], [200, 385], [118, 432]],
];
export const OUTLINE = PALM_PATH.flatMap(([a, b, c, d]) => Array.from({ length: 16 }, (_, i) => fromTemplate(cubic(a, b, c, d, i / 16))));

// id, base (template units), length, width, tilt in degrees (clockwise in the template)
export const FINGERS = [
  ['T', 470, 618, 252, 80, 28],
  ['I', 420, 404, 290, 68, 7],
  ['M', 330, 396, 334, 72, 1],
  ['R', 240, 404, 292, 68, -3.5],
  ['L', 150, 446, 228, 60, -10],
].map(([id, bx, by, len, width, deg]) => {
  const a = (deg * Math.PI) / 180;
  return { id, base: fromTemplate([bx, by]), dir: [Math.sin(a), Math.cos(a)], side: [Math.cos(a), -Math.sin(a)], len: len * MPU, width: width * MPU };
});

// the template lines as cubic control points; their ends reach past the coast or the next line
const TEMPLATE_LINES = {
  heart: [[88, 521], [210, 480], [300, 472], [404, 378]],
  head: [[486, 465], [380, 520], [250, 560], [80, 624]],
  life: [[482, 460], [380, 560], [352, 690], [394, 852]],
  fate: [[300, 852], [300, 740], [296, 650], [284, 532]],
  sun: [[240, 494], [242, 462], [244, 432], [247, 378]],
  mercury: [[196, 852], [184, 760], [170, 690], [150, 592]],
  fused: [[80, 566], [220, 524], [360, 488], [488, 466]],
};
const TRIRADII = [[205, 430], [285, 420], [370, 425], [440, 445], [300, 800]];
const toPalm = (p) => fromTemplate(p).map((v) => v / PALM_UNIT);

// A synthetic palm (founders, tests, the read-by-eye route): the template lines, each bent a little
// by the seed, sampled to 8 points as the Palm DNA stores them.
export function templatePalm({ seed = 1, fate = true, sun = false, mercury = false, fused = false, palette = 2, side = 'R' } = {}) {
  const rand = rng(seed);
  const kinds = fused ? ['fused', 'life'] : ['heart', 'head', 'life'];
  if (fate) kinds.push('fate');
  if (sun) kinds.push('sun');
  if (mercury) kinds.push('mercury');
  const lines = kinds.map((kind) => {
    const c = TEMPLATE_LINES[kind].map(([x, y], i) => (i === 0 || i === 3 ? [x, y] : [x + (rand() - 0.5) * 24, y + (rand() - 0.5) * 24]));
    return { kind, strength: 1 + Math.floor(rand() * 3), pts: Array.from({ length: 8 }, (_, i) => toPalm(cubic(...c, i / 7))) };
  });
  return {
    side, lines,
    creases: FINGERS.flatMap((f) => (f.id === 'T' ? [0.36, 0.68] : [0.3, 0.6]).map((v) => v + (rand() - 0.5) * 0.04)),
    proportions: [1, 1, 1, 1, 1],
    triradii: TRIRADII.map(toPalm),
    patterns: [0, 0, 0, 0, 0],
    palette, seed: seed >>> 0,
  };
}

// Catmull-Rom through the points, 6 steps per span
function smooth(p) {
  const out = [];
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
    for (let k = 0; k < 6; k++) {
      const t = k / 6, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((d) => 0.5 * (2 * p1[d] + (p2[d] - p0[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (3 * p1[d] - p0[d] - 3 * p2[d] + p3[d]) * t3)));
    }
  }
  out.push(p[p.length - 1]);
  return out;
}

function extend(p) {
  const ext = (from, to) => {
    const ex = from[0] - to[0], ey = from[1] - to[1], l = Math.hypot(ex, ey) || 1;
    return [from[0] + (ex / l) * EXTEND, from[1] + (ey / l) * EXTEND];
  };
  return [ext(p[0], p[1]), ...p, ext(p[p.length - 1], p[p.length - 2])];
}

// a palm object (unpacked Palm DNA) as a shape in hand metres
export function handShape(palm) {
  return {
    outline: OUTLINE,
    fingers: FINGERS.map((f, i) => ({ ...f, creases: [palm.creases[i * 2], palm.creases[i * 2 + 1]] })),
    lines: palm.lines.map((l) => ({ kind: l.kind, strength: l.strength, pts: extend(smooth(l.pts.map(([x, y]) => [x * PALM_UNIT, y * PALM_UNIT]))) })),
    palette: palm.palette, seed: palm.seed, side: palm.side,
  };
}

// (X, Y) in a finger's own frame: u across, t along from its base; null when outside the finger
export function fingerAt(f, X, Y) {
  const ex = X - f.base[0], ey = Y - f.base[1], hw = f.width / 2;
  const u = ex * f.side[0] + ey * f.side[1], t = ex * f.dir[0] + ey * f.dir[1];
  if (t < -TAIL || t > f.len || Math.abs(u) > hw) return null;
  if (t > f.len - hw && u * u + (t - (f.len - hw)) ** 2 > hw * hw) return null; // the round tip
  return { u, t };
}

export function inPolygon(poly, X, Y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > Y !== yj > Y && X < ((xj - xi) * (Y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const insideHand = (shape, X, Y) => inPolygon(shape.outline, X, Y) || shape.fingers.some((f) => fingerAt(f, X, Y));
```

```js
// src/hand/label.js
// Cuts a hand into handbits as the spec says: each finger into three by its creases, the palm
// into the regions its own lines enclose (a flood fill between the rivers), so the number of palm
// handbits depends on the hand. Pure.
import { fingerAt, fromTemplate, TAIL, BASE_CREASE } from './shape.js';

export const RIVER = -1, CANAL = -2, OUTSIDE = -3;
export const CANAL_HALF = 1.6; // metres
export const waterHalf = (strength) => 3 + 1.5 * strength; // a river's half-width, metres
const FINGER_CODES = ['T', 'I', 'M', 'R', 'L'];
const FINGER_NAMES = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];
// points that lie well inside each palmistry mount on every template hand
const ANCHORS = Object.entries({
  venus: [452, 690], luna: [232, 720], outer: [125, 690], plain: [338, 690],
  heart: [330, 478], jupiter: [284, 428], mercury: [196, 458],
}).map(([k, p]) => [k, fromTemplate(p)]);

function regionName(a) {
  if (a.has('venus')) return 'Mount of Venus';
  if (a.has('luna') && a.has('plain')) return 'Lowlands';
  if (a.has('plain')) return 'Plain of Mars';
  if (a.has('luna')) return 'Mount of Luna';
  if (a.has('outer')) return 'Outer Luna';
  if (a.has('jupiter') && a.has('mercury')) return 'Crown';
  if (a.has('jupiter')) return 'Crown of Jupiter';
  if (a.has('mercury')) return 'Crown of Mercury';
  if (a.has('heart')) return 'Heartland';
  return 'Palm';
}

// the nearest big region to region `id`, searching across rivers and canals
function nearestRegion(label, w, id, ok) {
  const N = label.length, seen = new Uint8Array(N), queue = [];
  for (let i = 0; i < N; i++) if (label[i] === id) { seen[i] = 1; queue.push(i); }
  for (let q = 0; q < queue.length; q++) {
    const p = queue[q], c = p % w;
    for (const n of [c > 0 ? p - 1 : -1, c < w - 1 ? p + 1 : -1, p - w, p + w]) {
      if (n < 0 || n >= N || seen[n] || label[n] === OUTSIDE) continue;
      if (ok(label[n])) return label[n];
      seen[n] = 1;
      queue.push(n);
    }
  }
  return null;
}

export function labelHand(shape, cell = 0.75) {
  // the grid, with four empty cells round the hand
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const grow = (x, y) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); };
  const corners = (f) => [-0.5, 0.5].flatMap((u) => [-TAIL, f.len].map((t) => [f.base[0] + f.side[0] * u * f.width + f.dir[0] * t, f.base[1] + f.side[1] * u * f.width + f.dir[1] * t]));
  for (const [x, y] of shape.outline) grow(x, y);
  for (const f of shape.fingers) for (const [x, y] of corners(f)) grow(x, y);
  const x0 = minX - 4 * cell, y0 = minY - 4 * cell;
  const w = Math.ceil((maxX - minX) / cell) + 8, h = Math.ceil((maxY - minY) / cell) + 8, N = w * h;
  const cx = (c) => x0 + (c + 0.5) * cell, cy = (r) => y0 + (r + 0.5) * cell;
  const label = new Int16Array(N).fill(OUTSIDE);

  // 1. the palm: a scanline fill of the outline
  const poly = shape.outline;
  for (let r = 0; r < h; r++) {
    const Y = cy(r), xs = [];
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > Y !== yj > Y) xs.push(xi + ((Y - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k] - x0) / cell - 0.5)), c1 = Math.min(w - 1, Math.floor((xs[k + 1] - x0) / cell - 0.5));
      for (let c = c0; c <= c1; c++) label[r * w + c] = 0;
    }
  }

  // 2. rivers: distance to the nearest line, stamped segment by segment
  const lineDist = new Float32Array(N).fill(Infinity), lineOf = new Int8Array(N).fill(-1), wet = new Uint8Array(N);
  shape.lines.forEach((l, li) => {
    const half = waterHalf(l.strength), reach = half * 4;
    for (let k = 1; k < l.pts.length; k++) {
      const [ax, ay] = l.pts[k - 1], [bx, by] = l.pts[k], vx = bx - ax, vy = by - ay, vv = vx * vx + vy * vy || 1;
      const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach - x0) / cell)), c1 = Math.min(w - 1, Math.ceil((Math.max(ax, bx) + reach - x0) / cell));
      const r0 = Math.max(0, Math.floor((Math.min(ay, by) - reach - y0) / cell)), r1 = Math.min(h - 1, Math.ceil((Math.max(ay, by) + reach - y0) / cell));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const px = cx(c) - ax, py = cy(r) - ay, t = Math.max(0, Math.min(1, (px * vx + py * vy) / vv));
        const d = Math.hypot(px - vx * t, py - vy * t), i = r * w + c;
        if (d < lineDist[i]) { lineDist[i] = d; lineOf[i] = li; }
        if (d < half) wet[i] = 1;
      }
    }
  });
  for (let i = 0; i < N; i++) if (label[i] === 0 && wet[i]) label[i] = RIVER;

  // 3. the palm regions between the rivers (temporary ids from 1000)
  const stack = new Int32Array(N);
  let nextId = 1000;
  for (let i = 0; i < N; i++) {
    if (label[i] !== 0) continue;
    const id = nextId++;
    let sp = 0;
    stack[sp++] = i;
    label[i] = id;
    while (sp) {
      const p = stack[--sp], c = p % w;
      if (c > 0 && label[p - 1] === 0) { label[p - 1] = id; stack[sp++] = p - 1; }
      if (c < w - 1 && label[p + 1] === 0) { label[p + 1] = id; stack[sp++] = p + 1; }
      if (p >= w && label[p - w] === 0) { label[p - w] = id; stack[sp++] = p - w; }
      if (p < N - w && label[p + w] === 0) { label[p + w] = id; stack[sp++] = p + w; }
    }
  }

  // 4. fingers lie on top: three handbits each, canals at the creases (palm rivers stay under the tails)
  const fingerOf = new Int8Array(N).fill(-1), along = new Float32Array(N), across = new Float32Array(N);
  shape.fingers.forEach((f, fi) => {
    const cs = corners(f);
    const c0 = Math.max(0, Math.floor((Math.min(...cs.map((p) => p[0])) - x0) / cell)), c1 = Math.min(w - 1, Math.ceil((Math.max(...cs.map((p) => p[0])) - x0) / cell));
    const r0 = Math.max(0, Math.floor((Math.min(...cs.map((p) => p[1])) - y0) / cell)), r1 = Math.min(h - 1, Math.ceil((Math.max(...cs.map((p) => p[1])) - y0) / cell));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const i = r * w + c, q = fingerAt(f, cx(c), cy(r));
      if (!q || (q.t < 0 && label[i] === RIVER)) continue;
      const s = (f.len - q.t) / f.len;
      const crease = Math.min(Math.abs(s - f.creases[0]) * f.len, Math.abs(s - f.creases[1]) * f.len, Math.abs(q.t - BASE_CREASE));
      fingerOf[i] = fi;
      along[i] = q.t;
      across[i] = q.u;
      label[i] = crease < CANAL_HALF ? CANAL : fi * 3 + (s < f.creases[0] ? 0 : s < f.creases[1] ? 1 : 2);
    }
  });

  // 5. measure the palm regions, fold tiny ones into a neighbour, name them by their mounts
  const stats = new Map();
  for (let i = 0; i < N; i++) {
    const L = label[i];
    if (L < 1000) continue;
    let s = stats.get(L);
    if (!s) stats.set(L, (s = { id: L, area: 0, sx: 0, sy: 0 }));
    s.area++;
    s.sx += i % w;
    s.sy += (i / w) | 0;
  }
  const palmArea = [...stats.values()].reduce((a, s) => a + s.area, 0), big = (s) => s.area >= palmArea * 0.03;
  for (const s of [...stats.values()]) {
    if (big(s)) continue;
    const into = nearestRegion(label, w, s.id, (L) => L >= 1000 && stats.has(L) && big(stats.get(L)));
    for (let i = 0; i < N; i++) if (label[i] === s.id) label[i] = into ?? RIVER;
    if (into != null) { const t = stats.get(into); t.area += s.area; t.sx += s.sx; t.sy += s.sy; }
    stats.delete(s.id);
  }
  const regions = [...stats.values()].map((s) => ({ id: s.id, area: s.area * cell * cell, cx: cx(s.sx / s.area), cy: cy(s.sy / s.area), anchors: new Set() }));
  for (const [key, [X, Y]] of ANCHORS) {
    const c = Math.floor((X - x0) / cell), r = Math.floor((Y - y0) / cell);
    regions.find((g) => g.id === label[r * w + c])?.anchors.add(key);
  }
  regions.sort((a, b) => a.cy - b.cy); // P1 at the wrist
  const remap = new Map(regions.map((g, k) => [g.id, 15 + k]));
  for (let i = 0; i < N; i++) if (label[i] >= 1000) label[i] = remap.get(label[i]);

  const fs = Array.from({ length: 15 }, () => ({ area: 0, sx: 0, sy: 0 }));
  for (let i = 0; i < N; i++) {
    const L = label[i];
    if (L >= 0 && L < 15) { fs[L].area++; fs[L].sx += i % w; fs[L].sy += (i / w) | 0; }
  }
  const handbits = [
    ...fs.map((s, k) => {
      const fi = (k / 3) | 0, seg = k % 3;
      return {
        code: `${FINGER_CODES[fi]}${seg + 1}`, name: `${FINGER_NAMES[fi]} ${['tip', 'middle', fi === 0 ? 'root' : 'base'][seg]}`,
        kind: seg === 0 ? 'tip' : 'segment', finger: fi, seg, area: s.area * cell * cell, cx: cx(s.sx / (s.area || 1)), cy: cy(s.sy / (s.area || 1)),
      };
    }),
    ...regions.map((g, k) => ({ code: `P${k + 1}`, name: regionName(g.anchors), kind: 'palm', area: g.area, cx: g.cx, cy: g.cy })),
  ];
  return { cell, x0, y0, w, h, label, lineOf, lineDist, fingerOf, along, across, handbits, palmCount: regions.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/hand.test.mjs`
Expected: PASS (7 tests). If a palm count is off by one, dump the regions (`lab.handbits.filter((b) => b.kind === 'palm')`) and check which anchor fell into a river: anchors must sit at least 10 m from every template line after the ±12 unit bend.

- [ ] **Step 5: Commit**

```bash
git add src/hand/shape.js src/hand/label.js tests/hand.test.mjs
git commit -m "feat: hand shape from Palm DNA, cut into handbits by its own lines

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Terrain bake and the hand worker

**Files:**
- Create: `src/hand/bake.js`, `src/hand/worker.js`
- Modify: `tests/hand.test.mjs` (append)

**Interfaces:**
- Consumes: `labelHand` output (Task 3), `printPhase` (Task 1), `PATTERN_OF`, `rng`, unpacked prints (Task 2), `toHalf` (Task 2).
- Produces (`bake.js`): `KIND = { tip: 1, segment: 2, palm: 3, river: 4, canal: 5 }`, `COAST = 16`, `bakeHand(shape, lab, prints[5]): { w, h, cell, x0, y0, height: Float32Array (m, ≥ 0.3 on land, 0 outside), water: Float32Array (depth m), cos: Float32Array, sin: Float32Array (cos/sin of 2π·ridge phase), info: Uint8Array (RGBA per cell: tone index 0..17, handbit id + 1, kind | COAST, ridge strength 0..255) }`.
- Produces (`worker.js`): message in `{ id, palm: Uint8Array, prints: Uint8Array[5], cell }`; message out `{ id, w, h, cell, x0, y0, height: Float32Array, texA: Uint16Array (RGBA half floats: height, cos, sin, water), info: Uint8Array, handbits }`.

- [ ] **Step 1: Write the failing test** (append to `tests/hand.test.mjs`)

```js
import { synthPrint } from '../src/hand/dna.js';
import { RIVER, CANAL, OUTSIDE } from '../src/hand/label.js';
import { bakeHand, KIND } from '../src/hand/bake.js';

const baked = () => {
  const shape = hand(), lab = labelHand(shape, 1.5);
  const prints = [0, 1, 2, 3, 4].map((f) => synthPrint(f, ['whorl', 'ulnar', 'ulnar', 'double', 'arch'][f], 10 + f));
  return { lab, bk: bakeHand(shape, lab, prints) };
};

test('rivers lie in valleys, and only rivers and canals hold water', () => {
  const { lab, bk } = baked();
  let river = 0, riverN = 0, land = 0, landN = 0;
  for (let i = 0; i < lab.label.length; i++) {
    const L = lab.label[i];
    if (L === OUTSIDE) {
      assert.equal(bk.height[i], 0);
      assert.equal(bk.info[i * 4 + 2], 0);
      continue;
    }
    assert.ok(Number.isFinite(bk.height[i]) && bk.height[i] >= 0.3);
    if (L === RIVER || L === CANAL) assert.ok(bk.water[i] > 0, `dry water at ${i}`);
    else assert.equal(bk.water[i], 0);
    if (L === RIVER) { river += bk.height[i]; riverN++; } else if (L >= 15) { land += bk.height[i]; landN++; }
  }
  assert.ok(river / riverN < land / landN - 5, `rivers ${river / riverN} m, land ${land / landN} m`);
});

test('print lands carry the strongest ridges, and the phase is a unit vector', () => {
  const { lab, bk } = baked();
  let tips = 0;
  for (let i = 0; i < lab.label.length; i++) {
    const L = lab.label[i];
    if (L < 0) continue;
    assert.ok(Math.abs(bk.cos[i] ** 2 + bk.sin[i] ** 2 - 1) < 1e-5);
    if (L % 3 === 0 && L < 15) {
      tips++;
      assert.equal(bk.info[i * 4 + 2] & 15, KIND.tip);
      assert.equal(bk.info[i * 4 + 3], 255);
    }
  }
  assert.ok(tips > 1000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hand.test.mjs`
Expected: FAIL with `Cannot find module .../src/hand/bake.js`

- [ ] **Step 3: Write the implementation**

```js
// src/hand/bake.js
// A labelled hand becomes terrain: heights in metres (an island with mounts, finger ridges and
// domed print lands, carved by river valleys and canals), water depth, the skin's ridge phase
// (stored as cos and sin so it interpolates cleanly on the GPU) and per-cell info for the shader.
import { printPhase } from '../print/phase.js';
import { PATTERN_OF, rng } from './dna.js';
import { RIVER, CANAL, OUTSIDE, CANAL_HALF, waterHalf } from './label.js';
import { fromTemplate, BASE_CREASE } from './shape.js';

export const KIND = { tip: 1, segment: 2, palm: 3, river: 4, canal: 5 };
export const COAST = 16;
// the mounts as hills: centre (template units), height (m), spread (m)
const HILLS = [[[455, 690], 18, 60], [[180, 700], 10, 55], [[150, 470], 7, 30], [[240, 440], 7, 30], [[330, 430], 7, 30], [[420, 440], 7, 30]]
  .map(([p, a, s]) => [fromTemplate(p), a, s]);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// metres from each cell to the nearest outside cell (two-pass chamfer)
function chamfer(label, w, h, cell) {
  const d = new Float32Array(w * h), a = cell, b = cell * Math.SQRT2;
  for (let i = 0; i < w * h; i++) d[i] = label[i] === OUTSIDE ? 0 : 1e9;
  for (let r = 1; r < h - 1; r++) for (let c = 1; c < w - 1; c++) {
    const i = r * w + c;
    if (d[i]) d[i] = Math.min(d[i], d[i - 1] + a, d[i - w] + a, d[i - w - 1] + b, d[i - w + 1] + b);
  }
  for (let r = h - 2; r > 0; r--) for (let c = w - 2; c > 0; c--) {
    const i = r * w + c;
    if (d[i]) d[i] = Math.min(d[i], d[i + 1] + a, d[i + w] + a, d[i + w + 1] + b, d[i + w - 1] + b);
  }
  return d;
}

export function bakeHand(shape, lab, prints) {
  const { w, h, cell, x0, y0, label } = lab, N = w * h;
  const height = new Float32Array(N), water = new Float32Array(N), cos = new Float32Array(N), sin = new Float32Array(N), info = new Uint8Array(N * 4);
  const coastDist = chamfer(label, w, h, cell);
  const rand = rng(shape.seed);
  const hills = HILLS.map(([[hx, hy], a, s]) => [hx, hy, a * (0.75 + rand() * 0.5), 2 * s * s]);
  const tone = (L) => shape.palette * 3 + (L < 0 ? 0 : ((Math.imul(L + 1, 0x9e3779b1) ^ shape.seed) >>> 0) % 3);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const i = r * w + c, L = label[i];
    if (L === OUTSIDE) continue;
    const X = x0 + (c + 0.5) * cell, Y = y0 + (r + 0.5) * cell;
    let z = 22 * sstep(0, 45, coastDist[i]), phase = 0, kind, strength = 0;
    for (const [hx, hy, a, s2] of hills) z += a * Math.exp(-((X - hx) ** 2 + (Y - hy) ** 2) / s2);
    const fi = lab.fingerOf[i];
    if (fi >= 0) {
      const f = shape.fingers[fi], hw = f.width / 2, u = lab.across[i], t = lab.along[i], s = (f.len - t) / f.len;
      z += 9 * Math.max(0, 1 - (u / hw) ** 2) * sstep(-10, 25, t); // a ridge along the finger
      const crease = Math.min(Math.abs(s - f.creases[0]) * f.len, Math.abs(s - f.creases[1]) * f.len, Math.abs(t - BASE_CREASE));
      z -= 4 * (1 - sstep(CANAL_HALF, 6, crease)); // canal valleys
      if (L === CANAL) {
        kind = KIND.canal;
        phase = u / 7; // a stitch every 7 m across the canal
        water[i] = 1;
      } else if (s < f.creases[0]) {
        kind = KIND.tip;
        strength = 255;
        const ct = f.len - (f.len * f.creases[0]) / 2 - hw * 0.15, qx = u / hw, qy = (t - ct) / hw;
        z += 8 * Math.max(0, 1 - qx * qx - 0.6 * qy * qy); // a domed print land
        const p = prints[fi], [pattern, mirror] = PATTERN_OF[p.cls];
        phase = printPhase(pattern, (mirror ? -qx : qx) * 1.05, qy * 0.95, p.seed);
      } else {
        kind = KIND.segment;
        strength = 150;
        phase = t / 3.6 + 0.8 * Math.sin(u * 0.11 + fi); // ridges across the finger
      }
    } else if (L === RIVER) {
      kind = KIND.river;
    } else {
      kind = KIND.palm;
      strength = 120;
      phase = Y / 3.6 + 2.6 * Math.sin(X * 0.0154 + Y * 0.005) + 1.2 * Math.sin(X * 0.033 - Y * 0.014 + 1.3);
    }
    const li = lab.lineOf[i];
    if (li >= 0 && (fi < 0 || lab.along[i] < 0)) { // rivers carve the palm, and the finger tails over them
      const st = shape.lines[li].strength, half = waterHalf(st);
      z -= (6 + 4 * st) * (1 - sstep(half, half * 3.5, lab.lineDist[i]));
      if (L === RIVER) water[i] = 1.5 + 0.8 * st;
    }
    height[i] = Math.max(0.3, z);
    cos[i] = Math.cos(2 * Math.PI * phase);
    sin[i] = Math.sin(2 * Math.PI * phase);
    const coast = label[i - 1] === OUTSIDE || label[i + 1] === OUTSIDE || label[i - w] === OUTSIDE || label[i + w] === OUTSIDE;
    info[i * 4] = tone(L);
    info[i * 4 + 1] = L >= 0 ? L + 1 : 0;
    info[i * 4 + 2] = kind | (coast ? COAST : 0);
    info[i * 4 + 3] = strength;
  }
  return { w, h, cell, x0, y0, height, water, cos, sin, info };
}
```

```js
// src/hand/worker.js
// Builds a Hand off the main thread: DNA → shape → handbits → terrain → arrays the GPU takes as they
// are. Workers can't use the page's importmap, so nothing here may import three.js.
import { unpackPalm, unpackPrint } from './dna.js';
import { handShape } from './shape.js';
import { labelHand } from './label.js';
import { bakeHand } from './bake.js';
import { toHalf } from './half.js';

onmessage = ({ data: { id, palm, prints, cell } }) => {
  const shape = handShape(unpackPalm(palm));
  const lab = labelHand(shape, cell);
  const b = bakeHand(shape, lab, prints.map(unpackPrint));
  const N = b.w * b.h, texA = new Uint16Array(N * 4);
  for (let i = 0; i < N; i++) {
    texA[i * 4] = toHalf(b.height[i]);
    texA[i * 4 + 1] = toHalf(b.cos[i]);
    texA[i * 4 + 2] = toHalf(b.sin[i]);
    texA[i * 4 + 3] = toHalf(b.water[i]);
  }
  postMessage(
    { id, w: b.w, h: b.h, cell: b.cell, x0: b.x0, y0: b.y0, height: b.height, texA, info: b.info, handbits: lab.handbits },
    [b.height.buffer, texA.buffer, b.info.buffer],
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/hand.test.mjs`
Expected: PASS (9 tests)

Then time one full-resolution bake (it has to stay well under a second per hand):

Run: `node -e "import('./src/hand/shape.js').then(async (s) => { const d = await import('./src/hand/dna.js'), l = await import('./src/hand/label.js'), b = await import('./src/hand/bake.js'); const sh = s.handShape(d.unpackPalm(d.packPalm(s.templatePalm({ seed: 3 })))); const t = performance.now(); const lab = l.labelHand(sh, 0.75); b.bakeHand(sh, lab, [0,1,2,3,4].map((f) => d.synthPrint(f, 'whorl', f))); console.log(lab.w + 'x' + lab.h, Math.round(performance.now() - t) + ' ms'); })"`
Expected: a grid of about 560x820 and a time under 1000 ms.

- [ ] **Step 5: Commit**

```bash
git add src/hand/bake.js src/hand/worker.js tests/hand.test.mjs
git commit -m "feat: bake a hand into terrain (heights, rivers, canals, ridge phase) in a worker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The First Ten

**Files:**
- Create: `src/world/founders.js`
- Test: `tests/founders.test.mjs`

**Interfaces:**
- Consumes: `templatePalm`, `handShape`, `insideHand` (Task 3); `packPalm`, `packPrint`, `synthPrint`, `rng`, `unpackPalm` (Task 2).
- Produces: `FOUNDER_NAMES: string[10]`, `RING_WRIST = 405` (m), `SOURCE_RADIUS = 250` (m), `founders(): { name, palm: Uint8Array, prints: Uint8Array[5], pose: { x, z, rot, mirror } }[10]`, `toWorld(pose, X, Y): [x, z]`, `toHand(pose, x, z): [X, Y]`. World: x east, z south (three.js), rot 0 = fingers pointing to -z.

- [ ] **Step 1: Write the failing test**

```js
// tests/founders.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { founders, toHand, toWorld, FOUNDER_NAMES } from '../src/world/founders.js';
import { handShape, insideHand } from '../src/hand/shape.js';
import { unpackPalm } from '../src/hand/dna.js';

test('ten founders, named, each with a palm and five 44-byte prints', () => {
  const f = founders();
  assert.equal(f.length, 10);
  assert.deepEqual(f.map((h) => h.name), FOUNDER_NAMES);
  for (const h of f) {
    assert.equal(h.prints.length, 5);
    h.prints.forEach((p) => assert.equal(p.length, 44));
  }
});

test('the founders are the same on every device', () => {
  assert.deepEqual(founders().map((h) => [...h.palm]), founders().map((h) => [...h.palm]));
});

test('hand and world coordinates round-trip, mirrored or not (Review Focus 2)', () => {
  for (const mirror of [false, true]) {
    const pose = { x: 120, z: -340, rot: 1.1, mirror };
    const [x, z] = toWorld(pose, 37, 210);
    const [X, Y] = toHand(pose, x, z);
    assert.ok(Math.abs(X - 37) < 1e-9 && Math.abs(Y - 210) < 1e-9, `${mirror}: ${X}, ${Y}`);
  }
  assert.deepEqual(toWorld({ x: 0, z: 0, rot: 0, mirror: false }, 0, 100).map(Math.round), [0, -100]); // fingers to -z
});

test('every hand reaches away from the Source', () => {
  for (const h of founders()) {
    const wrist = toWorld(h.pose, 0, 0), tip = toWorld(h.pose, 0, 500);
    assert.ok(Math.hypot(...tip) > Math.hypot(...wrist) + 400);
  }
});

test('the First Ten never overlap', () => {
  const hs = founders().map((h) => ({ pose: h.pose, shape: handShape(unpackPalm(h.palm)) }));
  for (let x = -1200; x <= 1200; x += 10) for (let z = -1200; z <= 1200; z += 10) {
    let n = 0;
    for (const h of hs) {
      const [X, Y] = toHand(h.pose, x, z);
      if (X > -200 && X < 300 && Y > -20 && Y < 640 && insideHand(h.shape, X, Y)) n++;
    }
    assert.ok(n <= 1, `${n} hands at ${x}, ${z}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/founders.test.mjs`
Expected: FAIL with `Cannot find module .../src/world/founders.js`

- [ ] **Step 3: Write the implementation**

```js
// src/world/founders.js
// The First Ten: synthetic founding hands in a ring around the Source, wrists in and fingers out,
// little-finger edge towards the next hand's thumb, so the world has a coast to grow from. Their
// DNA is generated, never scanned, and they are labelled as founders. Pure.
import { packPalm, packPrint, synthPrint, rng } from '../hand/dna.js';
import { templatePalm } from '../hand/shape.js';

export const FOUNDER_NAMES = ['Yanida', 'Cadio', 'Oru', 'Fennick', 'Saelo', 'Marrow', 'Tilde', 'Quenna', 'Brisk', 'Ombre'];
export const RING_WRIST = 405; // metres from the Source to each wrist
export const SOURCE_RADIUS = 250;
// how often each class turns up on a fingertip, roughly as in people
const CLASS_ODDS = [['ulnar', 0.58], ['whorl', 0.26], ['radial', 0.04], ['double', 0.04], ['pocket', 0.03], ['arch', 0.03], ['tented', 0.02]];
const pickClass = (x) => {
  for (const [cls, p] of CLASS_ODDS) if ((x -= p) < 0) return cls;
  return 'ulnar';
};

export function founders() {
  return FOUNDER_NAMES.map((name, i) => {
    const rand = rng(1000 + i * 7919);
    const palm = templatePalm({
      seed: Math.floor(rand() * 2 ** 32), fate: rand() < 0.75, sun: rand() < 0.3, mercury: rand() < 0.2, fused: i === 6, palette: i % 6,
    });
    const prints = [0, 1, 2, 3, 4].map((f) => packPrint(synthPrint(f, pickClass(rand()), Math.floor(rand() * 2 ** 32))));
    const rot = (i / FOUNDER_NAMES.length) * Math.PI * 2;
    return { name, palm: packPalm(palm), prints, pose: { x: Math.sin(rot) * RING_WRIST, z: -Math.cos(rot) * RING_WRIST, rot, mirror: false } };
  });
}

// hand metres (X towards the thumb, Y towards the fingers) to world (x, z), and back
export function toWorld(pose, X, Y) {
  const c = Math.cos(pose.rot), s = Math.sin(pose.rot), x = pose.mirror ? -X : X;
  return [pose.x + c * x + s * Y, pose.z + s * x - c * Y];
}
export function toHand(pose, x, z) {
  const c = Math.cos(pose.rot), s = Math.sin(pose.rot), dx = x - pose.x, dz = z - pose.z;
  const X = c * dx + s * dz;
  return [pose.mirror ? -X : X, s * dx - c * dz];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/founders.test.mjs`
Expected: PASS (5 tests). If "never overlap" fails, raise `RING_WRIST` in steps of 25 m until it passes and say so in the commit.

- [ ] **Step 5: Commit**

```bash
git add src/world/founders.js tests/founders.test.mjs
git commit -m "feat: the First Ten, ten synthetic founding hands in a ring

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Scribble motion

**Files:**
- Create: `src/scribble.js`
- Test: `tests/scribble.test.mjs`

**Interfaces:**
- Consumes: `printPhase` (Task 1), `rng`, `PATTERN_OF` (Task 2).
- Produces:
  - `createScribble({ points = 90, spacing = 0.55, at = [0,0,0], dir = [0,0,-1], seed = 1 }): scribble` with `pos: [x,y,z]`, `dir: [x,y,z]` (unit), `step(dt, target: [x,y,z], { speed = 9, turn = 2.5, loops = 0.06, loopTime = 1.1, wander = 0.35 } = {})`, `polyline(): { xyz: Float32Array, count }` (head first; the buffer is reused between calls)
  - `createKnot({ cls = 'whorl', seed = 1, center = [0,0,0], radius = 14, tilt = 0.5 }): { center, radius, step(dt, speed): [x,y,z] }`

- [ ] **Step 1: Write the failing test**

```js
// tests/scribble.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScribble, createKnot } from '../src/scribble.js';

const seg = (xyz, i) => Math.hypot(xyz[i * 3] - xyz[i * 3 - 3], xyz[i * 3 + 1] - xyz[i * 3 - 2], xyz[i * 3 + 2] - xyz[i * 3 - 1]);
const angle = (a, b) => Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));

test('once drawn out, the line keeps one length with points exactly spacing apart', () => {
  const s = createScribble({ points: 40, spacing: 0.5, seed: 3 });
  let t = 0;
  for (let k = 0; k < 600; k++) {
    t += 1 / 60;
    s.step(1 / 60, [Math.cos(t) * 20, 5, Math.sin(t) * 20], { speed: 9 });
  }
  const { xyz, count } = s.polyline();
  assert.equal(count, 41);
  let total = 0;
  for (let i = 1; i < count; i++) total += seg(xyz, i);
  assert.ok(Math.abs(total - 39 * 0.5) < 0.02, `length ${total}`);
  for (let i = 2; i < count - 1; i++) assert.ok(Math.abs(seg(xyz, i) - 0.5) < 1e-3);
});

test('the head turns no faster than allowed', () => {
  const s = createScribble({ seed: 1, dir: [0, 0, -1] });
  let prev = s.dir.slice();
  for (let k = 0; k < 200; k++) {
    s.step(0.02, [50, 0, 50], { speed: 9, turn: 1, loops: 0, wander: 0 });
    assert.ok(angle(prev, s.dir) <= 0.02 + 1e-6);
    prev = s.dir.slice();
  }
});

test('a loop is a full turn', () => {
  const s = createScribble({ seed: 2, dir: [0, 0, -1] });
  let prev = s.dir.slice(), total = 0;
  for (let k = 0; k < 100; k++) {
    s.step(0.02, [0, 0, -1000], { speed: 9, turn: 0, loops: 50, loopTime: 1, wander: 0 });
    total += angle(prev, s.dir);
    prev = s.dir.slice();
  }
  assert.ok(total > 2 * Math.PI * 0.9, `turned ${total}`);
});

test('a long frame still lays evenly spaced points (Review Focus 5)', () => {
  const s = createScribble({ points: 20, spacing: 0.5 });
  s.step(0.5, [0, 0, -100], { speed: 30, loops: 0, wander: 0 }); // 15 m in one step
  const { xyz, count } = s.polyline();
  assert.equal(count, 21);
  for (let i = 2; i < count - 1; i++) assert.ok(Math.abs(seg(xyz, i) - 0.5) < 1e-3);
});

test('a knot stays over its hand and keeps moving', () => {
  const k = createKnot({ cls: 'whorl', seed: 4, center: [10, 50, -20], radius: 14 });
  let prev = k.step(0, 9), travelled = 0;
  for (let i = 0; i < 3600; i++) {
    const p = k.step(1 / 60, 9);
    assert.ok(Math.hypot(p[0] - 10, p[1] - 50, p[2] + 20) <= 14 * 0.96 + 1e-9);
    travelled += Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]);
    prev = p;
  }
  assert.ok(travelled > 9 * 60 * 0.6, `travelled ${travelled}`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/scribble.test.mjs`
Expected: FAIL with `Cannot find module .../src/scribble.js`

- [ ] **Step 3: Write the implementation**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/scribble.test.mjs`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/scribble.js tests/scribble.test.mjs
git commit -m "feat: scribbles, one ink line sliding along its own trail, knotting into prints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Gliding

**Files:**
- Create: `src/glide.js`
- Test: `tests/glide.test.mjs`

**Interfaces:**
- Produces: `createGlide({ pos = [0, 300, 1400], yaw = 0, speed = 24, turnRate = 0.45, climbRate = 12, clearance = 35, ceiling = 900 }): { pos, yaw, speed, forward(): [x,0,z], update(dt, { turn, climb }, groundAt: (x, z) => metres) }`. Yaw 0 faces -z; turn +1 turns right (yaw decreases).

- [ ] **Step 1: Write the failing test**

```js
// tests/glide.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGlide } from '../src/glide.js';

test('glides forward at its speed, facing -z at yaw 0', () => {
  const g = createGlide({ pos: [0, 200, 0], speed: 20 });
  g.update(0.5, {}, () => 0);
  assert.ok(Math.abs(g.pos[2] + 10) < 1e-9 && Math.abs(g.pos[0]) < 1e-9);
});

test('turn +1 turns right', () => {
  const g = createGlide({ pos: [0, 200, 0] });
  for (let i = 0; i < 60; i++) g.update(1 / 60, { turn: 1 }, () => 0);
  assert.ok(g.yaw < 0);
  assert.ok(g.forward()[0] > 0);
});

test('a cliff ahead never puts you inside the ground', () => {
  const ground = (x) => (x > 100 ? 200 : 0);
  const g = createGlide({ pos: [0, 40, 0], yaw: -Math.PI / 2 }); // facing +x
  for (let i = 0; i < 600; i++) {
    g.update(1 / 60, {}, ground);
    assert.ok(g.pos[1] >= ground(g.pos[0]) + 8 - 1e-9, `at x=${g.pos[0]}: ${g.pos[1]}`);
  }
});

test('starting too low, it climbs back to its clearance', () => {
  const g = createGlide({ pos: [0, 10, 0], clearance: 35 });
  for (let i = 0; i < 300; i++) g.update(1 / 60, {}, () => 0);
  assert.ok(g.pos[1] > 34);
});

test('minutes over open sea stay finite and above the clearance (Review Focus 4)', () => {
  const g = createGlide({ pos: [0, 300, 0] });
  for (let i = 0; i < 20000; i++) g.update(1 / 60, { turn: Math.sin(i / 300), climb: Math.cos(i / 500) }, () => 0);
  assert.ok(g.pos.every(Number.isFinite));
  assert.ok(g.pos[1] >= 8 && g.pos[1] <= 900);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/glide.test.mjs`
Expected: FAIL with `Cannot find module .../src/glide.js`

- [ ] **Step 3: Write the implementation**

```js
// src/glide.js
// Gliding over the world: constant forward speed, turn and climb in -1..1, and the ground kept at a
// distance below you, looking a little ahead so a hill lifts you in time. Pure.
export function createGlide({ pos = [0, 300, 1400], yaw = 0, speed = 24, turnRate = 0.45, climbRate = 12, clearance = 35, ceiling = 900 } = {}) {
  const clamp1 = (v) => Math.max(-1, Math.min(1, v));
  return {
    pos: pos.slice(), yaw, speed,
    forward() { return [-Math.sin(this.yaw), 0, -Math.cos(this.yaw)]; },
    update(dt, { turn = 0, climb = 0 } = {}, groundAt = () => 0) {
      this.yaw -= clamp1(turn) * turnRate * dt;
      const f = this.forward();
      this.pos[0] += f[0] * this.speed * dt;
      this.pos[2] += f[2] * this.speed * dt;
      let y = this.pos[1] + clamp1(climb) * climbRate * dt;
      const here = groundAt(this.pos[0], this.pos[2]);
      const floor = Math.max(here, groundAt(this.pos[0] + f[0] * 60, this.pos[2] + f[2] * 60)) + clearance;
      if (y < floor) y += (floor - y) * (1 - Math.exp(-dt * 2.5));
      this.pos[1] = Math.min(ceiling, Math.max(y, here + 8));
      return this;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/glide.test.mjs`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/glide.js tests/glide.test.mjs
git commit -m "feat: gliding with ground clearance and look-ahead

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The world on screen

**Files:**
- Modify: `src/ink.js` (per-vertex width, `stroke()`)
- Create: `src/world/scene.js` (sky, Paper Sea with the Source, shared uniforms, GLSL chunks), `src/world/handmesh.js`
- Rewrite: `src/main.js`
- Modify: `index.html` (banner copy)
- Scratch (not committed): `<scratchpad>/m1/shot.mjs`

**Interfaces:**
- Consumes: everything above. `createPanel`, `startAudio`, `pauseAudio`, `setWind` (existing); `JOINTS`, `palmFrame`, `createPalmDown`, `palmTilt` (existing `gesture.js`); `headSteer` (existing `steer.js`).
- Produces: `createInk(...).stroke(xyz: Float32Array, count: number, taper: (s) => number)`; `createWorldScene(): { shared, sea, sky }`; `createHandMesh(workerData, pose, shared): THREE.Mesh`; `window.__pwc.state = { hands, pos, yaw, fps, scribbles, started }`.

- [ ] **Step 1: Give ink lines a width per vertex**

Replace `src/ink.js` with:

```js
import * as THREE from 'three';

// Ink wire: line segments drawn as camera-facing ribbons with a real width in metres, all in one
// draw call. Plain GL lines are one pixel wide and shimmer in a headset; these read as pen strokes.
// Each end of a segment has its own width, so a line can taper like a brush stroke.
export function createInk(maxSegments, { width = 0.0016, color = '#15100e' } = {}) {
  const pos = new Float32Array(maxSegments * 12);
  const other = new Float32Array(maxSegments * 12);
  const widths = new Float32Array(maxSegments * 4);
  const side = new Float32Array(maxSegments * 4);
  const index = new Uint32Array(maxSegments * 6);
  for (let s = 0; s < maxSegments; s++) {
    // corners a-, a+, b+, b-: the far end's "other" points back along the segment, which flips its
    // across vector, so its side values are mirrored to land on the same edges
    side.set([-1, 1, -1, 1], s * 4);
    index.set([s * 4, s * 4 + 1, s * 4 + 2, s * 4, s * 4 + 2, s * 4 + 3], s * 6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('other', new THREE.BufferAttribute(other, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('width', new THREE.BufferAttribute(widths, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('side', new THREE.BufferAttribute(side, 1));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.setDrawRange(0, 0);

  const mat = new THREE.ShaderMaterial({
    uniforms: { uWidth: { value: width }, uColor: { value: new THREE.Color(color) } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec3 other;
      attribute float side;
      attribute float width;
      uniform float uWidth;
      void main() {
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        vec4 q = modelViewMatrix * vec4(other, 1.0);
        vec3 along = q.xyz - p.xyz;
        vec3 across = cross(along, p.xyz);
        float len = length(across);
        p.xyz += (len > 1e-9 ? across / len : vec3(0.0)) * side * uWidth * width * 0.5;
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  let n = 0;

  const put = (arr, v, x, y, z) => { arr[v * 3] = x; arr[v * 3 + 1] = y; arr[v * 3 + 2] = z; };
  function seg(ax, ay, az, bx, by, bz, wa, wb) {
    if (n >= maxSegments) return;
    const v = n * 4;
    put(pos, v, ax, ay, az); put(other, v, bx, by, bz);
    put(pos, v + 1, ax, ay, az); put(other, v + 1, bx, by, bz);
    put(pos, v + 2, bx, by, bz); put(other, v + 2, ax, ay, az);
    put(pos, v + 3, bx, by, bz); put(other, v + 3, ax, ay, az);
    widths[v] = widths[v + 1] = wa;
    widths[v + 2] = widths[v + 3] = wb;
    n++;
  }
  return {
    mesh,
    get count() { return n; },
    set width(w) { mat.uniforms.uWidth.value = w; },
    begin() { n = 0; },
    segment(a, b, wa = 1, wb = 1) { seg(a.x, a.y, a.z, b.x, b.y, b.z, wa, wb); },
    polyline(points) { for (let i = 1; i < points.length; i++) this.segment(points[i - 1], points[i]); },
    // a flat xyz array as one tapered stroke; taper(s) is the width at s = 0 (head) .. 1 (tail)
    stroke(xyz, count, taper) {
      for (let i = 1; i < count; i++) {
        const a = (i - 1) * 3, b = i * 3;
        seg(xyz[a], xyz[a + 1], xyz[a + 2], xyz[b], xyz[b + 1], xyz[b + 2], taper((i - 1) / (count - 1)), taper(i / (count - 1)));
      }
    },
    end() {
      geo.attributes.position.needsUpdate = true;
      geo.attributes.other.needsUpdate = true;
      geo.attributes.width.needsUpdate = true;
      geo.setDrawRange(0, n * 6);
    },
  };
}
```

Run: `node --test tests/*.test.mjs`
Expected: all tests pass (ink.js has no unit test; the old modules that call `segment(a, b)` keep the default widths).

- [ ] **Step 2: Sky, Paper Sea and the Source**

```js
// src/world/scene.js
import * as THREE from 'three';
import { SOURCE_RADIUS } from './founders.js';

// The world around the hands: a warm paper sky, the Paper Sea (parchment with faint contour rings
// round the Source) and the Source itself, a lake in the middle. Colours live in uniforms shared by
// every shader, so the hands and the sea fog to the same haze.

export const TONES = [
  '#f3cdb3', '#ebbd9f', '#f7dbc6', '#e6b08f', '#dba282', '#efc0a2', '#d2996f', '#c68a61', '#dcaa86',
  '#ae7350', '#a0663f', '#bc8462', '#87573b', '#7a4b31', '#97674c', '#5f3b29', '#533122', '#6e4836',
];
export const HAZE = '#ead9c2';

export const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }`;
// needs uSky, uSunDir declared before it
export const WATER_GLSL = /* glsl */ `
  vec3 water(vec3 p, vec3 V, float depth, float time) {
    vec2 q = p.xz * 0.09 + vec2(time * 0.04, time * 0.025);
    vec3 n = normalize(vec3((vnoise(q * 3.0) - 0.5) * 0.35, 1.0, (vnoise(q * 4.0 + 7.3) - 0.5) * 0.35));
    vec3 col = mix(vec3(0.1, 0.22, 0.29), vec3(0.02, 0.07, 0.13), clamp(depth / 4.0, 0.0, 1.0));
    float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
    col = mix(col, uSky, 0.12 + 0.55 * fres);
    col += vec3(1.0, 0.9, 0.75) * pow(max(dot(n, normalize(V + uSunDir)), 0.0), 140.0) * 0.9;
    return col;
  }`;
export const INK_GLSL = 'const vec3 INK = vec3(0.0103, 0.0065, 0.0052);';

const SEA_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const SEA_FRAG = /* glsl */ `
  uniform vec3 uSky, uSunDir, uFogColor, uPaper;
  uniform float uFogDensity, uTime, uSource;
  varying vec3 vWorld;
  ${NOISE_GLSL}
  ${WATER_GLSL}
  ${INK_GLSL}
  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    float r = length(vWorld.xz);
    vec3 col;
    if (r < uSource) {
      col = water(vWorld, V, mix(5.0, 0.6, smoothstep(uSource * 0.5, uSource, r)), uTime);
    } else {
      float fibre = vnoise(vWorld.xz * 0.04) * 0.05 + vnoise(vWorld.xz * 0.5) * 0.03;
      float ring = smoothstep(0.96, 1.0, cos((r - uSource) / 90.0 * 6.2831853)) * 0.06 * (1.0 - smoothstep(1200.0, 3500.0, r));
      col = uPaper * (1.0 - fibre - ring);
    }
    col = mix(col, INK, (1.0 - smoothstep(0.0, 4.0, abs(r - uSource))) * 0.7); // the Source's inked shore
    float f = 1.0 - exp(-pow(length(cameraPosition - vWorld) * uFogDensity, 2.0));
    gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
    #include <colorspace_fragment>
  }`;
const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const SKY_FRAG = /* glsl */ `
  uniform vec3 uFogColor, uZenith, uSunDir;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    vec3 col = mix(uFogColor, uZenith, pow(clamp(d.y, 0.0, 1.0), 0.6));
    col += vec3(1.0, 0.85, 0.6) * pow(max(dot(d, uSunDir), 0.0), 64.0) * 0.5;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

export function createWorldScene() {
  const shared = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(-0.5, 0.75, 0.35).normalize() },
    uFogColor: { value: new THREE.Color(HAZE) },
    uFogDensity: { value: 1 / 4200 },
    uSky: { value: new THREE.Color('#dfe3dc') },
    uTones: { value: TONES.map((c) => new THREE.Color(c)) },
  };
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(60000, 60000).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: { ...shared, uPaper: { value: new THREE.Color('#e9dcc6') }, uSource: { value: SOURCE_RADIUS } },
      vertexShader: SEA_VERT, fragmentShader: SEA_FRAG,
    }),
  );
  sea.position.y = -0.6;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(30000, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: { ...shared, uZenith: { value: new THREE.Color('#d4bfa3') } },
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
    }),
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return { shared, sea, sky };
}
```

- [ ] **Step 3: A hand as a mesh**

```js
// src/world/handmesh.js
import * as THREE from 'three';
import { NOISE_GLSL, WATER_GLSL, INK_GLSL } from './scene.js';

// One Hand as a mesh: a grid over its bounding box, lifted by the baked heights. The fragment
// shader draws the skin's ridges from the baked phase (so they stay sharp however low you fly),
// pores on the crests, the inked print lines, water in rivers and canals, stitches over the canals
// and an ink coastline.
const VERT = /* glsl */ `
  uniform sampler2D uA;
  uniform vec2 uTexel;
  uniform float uCell;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    float h = texture2D(uA, uv).r;
    vec2 dx = vec2(uTexel.x * 2.0, 0.0), dy = vec2(0.0, uTexel.y * 2.0);
    float sx = (texture2D(uA, uv + dx).r - texture2D(uA, uv - dx).r) / (4.0 * uCell);
    float sy = (texture2D(uA, uv + dy).r - texture2D(uA, uv - dy).r) / (4.0 * uCell);
    vec4 world = modelMatrix * vec4(position + vec3(0.0, h, 0.0), 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * vec3(-sx, 1.0, sy)); // the plane's +v runs along -z
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

const FRAG = /* glsl */ `
  uniform sampler2D uA;
  uniform sampler2D uB;
  uniform vec3 uTones[18];
  uniform vec3 uSunDir, uFogColor, uSky;
  uniform float uFogDensity, uTime;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;
  ${NOISE_GLSL}
  ${WATER_GLSL}
  ${INK_GLSL}
  // perturb a normal by a height given per pixel (Mikkelsen, bump mapping without tangents)
  vec3 bump(vec3 n, float h) {
    vec3 dpx = dFdx(vWorld), dpy = dFdy(vWorld);
    vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
    return normalize(abs(det) * n - grad);
  }
  void main() {
    vec4 a = texture2D(uA, vUv);
    vec4 b = texture2D(uB, vUv);
    float code = floor(b.b * 255.0 + 0.5);
    float coast = step(15.5, code);
    float kind = code - 16.0 * coast;
    if (kind < 0.5) discard;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 n = normalize(vNormal);
    float r = a.g / max(length(a.gb), 1e-3); // cos(2π·phase): +1 on a ridge crest
    vec3 col;
    if (kind > 3.5) {
      col = water(vWorld, V, max(a.a, 0.5), uTime);
      if (kind > 4.5) col = mix(col, INK, smoothstep(0.8, 0.9, r) * 0.85); // stitches over a canal
    } else {
      float aa = 1.0 - smoothstep(0.6, 1.6, length(fwidth(a.gb))); // fade ridges finer than a pixel
      float s = b.a * aa;
      float pore = smoothstep(0.55, 0.8, r) * step(0.88, hash(floor(vWorld.xz * 1.2)));
      n = bump(n, (r * 0.5 - pore * 0.35) * s);
      vec3 skin = uTones[int(b.r * 255.0 + 0.5)];
      col = skin * (0.92 + 0.12 * r * s);
      col = mix(col, skin * vec3(0.7, 0.52, 0.48), (0.5 - 0.5 * r) * s * 0.5); // furrows deeper and redder
      col = mix(col, INK, smoothstep(0.86, 0.97, r) * s * (kind < 1.5 ? 0.6 : 0.2)); // prints inked darker
      col *= 0.38 * (0.6 + 0.4 * n.y) + 0.9 * max(dot(n, uSunDir), 0.0);
    }
    col = mix(col, INK, coast * 0.8);
    float f = 1.0 - exp(-pow(length(cameraPosition - vWorld) * uFogDensity, 2.0));
    gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
    #include <colorspace_fragment>
  }`;

// d: the worker's message (w, h, cell, x0, y0, texA, info); pose: { x, z, rot, mirror }
export function createHandMesh(d, pose, shared) {
  const texA = new THREE.DataTexture(d.texA, d.w, d.h, THREE.RGBAFormat, THREE.HalfFloatType);
  texA.magFilter = texA.minFilter = THREE.LinearFilter;
  texA.needsUpdate = true;
  const texB = new THREE.DataTexture(d.info, d.w, d.h, THREE.RGBAFormat, THREE.UnsignedByteType); // nearest
  texB.needsUpdate = true;
  const W = d.w * d.cell, H = d.h * d.cell;
  // the plane lies in hand coordinates: X along x, Y along -z; uv (0, 0) is the cell at (x0, y0)
  const geo = new THREE.PlaneGeometry(W, H, Math.round(d.w / 3), Math.round(d.h / 3))
    .rotateX(-Math.PI / 2)
    .translate(d.x0 + W / 2, 0, -(d.y0 + H / 2));
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...shared, uA: { value: texA }, uB: { value: texB }, uTexel: { value: new THREE.Vector2(1 / d.w, 1 / d.h) }, uCell: { value: d.cell } },
    vertexShader: VERT, fragmentShader: FRAG,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(pose.x, 0, pose.z);
  mesh.rotation.y = -pose.rot; // matches toWorld(): fingers along (sin rot, -cos rot)
  if (pose.mirror) mesh.scale.x = -1; // three.js flips the face winding for mirrored meshes itself
  mesh.frustumCulled = false; // the heights are applied on the GPU
  return mesh;
}
```

- [ ] **Step 4: The page**

Replace `src/main.js` with:

```js
import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { headSteer } from './steer.js';
import { startAudio, pauseAudio, setWind } from './audio.js';
import { JOINTS, palmFrame, createPalmDown, palmTilt } from './gesture.js';
import { createPanel } from './panel.js';
import { createInk } from './ink.js';
import { createGlide } from './glide.js';
import { createScribble, createKnot } from './scribble.js';
import { unpackPrint } from './hand/dna.js';
import { founders, toHand, toWorld } from './world/founders.js';
import { createWorldScene } from './world/scene.js';
import { createHandMesh } from './world/handmesh.js';

// Palm Whorl Cities, first milestone: the First Ten. Ten founding hands lie in a ring around the
// Source. Their lines are rivers, their fingertips are print lands, and black-ink scribbles knot
// over them. You glide above it all, steering with a tilted palm, your head, or the keyboard.

const params = new URLSearchParams(location.search);
const AUTO = params.has('auto'); // a slow circle, for screenshots and headless checks

// ?emulate: a Meta Quest 3 in a desktop browser (IWER, Meta's WebXR emulator); &device=glasses for
// the Meta VR Glasses profile; &nodevui hides the emulator's controls
if (params.has('emulate')) {
  const { XRDevice, metaQuest3, metaVRGlasses } = await import('https://esm.sh/iwer@2.5.0');
  const device = new XRDevice(params.get('device') === 'glasses' ? metaVRGlasses : metaQuest3);
  device.installRuntime({ forceInstall: true });
  window.__device = device;
  if (!params.has('nodevui')) {
    try {
      const { DevUI } = await import('https://esm.sh/@iwer/devui@2.5.0');
      device.installDevUI(DevUI);
    } catch (e) {
      console.warn('IWER dev UI unavailable', e);
    }
  }
}

// ---------- renderer, you, the world ----------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local');
renderer.xr.setFoveation(1);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const rig = new THREE.Group(); // you: camera and hands, gliding
scene.add(rig);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.5, 40000);
rig.add(camera);
const world = createWorldScene();
scene.add(world.sea);
rig.add(world.sky);
const panel = createPanel();
rig.add(panel.mesh);

// ---------- the First Ten, grown in workers ----------

const FOUNDERS = founders();
const hands = [];
const workers = [0, 1, 2].map(() => new Worker(new URL('./hand/worker.js', import.meta.url), { type: 'module' }));
for (const w of workers) {
  w.onmessage = ({ data }) => {
    const f = FOUNDERS[data.id];
    scene.add(createHandMesh(data, f.pose, world.shared));
    hands.push({ ...f, data });
  };
  w.onerror = (e) => console.error('hand worker failed', e);
}
FOUNDERS.forEach((f, id) => workers[id % workers.length].postMessage({ id, palm: f.palm, prints: f.prints, cell: 0.75 }));

// height of the world at (x, z): the highest hand there, or the sea
function groundAt(x, z) {
  let top = 0;
  for (const { pose, data: d } of hands) {
    const [X, Y] = toHand(pose, x, z);
    const c = (X - d.x0) / d.cell - 0.5, r = (Y - d.y0) / d.cell - 0.5;
    if (c < 0 || r < 0 || c >= d.w - 1 || r >= d.h - 1) continue;
    const c0 = Math.floor(c), r0 = Math.floor(r), fx = c - c0, fy = r - r0, H = d.height, i = r0 * d.w + c0;
    top = Math.max(top, (H[i] * (1 - fx) + H[i + 1] * fx) * (1 - fy) + (H[i + d.w] * (1 - fx) + H[i + d.w + 1] * fx) * fy);
  }
  return top;
}

// ---------- scribbles: founders' knots over their palms, and your own five following you ----------

const LINE = { points: 90, spacing: 0.55 };
const TAPER = (s) => 0.12 + 0.88 * Math.pow(Math.sin(Math.PI * s), 0.6);
const knots = FOUNDERS.flatMap((f) => f.prints.map(unpackPrint).map((p, j) => {
  const [cx, cz] = toWorld(f.pose, 0, 230);
  const knot = createKnot({ cls: p.cls, seed: p.seed, center: [cx, 70 + j * 7, cz], radius: 15 + j * 2, tilt: 0.35 + j * 0.18 });
  return { knot, line: createScribble({ ...LINE, at: knot.step(0, 0), seed: p.seed }) };
}));
const glide = createGlide({ pos: [0, 260, 1500] });
const mine = [0, 1, 2, 3, 4].map((j) => createScribble({ ...LINE, at: [(j - 2) * 8, 240, 1460], seed: 900 + j }));
const ink = createInk((knots.length + mine.length) * (LINE.points + 1), { width: 0.24, color: '#16100e' });
scene.add(ink.mesh);

// ---------- hands and head (read live for steering, never kept) ----------

const handFactory = new XRHandModelFactory();
const xrHands = [0, 1].map((i) => {
  const hand = renderer.xr.getHand(i);
  hand.add(handFactory.createHandModel(hand, 'mesh'));
  rig.add(hand);
  const h = { hand, handedness: i ? 'right' : 'left', frame: null, palmDown: createPalmDown(), ref: null, store: Object.fromEntries(JOINTS.map((n) => [n, [0, 0, 0]])) };
  hand.addEventListener('connected', (e) => { h.handedness = e.data.handedness || h.handedness; });
  return h;
});
function readHands(dt) {
  for (const h of xrHands) {
    const j = h.hand.joints;
    const ok = renderer.xr.isPresenting && j && j.wrist && j.wrist.visible && JOINTS.every((n) => j[n]);
    if (ok) for (const n of JOINTS) j[n].position.toArray(h.store[n]);
    h.frame = ok ? palmFrame(h.store, h.handedness) : null;
    if (!h.palmDown.update(h.frame, -Infinity, dt)) h.ref = null;
    else if (!h.ref && h.frame) h.ref = JSON.parse(JSON.stringify(h.frame)); // the pose you started steering in
  }
}
const headQuat = new THREE.Quaternion(), headLocal = new THREE.Vector3();
let headNeutral = null;
function readHead() {
  const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  headLocal.copy(cam.position);
  headQuat.copy(cam.quaternion);
}

// ---------- steering ----------

const keys = new Set();
addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
const look = { yaw: 0, pitch: -0.32, drag: false };
renderer.domElement.addEventListener('pointerdown', () => (look.drag = true));
addEventListener('pointerup', () => (look.drag = false));
addEventListener('pointermove', (e) => {
  if (!look.drag) return;
  look.yaw -= e.movementX * 0.003;
  look.pitch = Math.max(-1.3, Math.min(0.6, look.pitch - e.movementY * 0.003));
});
const clamp1 = (v) => Math.max(-1, Math.min(1, v));
let started = false;
function steering() {
  if (AUTO || !started) return { turn: 0.12, climb: 0 }; // the title screen is the world, drifting
  if (renderer.xr.isPresenting) {
    const h = xrHands.find((q) => q.ref && q.frame);
    if (h) {
      const { roll, pitch } = palmTilt(h.frame, h.ref);
      return { turn: clamp1(roll / 0.45), climb: clamp1(pitch / 0.45) };
    }
    headNeutral ||= headQuat.toArray();
    return { turn: 0.6 * headSteer(headNeutral, headQuat.toArray()), climb: 0 };
  }
  const k = (a, b) => (keys.has(a) || keys.has(b) ? 1 : 0);
  return { turn: k('d', 'arrowright') - k('a', 'arrowleft'), climb: k('w', 'arrowup') - k('s', 'arrowdown') };
}

// ---------- the loop ----------

const clock = new THREE.Clock();
let t = 0, fps = 60;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  readHead();
  readHands(dt);
  const steer = steering();
  glide.update(dt, steer, groundAt);
  rig.position.fromArray(glide.pos);
  rig.rotation.y = glide.yaw;
  if (!renderer.xr.isPresenting) camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
  setWind(started ? 0.25 + 0.35 * Math.abs(steer.turn) : 0);

  ink.begin();
  for (const k of knots) {
    const target = k.knot.step(dt, 10), p = k.line.pos;
    const d = Math.hypot(target[0] - p[0], target[1] - p[1], target[2] - p[2]);
    k.line.step(dt, target, { speed: 10 * Math.min(2.2, Math.max(0.9, 0.9 + d / 12)), turn: 4, loops: 0.03 });
    const l = k.line.polyline();
    ink.stroke(l.xyz, l.count, TAPER);
  }
  const f = glide.forward();
  mine.forEach((s, j) => {
    const side = (j - 2) * 9, lift = -14 + 4 * Math.sin(t * 0.7 + j);
    const target = [glide.pos[0] + f[0] * 55 - f[2] * side, glide.pos[1] + lift, glide.pos[2] + f[2] * 55 + f[0] * side];
    const d = Math.hypot(target[0] - s.pos[0], target[1] - s.pos[1], target[2] - s.pos[2]);
    s.step(dt, target, { speed: glide.speed * Math.min(1.9, Math.max(0.85, 0.85 + d / 40)), turn: 2.2, loops: 0.12 });
    const l = s.polyline();
    ink.stroke(l.xyz, l.count, TAPER);
  });
  ink.end();

  world.shared.uTime.value = t;
  panel.update(dt, headLocal, headQuat);
  renderer.render(scene, camera);
}

// ---------- start / stop ----------

const banner = document.getElementById('banner');
function start() {
  started = true;
  startAudio();
  banner.classList.add('hidden');
  panel.say('Palm Whorl Cities', 4);
  setTimeout(() => panel.say(renderer.xr.isPresenting ? 'Palm down, tilt it to steer' : 'A D turn · W S climb · drag to look', 6), 4200);
}
async function enterHeadset() {
  startAudio();
  const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['hand-tracking'] });
  await renderer.xr.setSession(session);
  headNeutral = null;
  start();
  session.addEventListener('visibilitychange', () => pauseAudio(session.visibilityState === 'hidden'));
  session.addEventListener('end', () => {
    started = false;
    banner.classList.remove('hidden');
  });
}
document.addEventListener('visibilitychange', () => pauseAudio(document.hidden));
const xrButton = document.getElementById('xrButton');
xrButton.addEventListener('click', () => enterHeadset().catch((e) => console.error(e)));
document.getElementById('previewButton').addEventListener('click', start);
navigator.xr?.isSessionSupported('immersive-vr').then((ok) => ok && xrButton.classList.remove('hidden')).catch(() => {});
addEventListener('resize', () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
if (params.has('play')) start();
renderer.setAnimationLoop(frame);

// read-only peek for tests and curious players
window.__pwc = {
  get state() {
    return { hands: hands.length, pos: glide.pos.map(Math.round), yaw: +glide.yaw.toFixed(2), fps: Math.round(fps), scribbles: knots.length + mine.length, started };
  },
};
```

In `index.html`, replace the banner's inner block (the `<p class="eyebrow">` through the `<p class="small">`) with:

```html
        <p class="eyebrow">Every hand is a piece of the map</p>
        <h1>Palm Whorl Cities</h1>
        <p>
          Ten founding hands lie in a ring around the Source. Their lines are rivers, their fingertips
          are print lands, and black-ink scribbles hatched from the prints knot above them. Glide over
          the first piece of a world that grows with every hand.
        </p>
        <button id="xrButton" class="hidden">Enter in headset</button>
        <button id="previewButton" class="quiet">Preview in the browser</button>
        <p class="small">Hands only, no controller needed. Nothing about your hand is stored.</p>
```

and the `<meta name="description">` content with `Every hand is a piece of the world map: its lines are rivers, its fingertips print lands. Glide over the First Ten.`

- [ ] **Step 5: Check it in a browser**

Run all unit tests: `node --test tests/*.test.mjs`
Expected: all pass.

Start the server: `python3 -m http.server 8123` (in the background, from the repo root).

Write `<scratchpad>/m1/shot.mjs` (not committed):

```js
import { createRequire } from 'node:module';
const require = createRequire('/Users/timdries/Desktop/Projects/TD-GAME-LINKSAWAKENING/tests/');
const puppeteer = require('puppeteer-core');
const [url, out, click] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'], protocolTimeout: 180000,
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url, { waitUntil: 'networkidle0', timeout: 120000 });
if (click) await page.click(click);
await page.waitForFunction(() => window.__pwc?.state.hands === 10, { timeout: 180000 });
await new Promise((r) => setTimeout(r, 4000));
console.log(JSON.stringify(await page.evaluate(() => window.__pwc.state)));
await page.screenshot({ path: out });
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
```

Run: `node <scratchpad>/m1/shot.mjs "http://localhost:8123/?auto" <scratchpad>/m1/desktop.png "#previewButton"`
Expected: a state line with `"hands":10`, then `no errors`. Read the PNG and check:
- ten hands in a ring around a blue lake, skin-coloured, with dark-inked coasts;
- blue rivers along the palm lines and canals across every finger;
- fingertips visibly ridged (prints), palms finely ridged;
- black tapered scribble lines over the palms and five near the camera.

Fix what the picture shows (one pass). Then check the ridges up close: temporarily change the start to `createGlide({ pos: [0, 90, 700] })`, take one more screenshot, and restore `[0, 260, 1500]`.

Run the emulator: `node <scratchpad>/m1/shot.mjs "http://localhost:8123/?emulate&nodevui&auto" <scratchpad>/m1/emulator.png "#xrButton"`
Expected: `"hands":10`, `no errors`, and a stereo view of the same world.

Check the frame rate on the GPU (real Chrome, not swiftshader): open `http://localhost:8123/?auto` in Chrome, wait 10 s, and run `__pwc.state.fps` in the console.
Expected: 58 or more. If lower, halve the hand grid (`Math.round(d.w / 4)` segments) and say so in the commit.

- [ ] **Step 6: Commit**

```bash
git add src/ink.js src/world/scene.js src/world/handmesh.js src/main.js index.html
git commit -m "feat: the First Ten world: hands with rivers and macro skin, scribbles, gliding

Replaces the table game. The table-era modules stay in the repo, unused.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After M1

- Push only when Tim says so.
- Update `docs/devpost.md` and `README.md` for the new direction after the atelier milestone, not now.
- Next plan: M2, the atelier (read by eye) and the merge.
