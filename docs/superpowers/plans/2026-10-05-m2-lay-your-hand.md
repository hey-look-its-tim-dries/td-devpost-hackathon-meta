# M2: Lay Your Hand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new player reads their own hand by eye in the atelier: a pattern for each fingertip, the main palm lines traced on a drawing of a palm, a palette and a name. The game then proposes three places on the world's frontier. The player lays their Hand in one, it rises out of the land, it is saved on the device, and it is there again next time.

**Architecture:**
- **Pure modules, all tested:**
  - `names.js`: place names from a seed.
  - `mine.js`: your Hand on this device.
  - `strokes.js`: a traced stroke becomes 8 palm-unit points.
  - `flow.js`: the read-by-eye steps, ending in Palm DNA and Print DNA.
  - `fit.js`: the fit finder, scored poses along the frontier.
- **Three.js modules, checked in the browser:**
  - `glyphs.js`: the inked print icons.
  - `panel.js`: the atelier card, with poke, pinch and mouse.
  - `ghosts.js`: the three proposed outlines with their badges.
- **Rising Hands:** the surface and the CPU ground get a rise factor for each Hand, so a laid Hand grows out of the land.
- **The room:** in a headset that supports it, the atelier happens in passthrough.

**Tech Stack:** three.js 0.186.1 (importmap), WebXR (immersive-ar when available, hand-tracking), localStorage, node:test.

**Spec:** `docs/superpowers/specs/2026-10-04-handbit-atlas-design.md`. Sections: 6.2 (fit finder), 6.3 (committing), 7.4 (read by eye), 8 ("Wash your hands"), 11.3 (screens 2, 5, 6, 7).

## Global Constraints

- No build step, no npm dependencies. Workers never import `three`.
- Only three things are kept, in `localStorage` under `pwc.hand.v1`:
  - the DNA: Print DNA (44 bytes × 5) and Palm DNA (28 + 13 bytes per line);
  - the pose;
  - the name.

  No hand-tracking data and no images are kept or sent.
- Route C (read by eye) only. The phone and headset-camera routes come in later milestones. Everything works without a camera.
- Every atelier action works by poke (fingertip), by pinch with gaze, and by mouse.
- `WORLD = 10`: hand metres × 10 = world metres.
- Fit rules from spec 6.2, scaled to the 10× world:

  | Rule | Value |
  |---|---|
  | Rivers joined | +40 each (mouths within 400 m, within 35° of head-on) |
  | Snug | up to +30 (share of the new coast within 300 m of land) |
  | Compactness | −8 per span from the Source |
  | Fairness | −5 for each neighbour beyond four |
  | Overlap | at most one sample on land; the Source stays open water |
- Player-facing copy and docs contain no em dashes. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `node --test tests/*.test.mjs` stays green.

## Decisions Made While Planning

**Badges** say "next to Ombre and Brisk" and "2 rivers join". They don't show "fits 91%". I prototyped the fit finder against the First Ten, and the best snug share is 12 to 13%: the First Ten have spread fingers, so no Hand can follow their coast for long. As a number on a badge, that reads like a bad fit.

**No river joins for the first new Hand.** The First Ten close their ring, so every founder river opens into the Source or into a strait about 800 m wide between neighbours. No 6 km Hand fits in either, so the prototype found 0 joins in 6,539 candidate poses. The second new Hand (M3: other players) can join the first one's rivers. That is open point 1 for Tim's review.

## Review Focus

1. **A traced line that runs outside the palm, or a tap.** The DNA stays inside its ranges, and a tap never counts as a line. Pinned in Task 2.
2. **A saved Hand that was tampered with or comes from an older version.** The game opens without it and never crashes. A browser that refuses storage still lays the Hand. Pinned in Task 1 and Task 6.
3. **A fit that overlaps a founder or lies in the Source.** It is never offered. Pinned in Task 3.
4. **A Hand still rising when you fly into it.** You never end up inside the land: the glider's floor follows `groundAt`, which follows the rise. Pinned in Task 4.
5. **Entering the headset in a browser without immersive-ar.** The atelier still works, over the dimmed world. Checked in Task 7.

---

### Task 1: Names and your Hand on this device

**Files:**
- Create: `src/world/names.js`, `src/world/mine.js`
- Test: `tests/mine.test.mjs`

**Interfaces:**
- Produces:
  - `nameFor(seed): string`
  - `saveHand(storage, { palm: Uint8Array, prints: Uint8Array[5], pose, name })`
  - `loadHand(storage)` returns `{ palm, prints, pose: { x, z, rot, mirror }, name }`, or `null`
  - `forgetHand(storage)`

- [ ] **Step 1: Write the failing test**

```js
// tests/mine.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameFor } from '../src/world/names.js';
import { saveHand, loadHand, forgetHand } from '../src/world/mine.js';
import { packPalm, packPrint, synthPrint } from '../src/hand/dna.js';
import { templatePalm } from '../src/hand/shape.js';

const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const hand = () => ({
  palm: packPalm(templatePalm({ seed: 3 })),
  prints: [0, 1, 2, 3, 4].map((f) => packPrint(synthPrint(f, 'ulnar', 10 + f))),
  pose: { x: 1234.5, z: -6789, rot: 0.7, mirror: false },
  name: 'Saelo',
});

test('names read like a map: one capitalised word, the same for the same seed, nearly always different', () => {
  const names = Array.from({ length: 1000 }, (_, i) => nameFor(i + 1));
  for (const n of names) assert.match(n, /^[A-Z][a-z]{2,15}$/);
  assert.equal(nameFor(42), nameFor(42));
  assert.ok(new Set(names).size >= 950);
});

test('your Hand survives a reload: DNA, pose and name, nothing else', () => {
  const s = memory(), h = hand();
  saveHand(s, h);
  const back = loadHand(s);
  assert.deepEqual([...back.palm], [...h.palm]);
  back.prints.forEach((p, i) => assert.deepEqual([...p], [...h.prints[i]]));
  assert.deepEqual(back.pose, h.pose);
  assert.equal(back.name, 'Saelo');
  assert.deepEqual(Object.keys(JSON.parse(s.getItem('pwc.hand.v1'))).sort(), ['at', 'name', 'palm', 'pose', 'prints']);
});

test('a missing, broken or tampered save opens the world without it (Review Focus 2)', () => {
  const s = memory();
  assert.equal(loadHand(s), null);
  s.setItem('pwc.hand.v1', '{nope');
  assert.equal(loadHand(s), null);
  saveHand(s, hand());
  const v = JSON.parse(s.getItem('pwc.hand.v1'));
  for (const bad of [{ palm: 'AAAA' }, { palm: '!!' }, { prints: v.prints.slice(0, 3) }, { pose: { x: 'far', z: 0, rot: 0 } }, { pose: null }]) {
    s.setItem('pwc.hand.v1', JSON.stringify({ ...v, ...bad }));
    assert.equal(loadHand(s), null, JSON.stringify(bad));
  }
});

test('forgetting your Hand deletes it', () => {
  const s = memory();
  saveHand(s, hand());
  forgetHand(s);
  assert.equal(loadHand(s), null);
  assert.equal(s.m.size, 0);
});
```

- [ ] **Step 2: Run** `node --test tests/mine.test.mjs`. Expected: FAIL (`Cannot find module .../names.js`).
- [ ] **Step 3: Implement**

```js
// src/world/names.js
// Names for Hands and places, grown from a seed: two or three soft syllables that read like a map
// (Yanida, Cadio, Oru). Pure.
import { rng } from '../hand/dna.js';

const ONSET = ['', 'b', 'c', 'd', 'f', 'm', 'n', 'l', 'r', 's', 't', 'v', 'y', 'qu', 'br', 'tr'];
const VOWEL = ['a', 'e', 'i', 'o', 'u', 'a', 'e', 'io', 'ai'];
const CODA = ['', '', 'n', 'r', 'l', 's', 'th', 'd'];

export function nameFor(seed) {
  const rand = rng(seed), pick = (l) => l[Math.floor(rand() * l.length)];
  let s = '';
  for (let k = 0, n = 2 + Math.floor(rand() * 2); k < n; k++) s += pick(k ? ONSET.slice(1) : ONSET) + pick(VOWEL); // only the first syllable may open on a vowel
  s += pick(CODA);
  return s[0].toUpperCase() + s.slice(1);
}
```

```js
// src/world/mine.js
// Your own Hand, kept on this device: its DNA, where it lies, and its name. Nothing else: no images,
// no tracking data. `storage` is localStorage in the page, a stand-in in tests. Pure.
import { unpackPalm, unpackPrint, toB64, fromB64, palmBytes } from '../hand/dna.js';

const KEY = 'pwc.hand.v1';

export function saveHand(storage, { palm, prints, pose, name }) {
  storage.setItem(KEY, JSON.stringify({ palm: toB64(palm), prints: prints.map(toB64), pose: { x: pose.x, z: pose.z, rot: pose.rot, mirror: !!pose.mirror }, name, at: Date.now() }));
}

export function loadHand(storage) {
  try {
    const v = JSON.parse(storage.getItem(KEY));
    if (!v || !Array.isArray(v.prints) || v.prints.length !== 5 || ![v.pose?.x, v.pose?.z, v.pose?.rot].every(Number.isFinite)) return null;
    const palm = fromB64(v.palm), prints = v.prints.map(fromB64);
    if (palm.length < 28 || palm.length !== palmBytes(unpackPalm(palm).lines.length) || prints.some((p) => p.length !== 44)) return null;
    prints.forEach(unpackPrint); // each throws on a version it does not know
    return { palm, prints, pose: { x: v.pose.x, z: v.pose.z, rot: v.pose.rot, mirror: !!v.pose.mirror }, name: String(v.name ?? '').slice(0, 40) };
  } catch {
    return null;
  }
}

export const forgetHand = (storage) => storage.removeItem(KEY);
```

- [ ] **Step 4: Run** `node --test tests/mine.test.mjs`. Expected: PASS (4).
- [ ] **Step 5: Commit** `feat: Hand names, and your Hand kept on this device`.

---

### Task 2: Tracing lines and the read-by-eye steps

**Files:**
- Create: `src/atelier/strokes.js`, `src/atelier/flow.js`
- Test: `tests/atelier.test.mjs`

**Interfaces:**
- Consumes:
  - from `shape.js`: `PALM_UNIT`, `templatePalm`;
  - from `dna.js`: `synthPrint`, `rng`, `packPalm`, `packPrint`;
  - from Task 1: `nameFor`.
- Produces:
  - **Strokes:**
    - `palmView(x, y, w, h)` returns `{ k, ox, oy }`, where the template hand fits the area.
    - `toPixel(view, [X, Y])`, `toMetres(view, [px, py])`: hand metres to pixels, and back.
    - `strokeToLine(view, pixels)` returns `[x, y][8]` in palm units, or `null` for a tap.
    - `lineToPixels(view, pts)`.
  - **Constants:**
    - `PICKS = ['arch', 'tented', 'ulnar', 'whorl', 'pocket', 'double']`
    - `FINGER_NAMES`
    - `LINE_STEPS = [['heart', true], ['head', true], ['life', true], ['fate', false]]`, as `[line, everyone has one]`
  - **`createFlow(seed)`:**
    - Fields: `step` (`prints` → `lines` → `palette` → `merge`), `finger`, `line`, `prints` (the classes), `lines`, `palette`, `name`.
    - Methods: `pick(cls)`, `notSure()`, `traced(pts) → boolean`, `useGuide()`, `noLine()`, `typicalLines()`, `guide() → pts | null`, `choosePalette(i)`, `reroll()`, `done()`.
    - `dna()` returns `{ palm: Uint8Array, prints: Uint8Array[5] }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/atelier.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { palmView, toPixel, strokeToLine, lineToPixels } from '../src/atelier/strokes.js';
import { createFlow } from '../src/atelier/flow.js';
import { OUTLINE, FINGERS } from '../src/hand/shape.js';
import { unpackPalm, unpackPrint } from '../src/hand/dna.js';

test('the drawing of a palm fits its area', () => {
  const v = palmView(100, 50, 700, 760);
  const pts = [...OUTLINE, ...FINGERS.map((f) => [f.base[0] + f.dir[0] * f.len, f.base[1] + f.dir[1] * f.len])].map((p) => toPixel(v, p));
  for (const [x, y] of pts) assert.ok(x >= 100 && x <= 800 && y >= 50 && y <= 810, `${x}, ${y}`);
});

test('a traced line becomes 8 evenly spaced points in palm units', () => {
  const v = palmView(0, 0, 700, 760);
  const drag = Array.from({ length: 40 }, (_, i) => toPixel(v, [-150 + i * 7.5, 300 - i * 2]));
  const pts = strokeToLine(v, drag);
  assert.equal(pts.length, 8);
  const d = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  for (const s of d) assert.ok(Math.abs(s - d[0]) < 1e-6);
  const back = lineToPixels(v, pts);
  assert.ok(Math.hypot(back[0][0] - drag[0][0], back[0][1] - drag[0][1]) < 1);
});

test('a tap is not a line, and a stroke off the palm stays inside the DNA ranges (Review Focus 1)', () => {
  const v = palmView(0, 0, 700, 760);
  assert.equal(strokeToLine(v, [toPixel(v, [10, 200]), toPixel(v, [12, 203])]), null);
  assert.equal(strokeToLine(v, []), null);
  const wild = strokeToLine(v, [toPixel(v, [-2000, -900]), toPixel(v, [3000, 2000])]);
  for (const [x, y] of wild) assert.ok(x >= -1 && x <= 1 && y >= -0.25 && y <= 1.75);
});

test('read by eye: five patterns, the lines, a palette and a name make a Hand', () => {
  const f = createFlow(7);
  assert.equal(f.step, 'prints');
  ['whorl', 'ulnar', 'ulnar', 'double', 'arch'].forEach((c) => f.pick(c));
  assert.equal(f.step, 'lines');
  assert.equal(f.traced(null), false); // a tap: still on the heart line
  assert.equal(f.line, 0);
  assert.ok(f.traced(f.guide()));
  f.useGuide(); // head
  f.useGuide(); // life
  f.noLine(); // no fate line
  assert.equal(f.step, 'palette');
  f.choosePalette(4);
  const before = f.name;
  f.reroll();
  assert.notEqual(f.name, before);
  f.done();
  assert.equal(f.step, 'merge');
  const { palm, prints } = f.dna();
  const p = unpackPalm(palm);
  assert.deepEqual(p.lines.map((l) => l.kind), ['heart', 'head', 'life']);
  assert.equal(p.palette, 4);
  assert.deepEqual(prints.map((b) => unpackPrint(b).cls), ['whorl', 'ulnar', 'ulnar', 'double', 'arch']);
  assert.deepEqual(prints.map((b) => unpackPrint(b).finger), [0, 1, 2, 3, 4]);
});

test('"not sure" picks each finger\'s most common pattern, everyone has a heart line, a typical palm in one step', () => {
  const f = createFlow(8);
  for (let i = 0; i < 5; i++) f.notSure();
  assert.deepEqual(f.prints, ['whorl', 'ulnar', 'ulnar', 'whorl', 'ulnar']);
  f.noLine();
  assert.equal(f.line, 0, 'the heart line cannot be skipped');
  f.typicalLines();
  assert.equal(f.step, 'palette');
  assert.deepEqual(f.lines.map((l) => l.kind), ['heart', 'head', 'life', 'fate']);
});
```

- [ ] **Step 2: Run** `node --test tests/atelier.test.mjs`. Expected: FAIL (`Cannot find module`).
- [ ] **Step 3: Implement**

```js
// src/atelier/strokes.js
// A line traced on the drawing of a palm, in the form the Palm DNA keeps: 8 points along it in palm
// units (the index to little-finger knuckle distance is 1), clamped to the DNA's ranges. Pure.
import { PALM_UNIT } from '../hand/shape.js';

const MIN_LENGTH = 60; // hand metres: shorter is a tap, not a line
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// how the template hand sits in a drawing area (it spans about -180..290 m across, 0..610 m up)
export function palmView(x, y, w, h) {
  const k = Math.min(w / 470, h / 640);
  return { k, ox: x + w / 2 - 55 * k, oy: y + h / 2 + 305 * k };
}
export const toPixel = (v, [X, Y]) => [v.ox + X * v.k, v.oy - Y * v.k];
export const toMetres = (v, [px, py]) => [(px - v.ox) / v.k, (v.oy - py) / v.k];

function resample(p, n) {
  const cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  const out = [];
  for (let k = 0, j = 1; k < n; k++) {
    const s = (cum[cum.length - 1] * k) / (n - 1);
    while (j < p.length - 1 && cum[j] < s) j++;
    const t = (s - cum[j - 1]) / Math.max(1e-9, cum[j] - cum[j - 1]);
    out.push([p[j - 1][0] + (p[j][0] - p[j - 1][0]) * t, p[j - 1][1] + (p[j][1] - p[j - 1][1]) * t]);
  }
  return out;
}

export function strokeToLine(view, pixels) {
  if (!pixels || pixels.length < 2) return null;
  const m = pixels.map((p) => toMetres(view, p));
  let len = 0;
  for (let i = 1; i < m.length; i++) len += Math.hypot(m[i][0] - m[i - 1][0], m[i][1] - m[i - 1][1]);
  if (len < MIN_LENGTH) return null;
  return resample(m, 8).map(([X, Y]) => [clamp(X / PALM_UNIT, -1, 1), clamp(Y / PALM_UNIT, -0.25, 1.75)]);
}

export const lineToPixels = (view, pts) => pts.map(([x, y]) => toPixel(view, [x * PALM_UNIT, y * PALM_UNIT]));
```

```js
// src/atelier/flow.js
// The read-by-eye route (spec 7.4), one step at a time: the pattern on each fingertip, then the main
// palm lines (traced, or the guide's), then a palette and a name. It ends with the Hand's DNA. Pure.
import { synthPrint, rng, packPalm, packPrint } from '../hand/dna.js';
import { templatePalm } from '../hand/shape.js';
import { nameFor } from '../world/names.js';

export const PICKS = ['arch', 'tented', 'ulnar', 'whorl', 'pocket', 'double']; // the six inked patterns
export const FINGER_NAMES = ['thumb', 'index finger', 'middle finger', 'ring finger', 'little finger'];
export const LINE_STEPS = [['heart', true], ['head', true], ['life', true], ['fate', false]]; // [line, everyone has one]
const LIKELY = ['whorl', 'ulnar', 'ulnar', 'whorl', 'ulnar']; // "not sure": each finger's most common pattern

export function createFlow(seed) {
  const rand = rng(seed), guide = templatePalm({ seed, fate: true }), printSeeds = [];
  const f = { step: 'prints', finger: 0, line: 0, prints: [], lines: [], palette: 2, name: nameFor(seed) };
  const next = () => { if (++f.line >= LINE_STEPS.length) f.step = 'palette'; };
  const guideOf = (kind) => guide.lines.find((l) => l.kind === kind);
  return Object.assign(f, {
    pick(cls) {
      if (f.step !== 'prints' || !PICKS.includes(cls)) return;
      f.prints.push(cls);
      printSeeds.push(Math.floor(rand() * 2 ** 32));
      if (++f.finger === 5) f.step = 'lines';
    },
    notSure() { f.pick(LIKELY[f.finger]); },
    guide() { return f.step === 'lines' ? guideOf(LINE_STEPS[f.line][0]).pts : null; },
    traced(pts) {
      if (f.step !== 'lines' || !pts) return false;
      f.lines.push({ kind: LINE_STEPS[f.line][0], strength: 2, pts });
      next();
      return true;
    },
    useGuide() {
      if (f.step !== 'lines') return;
      const g = guideOf(LINE_STEPS[f.line][0]);
      f.lines.push({ kind: g.kind, strength: g.strength, pts: g.pts.map((p) => p.slice()) });
      next();
    },
    noLine() { if (f.step === 'lines' && !LINE_STEPS[f.line][1]) next(); },
    typicalLines() { while (f.step === 'lines') f.useGuide(); },
    choosePalette(i) { if (f.step === 'palette' && i >= 0 && i < 6) f.palette = i; },
    reroll() { f.name = nameFor(Math.floor(rand() * 2 ** 32)); },
    done() { if (f.step === 'palette') f.step = 'merge'; },
    dna() {
      return {
        palm: packPalm({ ...guide, lines: f.lines, palette: f.palette }), // the guide's creases and triradii: route C can't read them
        prints: f.prints.map((cls, i) => packPrint(synthPrint(i, cls, printSeeds[i]))),
      };
    },
  });
}
```

- [ ] **Step 4: Run** `node --test tests/atelier.test.mjs`. Expected: PASS (5).
- [ ] **Step 5: Commit** `feat: the read-by-eye steps: patterns, traced lines, palette and name make your Hand`.

---

### Task 3: The fit finder

The code below was prototyped against the First Ten while writing this plan. It runs in 240 ms in node and passes these tests.

**Files:**
- Create: `src/world/fit.js`
- Test: `tests/fit.test.mjs`

**Interfaces:**
- Consumes:
  - from `shape.js`: `insideHand`, `inPolygon`, `OUTLINE`, `FINGERS`;
  - from `founders.js`: `toWorld`, `toHand`, `SOURCE_RADIUS`;
  - `WORLD`.
- Produces:
  - `handSamples(shape)` returns `{ coast: [X, Y][], inner: [X, Y][] }`, in hand metres.
  - `riverMouths(shape)` returns `{ at: [X, Y], dir: [dx, dy] }[]`, in hand metres.
  - `scorePose({ rivers, snug, distance, crowd })` returns a number.
  - `findFits(world, shape, opts)`:
    - `world` is `{ pose, shape }[]`.
    - It returns up to 3 fits, best first, at least 3 km apart.
    - Each fit is `{ pose, score, rivers, snug, centre: [x, z], next }`. `next` lists the indices into `world` that the fit touches; -1 means the Source.

- [ ] **Step 1: Write the failing test**

```js
// tests/fit.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findFits, scorePose, handSamples, riverMouths } from '../src/world/fit.js';
import { founders, toWorld, toHand, SOURCE_RADIUS } from '../src/world/founders.js';
import { handShape, templatePalm, insideHand } from '../src/hand/shape.js';
import { unpackPalm } from '../src/hand/dna.js';

const world = founders().map((f) => ({ pose: f.pose, shape: handShape(unpackPalm(f.palm)) }));
const mine = handShape(templatePalm({ seed: 77 }));
let fits, took;

test('three fits for a new Hand, best first, far enough apart to be real choices', () => {
  const t = performance.now();
  fits = findFits(world, mine);
  took = performance.now() - t;
  assert.equal(fits.length, 3);
  for (let i = 1; i < 3; i++) assert.ok(fits[i - 1].score >= fits[i].score);
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.ok(Math.hypot(fits[i].centre[0] - fits[j].centre[0], fits[i].centre[1] - fits[j].centre[1]) >= 3000);
});

test('no fit lies on the world or in the Source (Review Focus 3), and each one is next to someone', () => {
  const { coast, inner } = handSamples(mine);
  for (const fit of fits) {
    let inside = 0;
    for (const [X, Y] of [...coast, ...inner]) {
      const [x, z] = toWorld(fit.pose, X, Y);
      if (Math.hypot(x, z) < SOURCE_RADIUS || world.some((h) => { const [hx, hy] = toHand(h.pose, x, z); return insideHand(h.shape, hx, hy); })) inside++;
    }
    assert.ok(inside <= 1, `${inside} samples on land`);
    assert.ok(fit.snug > 0 && fit.next.length >= 1);
    for (const i of fit.next) assert.ok(i >= -1 && i < world.length);
  }
});

test('a joined river counts for more than a snug coast, and crowding costs', () => {
  assert.ok(scorePose({ rivers: 1, snug: 0, distance: 0, crowd: 0 }) > scorePose({ rivers: 0, snug: 1, distance: 0, crowd: 0 }));
  assert.ok(scorePose({ rivers: 0, snug: 0.5, distance: 0, crowd: 6 }) < scorePose({ rivers: 0, snug: 0.5, distance: 0, crowd: 3 }));
});

test('a Hand has rivers that reach its coast', () => {
  const m = riverMouths(mine);
  assert.ok(m.length >= 2);
  for (const { dir } of m) assert.ok(Math.abs(Math.hypot(dir[0], dir[1]) - 1) < 1e-9);
});

test('fast enough to run when you finish the atelier', () => {
  assert.ok(took < 2000, `${took} ms`);
});
```

- [ ] **Step 2: Run** `node --test tests/fit.test.mjs`. Expected: FAIL (`Cannot find module`).
- [ ] **Step 3: Implement**

```js
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
```

- [ ] **Step 4: Run** `node --test tests/fit.test.mjs`. Expected: PASS (5), about 0.25 s.
- [ ] **Step 5: Commit** `feat: the fit finder: three places on the frontier where your Hand fits`.

---

### Task 4: Hands that rise

**Files:**
- Modify: `src/world/ground.js`, `src/world/surface.js`, `tests/ground.test.mjs`

**Interfaces:**
- Produces:
  - Entries passed to `groundAt` may carry `rise`, from 0 to 1 (default 1).
  - `surface.addHand(i, data, pose, rise = 1)`.
  - `surface.setRise(i, rise)`.
- The rise multiplies the baked height before the "inside" test, on the GPU and the CPU alike. A rising Hand therefore emerges top-first out of the land, and its coast and river valleys come last.

- [ ] **Step 1: Write the failing test** (append to `tests/ground.test.mjs`)

```js
test('a rising Hand grows out of the land: not there at 0, half as tall halfway (Review Focus 4)', () => {
  const [px, pz] = highPlain();
  const data = { x0: 0, y0: 0, cell: 1, w: 4, h: 4, height: new Float32Array(16).fill(20) };
  const at = (rise) => groundAt([{ pose: { x: px, z: pz, rot: 0, mirror: false }, data, rise }], px + 15, pz - 15);
  assert.equal(at(0), Math.max(0, wildHeight(px + 15, pz - 15)));
  assert.ok(Math.abs(at(0.5) - 100) < 1e-6);
  assert.ok(Math.abs(at(1) - 200) < 1e-6);
  assert.ok(Math.abs(groundAt([{ pose: { x: px, z: pz, rot: 0, mirror: false }, data }], px + 15, pz - 15) - 200) < 1e-6, 'no rise: fully risen');
});
```

- [ ] **Step 2: Run** `node --test tests/ground.test.mjs`. Expected: FAIL (`at(0)` returns 200).
- [ ] **Step 3: Implement.**
  - **`src/world/ground.js`:**
    - The loop becomes `for (const { pose, data: d, rise = 1 } of hands)`.
    - The sample becomes `const v = rise * ((H[i] * (1 - fx) + H[i + 1] * fx) * (1 - fy) + (H[i + d.w] * (1 - fx) + H[i + d.w + 1] * fx) * fy);`.
  - **`src/world/surface.js`:**
    - Add `uniform float uHandRise[MAX_HANDS];` after `uniform float uHandMirror[MAX_HANDS];`.
    - In `handAt`, change `float hm = textureLod(uHandA, t, 0.0).r;` to `float hm = textureLod(uHandA, t, 0.0).r * uHandRise[i]; // a laid Hand rises out of the land`.
    - Add `uHandRise: { value: new Array(MAX_HANDS).fill(1) },` after the `uHandMirror` uniform.
    - Change the signature to `addHand(i, d, pose, rise = 1)`, and add `uniforms.uHandRise.value[i] = rise;` next to the mirror line.
    - Add the method `setRise(i, rise) { uniforms.uHandRise.value[i] = rise; },` after `addHand`.
- [ ] **Step 4: Run** `node --test tests/*.test.mjs`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: Hands can rise out of the land`.

---

### Task 5: The atelier card

**Files:**
- Create: `src/atelier/glyphs.js`, `src/atelier/panel.js`

**Interfaces:**
- Consumes:
  - from `phase.js`: `printPhase`;
  - from `dna.js`: `PATTERN_OF`;
  - from `shape.js`: `OUTLINE`, `FINGERS`;
  - from Task 2: `palmView`, `toPixel`, `strokeToLine`, `lineToPixels`, `PICKS`, `FINGER_NAMES`, `LINE_STEPS`;
  - from `scene.js`: `TONES`.
- Produces:
  - `glyph(cls, w, h, seed)` returns an `HTMLCanvasElement`.
  - `createAtelierPanel()` returns `{ mesh, isOpen, open(headLocal, headQuat), close(), paint(flow), down(uv, flow), move(uv, flow), up(flow) }`.
    - `down` and `up` return an action or `null`. `uv` is `{ x, y }` in 0..1, with y up.
  - The actions:
    - prints: `{ type: 'pick', cls }`, `{ type: 'notSure' }`;
    - lines: `{ type: 'traced', pts }` (`pts` is `null` when the stroke was too short), `{ type: 'guide' }`, `{ type: 'noLine' }`, `{ type: 'typical' }`;
    - palette and name: `{ type: 'palette', i }`, `{ type: 'reroll' }`, `{ type: 'lay' }`.

- [ ] **Step 1: The glyphs**

```js
// src/atelier/glyphs.js
// A print class as an inked doodle in the style of Tim's reference sheet: broken ridges inside a
// ragged oval, drawn from the same ridge functions that grow the print lands, so the icon always
// matches the land.
import { printPhase } from '../print/phase.js';
import { PATTERN_OF } from '../hand/dna.js';

const hash2 = (i, j) => { let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1); h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };
const noise = (x, y) => {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
};
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function glyph(cls, w, h, seed = 1) {
  const [pattern, mirror] = PATTERN_OF[cls];
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data, s = seed * 1.7;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const x = (px - w / 2) / (w * 0.41), y = (h / 2 - py) / (h * 0.45), r = Math.hypot(x, y);
    const edge = 0.9 + 0.09 * noise(Math.atan2(y, x) * 1.6 + s, s);
    if (r > edge) continue;
    const ph = printPhase(pattern, mirror ? -x : x, y, seed), f = ph - Math.floor(ph), dist = Math.min(f, 1 - f);
    const thick = 0.13 + 0.07 * noise(x * 2.5 + s, y * 2.5);
    let cov = 1 - sstep(thick - 0.05, thick + 0.05, dist);
    cov *= 1 - sstep(0.7, 0.78, noise(x * 4.2 + s * 3, y * 4.2 - s)); // the pen lifts now and then
    cov *= sstep(edge, edge - 0.08, r);
    const o = (py * w + px) * 4;
    d[o] = 27; d[o + 1] = 19; d[o + 2] = 16; d[o + 3] = cov * 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
```

- [ ] **Step 2: The card**

```js
// src/atelier/panel.js
import * as THREE from 'three';
import { glyph } from './glyphs.js';
import { palmView, toPixel, strokeToLine, lineToPixels } from './strokes.js';
import { PICKS, FINGER_NAMES, LINE_STEPS } from './flow.js';
import { OUTLINE, FINGERS } from '../hand/shape.js';
import { TONES } from '../world/scene.js';

// The atelier: one paper card in front of you that walks you through reading your hand by eye. Poke
// it with a fingertip, pinch while looking at it, or click it. On the lines page you trace on the
// drawing of a palm, with a fingertip pressed to the card or with the mouse. 0.6 x 0.45 m at 0.75 m:
// inside the 30 degree cone, and its smallest text (22 px of 900) is about 17 mm tall.
const W = 1200, H = 900, INK = '#16100e', PAPER = '#f6ead6', SEAL = '#a8402b', RIVER = '#2f5d7c', GILT = '#a88442';
const SERIF = 'Georgia, "Times New Roman", serif', SANS = 'Inter, "Segoe UI", system-ui, sans-serif';
const LABEL = { arch: 'arch', tented: 'tented arch', ulnar: 'loop', whorl: 'whorl', pocket: 'pocket loop', double: 'double loop' };
const HINT = {
  heart: 'From the little-finger edge towards your index finger.',
  head: 'From between thumb and index finger, across the palm.',
  life: 'Round the base of your thumb, down towards the wrist.',
  fate: 'Up the middle of the palm from the wrist. Many hands have none.',
};
const DRAW = { x: 40, y: 150, w: 640, h: 710 }; // where the palm is drawn on the lines page

export function createAtelierPanel() {
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.45),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }),
  );
  mesh.renderOrder = 25;
  mesh.visible = false;
  const glyphs = Object.fromEntries(PICKS.map((cls, i) => [cls, glyph(cls, 150, 186, i + 3)]));
  const view = palmView(DRAW.x, DRAW.y, DRAW.w, DRAW.h);
  const g = canvas.getContext('2d');
  let regions = [], stroke = null, warn = false;

  const button = (id, x, y, w, h, text, primary = false) => {
    g.fillStyle = primary ? SEAL : PAPER;
    g.strokeStyle = primary ? SEAL : INK;
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(x, y, w, h, h / 2);
    g.fill();
    g.stroke();
    g.fillStyle = primary ? '#f7eedf' : INK;
    g.font = `700 30px ${SANS}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, x + w / 2, y + h / 2 + 1, w - 20);
    regions.push({ id, x, y, w, h });
  };
  const header = (step, title, sub) => {
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillStyle = SEAL;
    g.font = `700 24px ${SANS}`;
    g.fillText(step.toUpperCase(), 40, 56);
    g.fillStyle = INK;
    g.font = `400 52px ${SERIF}`;
    g.fillText(title, 40, 110, W - 80);
    g.fillStyle = 'rgba(22,16,14,0.65)';
    g.font = `400 26px ${SANS}`;
    g.fillText(sub, 40, 142, W - 80);
  };
  const path = (pts, close) => {
    g.beginPath();
    pts.forEach((p, i) => { const [x, y] = toPixel(view, p); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    if (close) g.closePath();
  };
  const polyline = (pixels, colour, width, dash = []) => {
    g.setLineDash(dash);
    g.strokeStyle = colour;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.beginPath();
    pixels.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    g.setLineDash([]);
  };
  const fingerOutline = (f) => {
    const hw = f.width / 2, at = (u, t) => [f.base[0] + f.side[0] * u + f.dir[0] * t, f.base[1] + f.side[1] * u + f.dir[1] * t];
    const pts = [at(-hw, 0)];
    for (let a = 0; a <= 12; a++) { const ang = Math.PI - (a / 12) * Math.PI; pts.push(at(Math.cos(ang) * hw, f.len - hw + Math.sin(ang) * hw)); }
    pts.push(at(hw, 0));
    return pts;
  };
  const drawPalm = (flow) => {
    g.fillStyle = '#ecc9aa';
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.lineJoin = 'round';
    for (const f of FINGERS) { path(fingerOutline(f), false); g.fill(); g.stroke(); }
    path(OUTLINE, true);
    g.fill();
    g.stroke();
    for (const l of flow.lines) polyline(lineToPixels(view, l.pts), RIVER, 9);
    const guide = flow.guide();
    if (guide) polyline(lineToPixels(view, guide), GILT, 5, [12, 12]);
    if (stroke) polyline(stroke, RIVER, 9);
  };

  function paint(flow) {
    regions = [];
    g.clearRect(0, 0, W, H);
    g.fillStyle = PAPER;
    g.beginPath();
    g.roundRect(4, 4, W - 8, H - 8, 36);
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 4;
    g.stroke();
    if (flow.step === 'prints') {
      header('1 of 3 · your prints', `Which pattern is on your ${FINGER_NAMES[flow.finger]}?`, 'Look at the fingertip, then touch the pattern that matches.');
      FINGER_NAMES.forEach((n, k) => { // the five fingers as chips: done, now, to come
        const x = 40 + k * 120, done = k < flow.finger, now = k === flow.finger;
        g.fillStyle = done ? INK : PAPER;
        g.strokeStyle = now ? SEAL : INK;
        g.lineWidth = now ? 6 : 2;
        g.beginPath();
        g.roundRect(x, 180, 104, 48, 24);
        g.fill();
        g.stroke();
        g.fillStyle = done ? '#f7eedf' : INK;
        g.font = `700 22px ${SANS}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(n.split(' ')[0], x + 52, 205);
      });
      PICKS.forEach((cls, k) => {
        const x = 40 + (k % 3) * 300, y = 260 + Math.floor(k / 3) * 300;
        g.fillStyle = '#fbf3e6';
        g.strokeStyle = 'rgba(22,16,14,0.35)';
        g.lineWidth = 2;
        g.beginPath();
        g.roundRect(x, y, 270, 280, 20);
        g.fill();
        g.stroke();
        g.drawImage(glyphs[cls], x + 60, y + 20);
        g.fillStyle = INK;
        g.font = `600 28px ${SERIF}`;
        g.textAlign = 'center';
        g.textBaseline = 'alphabetic';
        g.fillText(LABEL[cls], x + 135, y + 250);
        regions.push({ id: `pick:${cls}`, x, y, w: 270, h: 280 });
      });
      button('notSure', 960, 520, 200, 70, 'Not sure');
    } else if (flow.step === 'lines') {
      const [kind, everyone] = LINE_STEPS[flow.line];
      header('2 of 3 · your lines', `Trace your ${kind} line`, HINT[kind]);
      drawPalm(flow);
      regions.push({ id: 'draw', ...DRAW });
      let y = 260;
      button('guide', 730, y, 430, 72, 'Use the dotted guide');
      y += 100;
      if (!everyone) { button('noLine', 730, y, 430, 72, "I don't have one"); y += 100; }
      button('typical', 730, y, 430, 72, 'Use a typical palm');
      if (warn) { g.fillStyle = SEAL; g.font = `600 26px ${SANS}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText('Trace along the whole line', 730, y + 130); }
    } else if (flow.step === 'palette') {
      header('3 of 3 · your Hand', flow.name, 'Choose its skin. Any palette: it does not have to match yours.');
      for (let i = 0; i < 6; i++) {
        const x = 40 + i * 185, y = 200, now = i === flow.palette;
        for (let t = 0; t < 3; t++) { g.fillStyle = TONES[i * 3 + t]; g.fillRect(x, y + t * 60, 165, 60); }
        g.strokeStyle = now ? SEAL : 'rgba(22,16,14,0.35)';
        g.lineWidth = now ? 8 : 2;
        g.strokeRect(x, y, 165, 180);
        regions.push({ id: `palette:${i}`, x, y, w: 165, h: 180 });
      }
      button('reroll', 40, 440, 300, 72, 'Another name');
      button('lay', 700, 720, 460, 110, 'Lay my Hand', true);
    }
    tex.needsUpdate = true;
  }

  const px = (uv) => [uv.x * W, (1 - uv.y) * H];
  const regionAt = ([x, y]) => regions.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)?.id ?? null;
  const action = (id) => {
    if (!id || id === 'draw') return null;
    const [type, arg] = id.split(':');
    if (type === 'pick') return { type, cls: arg };
    if (type === 'palette') return { type, i: +arg };
    return { type };
  };

  return {
    mesh,
    get isOpen() { return mesh.visible; },
    // the card 0.75 m ahead of your eyes and a little low, turned to face you (head pose in the parent's space)
    open(headLocal, headQuat) {
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuat).setY(0).normalize();
      mesh.position.copy(headLocal).addScaledVector(f, 0.75);
      mesh.position.y -= 0.08;
      mesh.lookAt(mesh.parent.localToWorld(headLocal.clone()));
      mesh.visible = true;
    },
    close() { mesh.visible = false; stroke = null; },
    paint,
    down(uv, flow) {
      const p = px(uv), id = regionAt(p);
      if (id === 'draw' && flow.step === 'lines') { stroke = [p]; paint(flow); return null; }
      return action(id);
    },
    move(uv, flow) {
      if (!stroke) return;
      const p = px(uv), last = stroke[stroke.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 4) { stroke.push(p); paint(flow); }
    },
    up(flow) {
      if (!stroke) return null;
      const pts = strokeToLine(view, stroke);
      stroke = null;
      warn = !pts;
      paint(flow);
      return { type: 'traced', pts };
    },
  };
}
```

- [ ] **Step 3: Check the syntax.** The card is tested through the page in Task 6. Run `node --check src/atelier/panel.js && node --check src/atelier/glyphs.js`. Expected: no output.
- [ ] **Step 4: Commit** `feat: the atelier card: glyphs to pick, a palm to trace, a palette and a name`.

---

### Task 6: Ghosts, laying your Hand, and coming back

**Files:**
- Create: `src/world/ghosts.js`
- Modify: `src/main.js`, `index.html`
- Scratch (not committed): `<scratchpad>/m1/m2.mjs`

**Interfaces:**
- Consumes:
  - all the modules above;
  - from `shape.js`: `OUTLINE`, `FINGERS`, `handShape`;
  - from `founders.js`: `toWorld`;
  - from `ink.js`: `createInk`;
  - from `audio.js`: `tone`, `swell`.
- Produces:
  - `createGhosts(groundAt)` returns `{ group, fits, selected, show(fits), hide(), select(i), aim(origin, dir) → index | -1, update(cameraWorld) }`.
  - `window.__pwc.state` gains `mode` (`fly | atelier | merge | rise`) and `mine` (your Hand's name or `null`).
  - `window.__pwc.atelier` gives test hooks: `act(action)`, `flow`, `lay(i)`.

- [ ] **Step 1: The ghosts**

```js
// src/world/ghosts.js
import * as THREE from 'three';
import { createInk } from '../ink.js';
import { toWorld } from './founders.js';
import { OUTLINE, FINGERS } from '../hand/shape.js';

// The three proposed places for your Hand: its outline inked on the land, and a badge above each saying
// why it fits. The chosen one is red. Look or point at a badge to choose it, then choose it again to
// lay your Hand there (pinch, click, or 1 2 3 and Enter).
const RINGS = [OUTLINE, ...FINGERS.map((f) => {
  const hw = f.width / 2, at = (u, t) => [f.base[0] + f.side[0] * u + f.dir[0] * t, f.base[1] + f.side[1] * u + f.dir[1] * t];
  const ring = [at(-hw, 0)];
  for (let a = 0; a <= 16; a++) { const ang = Math.PI - (a / 16) * Math.PI; ring.push(at(Math.cos(ang) * hw, f.len - hw + Math.sin(ang) * hw)); }
  ring.push(at(hw, 0));
  return ring;
})];
const SEGMENTS = RINGS.reduce((n, r) => n + r.length, 0);
const AIM = Math.cos(0.2); // a badge within about 11 degrees of where you look or point

export function createGhosts(groundAt) {
  const group = new THREE.Group();
  const chosenInk = createInk(SEGMENTS, { width: 40, color: '#a8402b' }), otherInk = createInk(SEGMENTS * 2, { width: 25, color: '#16100e' });
  group.add(chosenInk.mesh, otherInk.mesh);
  const badges = [0, 1, 2].map(() => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 640, height: 240 });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1200, 450), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.renderOrder = 20;
    group.add(m);
    return { m, canvas, tex };
  });
  group.visible = false;
  let fits = [], selected = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), v = new THREE.Vector3();

  function paint(i) {
    const { canvas, tex } = badges[i], g = canvas.getContext('2d'), f = fits[i], on = i === selected;
    g.clearRect(0, 0, 640, 240);
    g.fillStyle = on ? '#a8402b' : 'rgba(22,16,14,0.88)';
    g.beginPath();
    g.roundRect(8, 8, 624, 224, 40);
    g.fill();
    g.fillStyle = '#f7eedf';
    g.textAlign = 'center';
    g.font = '800 46px Inter, system-ui, sans-serif';
    g.fillText(`${i + 1}${i === 0 ? ' · best fit' : ''}`, 320, 74);
    g.font = '600 36px Inter, system-ui, sans-serif';
    g.fillText(f.rivers ? `${f.rivers} river${f.rivers > 1 ? 's' : ''} join` : `next to ${f.names.join(' and ')}`, 320, 140, 600);
    g.font = '400 30px Inter, system-ui, sans-serif';
    g.fillText(on ? 'choose it again to lay your Hand' : 'look at it to choose', 320, 200, 600);
    tex.needsUpdate = true;
  }

  function draw() {
    chosenInk.begin();
    otherInk.begin();
    fits.forEach((f, i) => {
      const k = i === selected ? chosenInk : otherInk;
      for (const ring of RINGS) for (let j = 1; j < ring.length; j++) {
        const [x0, z0] = toWorld(f.pose, ring[j - 1][0], ring[j - 1][1]), [x1, z1] = toWorld(f.pose, ring[j][0], ring[j][1]);
        k.segment(a.set(x0, groundAt(x0, z0) + 40, z0), b.set(x1, groundAt(x1, z1) + 40, z1));
      }
    });
    chosenInk.end();
    otherInk.end();
    fits.forEach((_, i) => paint(i));
  }

  return {
    group,
    get fits() { return fits; },
    get selected() { return selected; },
    // fits from findFits, each with `names` (who it lies next to) added
    show(list) {
      fits = list;
      selected = 0;
      badges.forEach((bd, i) => {
        bd.m.visible = i < fits.length;
        if (bd.m.visible) bd.m.position.set(fits[i].centre[0], groundAt(...fits[i].centre) + 700, fits[i].centre[1]);
      });
      draw();
      group.visible = true;
    },
    hide() { group.visible = false; fits = []; },
    select(i) { if (i >= 0 && i < fits.length && i !== selected) { selected = i; draw(); } },
    // the badge nearest a ray (world space), or -1
    aim(origin, dir) {
      let best = -1, c = AIM;
      badges.forEach((bd, i) => {
        if (i >= fits.length) return;
        const d = v.copy(bd.m.position).sub(origin).normalize().dot(dir);
        if (d > c) { c = d; best = i; }
      });
      return best;
    },
    update(cameraWorld) { for (const bd of badges) bd.m.lookAt(cameraWorld); },
  };
}
```

- [ ] **Step 2: Wire your Hand into `src/main.js`.**

  - **Imports.**
    - Change line 4 to `import { startAudio, pauseAudio, setWind, tone, swell } from './audio.js';`.
    - Change line 12 to `import { unpackPrint, unpackPalm } from './hand/dna.js';`.
    - Add after line 19:

```js
import { handShape } from './hand/shape.js';
import { createAtelierPanel } from './atelier/panel.js';
import { createFlow } from './atelier/flow.js';
import { findFits } from './world/fit.js';
import { createGhosts } from './world/ghosts.js';
import { loadHand, saveHand, forgetHand } from './world/mine.js';
```

  - **Your Hand bakes with the founders.** Replace lines 71-82 (from `const FOUNDERS = founders();` to the `FOUNDERS.forEach(...)` post):

```js
const FOUNDERS = founders();
const MINE = FOUNDERS.length; // your Hand's layer, after the founders
let mine = loadHand(localStorage); // your Hand on this device ({ palm, prints, pose, name }), or null
let rising = null; // { t } while your new Hand rises
const hands = [];
const workers = [0, 1, 2].map(() => new Worker(new URL('./hand/worker.js', import.meta.url), { type: 'module' }));
for (const w of workers) {
  w.onmessage = ({ data }) => {
    const f = data.id === MINE ? mine : FOUNDERS[data.id], rise = data.id === MINE && rising ? 0 : 1;
    surface.addHand(data.id, data, f.pose, rise);
    hands.push({ ...f, id: data.id, data, rise });
  };
  w.onerror = (e) => console.error('hand worker failed', e);
}
const bake = (id, f) => workers[id % workers.length].postMessage({ id, palm: f.palm, prints: f.prints, cell: 0.75 });
FOUNDERS.forEach((f, id) => bake(id, f));
if (mine) bake(MINE, mine);
```

  - **The atelier, the merge and the rise.** Add a new section after the steering section, just before `// ---------- the loop ----------`:

```js
// ---------- your Hand: read it by eye, lay it into the world, keep it ----------

const atelier = createAtelierPanel();
rig.add(atelier.mesh);
const ghosts = createGhosts((x, z) => groundAt(x, z));
scene.add(ghosts.group);
let mode = 'fly', flow = null, laying = null, drawing = false, poking = null;
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), tipW = new THREE.Vector3();

function openAtelier() {
  if (mode !== 'fly' || mine) return;
  flow = createFlow(Math.floor(Math.random() * 2 ** 32));
  atelier.open(headLocal, headQuat);
  atelier.paint(flow);
  mode = 'atelier';
}
function act(a) {
  if (!a || mode !== 'atelier') return;
  if (a.type === 'pick') flow.pick(a.cls);
  else if (a.type === 'notSure') flow.notSure();
  else if (a.type === 'traced') flow.traced(a.pts);
  else if (a.type === 'guide') flow.useGuide();
  else if (a.type === 'noLine') flow.noLine();
  else if (a.type === 'typical') flow.typicalLines();
  else if (a.type === 'palette') flow.choosePalette(a.i);
  else if (a.type === 'reroll') flow.reroll();
  else if (a.type === 'lay') return merge();
  tone(4 + ((flow.prints.length + flow.lines.length) % 7), 0, 0.08);
  atelier.paint(flow);
}
// ponytail: runs on the main thread (~0.25 s, one hitch when you press "Lay my Hand"); a worker when the world is big
function merge() {
  flow.done();
  const dna = flow.dna(), land = hands.map((h) => ({ pose: h.pose, shape: handShape(unpackPalm(h.palm)), name: h.name }));
  const fits = findFits(land, handShape(unpackPalm(dna.palm)));
  atelier.close();
  if (!fits.length) { mode = 'fly'; return panel.say('No room on the coast right now', 5); }
  for (const f of fits) f.names = f.next.map((i) => (i < 0 ? 'the Source' : land[i].name));
  laying = { ...dna, name: flow.name };
  ghosts.show(fits);
  mode = 'merge';
  panel.say('Three places fit your Hand: choose one', 8);
}
function choose(i) { // a ghost chosen once is picked, chosen again is laid
  if (mode !== 'merge' || i < 0) return;
  if (i !== ghosts.selected) return ghosts.select(i);
  const fit = ghosts.fits[i];
  ghosts.hide();
  mine = { ...laying, pose: fit.pose };
  try {
    saveHand(localStorage, mine);
  } catch (e) {
    console.warn('this browser keeps nothing: your Hand lasts until you close the page', e);
  }
  rising = { t: 0 };
  mode = 'rise';
  bake(MINE, mine);
  swell(8);
  panel.say(fit.rivers ? `${mine.name} joins the world · ${fit.rivers} river${fit.rivers > 1 ? 's' : ''} join` : `${mine.name} joins the world`, 7);
}
// the ray from the mouse, or from your eyes along your gaze (world space)
function mouseRay(e) {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray;
}
function gazeRay() {
  raycaster.ray.origin.copy(headLocal).applyMatrix4(rig.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyQuaternion(headQuat).applyQuaternion(rig.quaternion);
  return raycaster.ray;
}
const cardUV = () => (atelier.isOpen ? raycaster.intersectObject(atelier.mesh)[0]?.uv ?? null : null); // after a ray is set
// headset: your index fingertip pressed against the card is a touch, and dragging it draws
function poke() {
  for (const h of xrHands) {
    if (!h.frame) continue;
    const p = atelier.mesh.worldToLocal(rig.localToWorld(tipW.fromArray(h.store['index-finger-tip'])));
    const on = Math.abs(p.x) < 0.3 && Math.abs(p.y) < 0.225, uv = { x: p.x / 0.6 + 0.5, y: p.y / 0.45 + 0.5 };
    if (!poking && on && p.z < 0.01 && p.z > -0.03) { poking = h; act(atelier.down(uv, flow)); }
    else if (poking === h && (p.z > 0.03 || !on)) { poking = null; act(atelier.up(flow)); }
    else if (poking === h) atelier.move(uv, flow);
  }
}
// a pinch: in the atelier it touches the card where you look; on the way to the merge it chooses the ghost you look at
[0, 1].forEach((i) => renderer.xr.getController(i).addEventListener('select', () => {
  gazeRay();
  if (mode === 'atelier') { const uv = cardUV(); if (uv) { act(atelier.down(uv, flow)); act(atelier.up(flow)); } }
  else if (mode === 'merge') choose(ghosts.aim(raycaster.ray.origin, raycaster.ray.direction));
}));
addEventListener('keydown', (e) => {
  if (mode !== 'merge') return;
  if ('123'.includes(e.key)) choose(+e.key - 1);
  else if (e.key === 'Enter') choose(ghosts.selected);
});
document.getElementById('forget').addEventListener('click', (e) => { e.preventDefault(); forgetHand(localStorage); location.reload(); });
if (mine) document.getElementById('forget').classList.remove('hidden');
```

  - **The mouse.** Replace the three pointer listeners (lines 174-180) with these. A click on the card acts on it, a drag on the card draws, a click on a badge chooses it, and anything else looks around:

```js
renderer.domElement.addEventListener('pointerdown', (e) => {
  const ray = mouseRay(e), uv = mode === 'atelier' ? cardUV() : null;
  if (uv) { drawing = true; return act(atelier.down(uv, flow)); }
  if (mode === 'merge') { const i = ghosts.aim(ray.origin, ray.direction); if (i >= 0) return choose(i); }
  look.drag = true;
});
addEventListener('pointerup', () => {
  look.drag = false;
  if (drawing) { drawing = false; act(atelier.up(flow)); }
});
addEventListener('pointermove', (e) => {
  if (drawing) { mouseRay(e); const uv = cardUV(); if (uv) atelier.move(uv, flow); return; }
  if (!look.drag) return;
  look.yaw -= e.movementX * 0.003;
  look.pitch = Math.max(-1.3, Math.min(0.6, look.pitch - e.movementY * 0.003));
});
```

  These listeners now use `mode`, `cardUV` and `choose`, which are defined further down. They only run after the module has loaded, so that is fine.

  - **The loop.**
    - Replace `glide.update(dt, steer, groundAt);` with `if (mode !== 'atelier') glide.update(dt, steer, groundAt); // the world waits while you read your hand`.
    - Change the condition of `card.update(...)` from `started && (webcam || renderer.xr.isPresenting)` to `started && mode !== 'atelier' && (webcam || renderer.xr.isPresenting)`.
    - After `rig.updateMatrixWorld();`, add:

```js
  if (mode === 'atelier' && renderer.xr.isPresenting) poke();
  if (mode === 'merge') ghosts.update(camera.getWorldPosition(tmpChase));
  if (rising) { // your Hand rises over 8 s once it has baked; the glider's floor rises with it
    const h = hands.find((q) => q.id === MINE);
    if (h) {
      rising.t = Math.min(1, rising.t + dt / 8);
      h.rise = rising.t * rising.t * (3 - 2 * rising.t);
      surface.setRise(MINE, h.rise);
      if (rising.t === 1) { rising = null; mode = 'fly'; }
    }
  }
```

  - **First visit.** In `start()`, replace the hint `setTimeout` with:

```js
  setTimeout(() => (mine ? panel.say(renderer.xr.isPresenting ? 'Raise a hand, point where you want to fly' : 'A D turn · W S climb · drag to look', 6) : openAtelier()), 4200);
```

  - **`window.__pwc`.**
    - Add `mode, mine: mine?.name ?? null,` to the returned state.
    - Add the test hooks after the `state` getter: `atelier: { act: (a) => act(a), get flow() { return flow; }, choose: (i) => choose(i) },`.

- [ ] **Step 3: `index.html`.** Replace the small print `<p class="small">Hands only, no controller needed. Nothing about your hand is stored.</p>` with:

```html
        <p class="small">
          Hands only, no controller needed. Only your Hand's map DNA is kept, on this device: never
          images or tracking data. <a href="#" id="forget" class="hidden">Forget my Hand</a>
        </p>
```

- [ ] **Step 4: Check it end to end in the browser.** Write `<scratchpad>/m1/m2.mjs`, starting from `shot.mjs`. Start the server first with `python3 serve.py`. The script:
  1. Opens `http://localhost:8130/?auto&at=0,1500,16000&pitch=-0.45`.
  2. Runs `localStorage.removeItem('pwc.hand.v1')` and reloads.
  3. Clicks `#previewButton` and waits for `__pwc.state.mode === 'atelier'`, about 4.2 s after the start.
  4. Screenshots the prints page (`m2-prints.png`).
  5. Picks five patterns with `__pwc.atelier.act({ type: 'pick', cls })`, then screenshots the lines page (`m2-lines.png`).
  6. Acts `{ type: 'typical' }`, then screenshots the palette page (`m2-palette.png`).
  7. Acts `{ type: 'lay' }` and waits for `mode === 'merge'`. It screenshots the ghosts (`m2-ghosts.png`), presses `2` (the second ghost turns red), and presses `Enter`.
  8. Waits for `mode === 'fly'`, about 9 s, and screenshots the risen Hand (`m2-risen.png`). It checks that `state.hands === 11` and that `state.mine` is a name.
  9. Reloads and clicks `#previewButton`. It waits 6 s and checks three things: `state.hands === 11`, `state.mode === 'fly'` (the atelier did not open), and `#forget` is visible.
  10. Clears `pwc.hand.v1` at the end.

  Expected: every wait succeeds, the script prints `no errors`, and the screenshots show:
  - a card with six inked patterns;
  - the palm drawing with a gold dotted guide;
  - six palettes and a name;
  - three ghost outlines with badges, the chosen one in red;
  - an eleventh Hand on the frontier.

  Then try it by hand in real Chrome: trace a heart line on the drawing with the mouse. It must turn into a blue river line and move you on to the head line.
- [ ] **Step 5: Run** `node --test tests/*.test.mjs`. Expected: all pass.
- [ ] **Step 6: Commit** `feat: lay your Hand into the world: three ghost fits, it rises, it stays`.

---

### Task 7: The atelier in your room

**Files:**
- Modify: `src/main.js`

- [ ] **Step 1: Passthrough when the headset can do it, a dimmed world when it cannot.**

  - **Renderer.** Create it with `new THREE.WebGLRenderer({ antialias: true, alpha: true })`, and add `renderer.setClearColor(0x000000, 0);` after it. The sky covers everything, so nothing changes on a screen.
  - **Dim plane.** After `rig.add(atelier.mesh);` add a plane that dims the world behind the card:

```js
const dim = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.35), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false }));
dim.position.z = -0.01;
dim.renderOrder = 24;
atelier.mesh.add(dim); // behind the card: the world dims while you read your hand (unless you are in your room)
let inRoom = false;
```

  - **`enterHeadset()`.** Replace its first two lines with:

```js
  startAudio();
  const kind = (await navigator.xr.isSessionSupported('immersive-ar').catch(() => false)) ? 'immersive-ar' : 'immersive-vr';
  const session = await navigator.xr.requestSession(kind, { optionalFeatures: ['hand-tracking'] });
  await renderer.xr.setSession(session);
  inRoom = session.environmentBlendMode !== undefined && session.environmentBlendMode !== 'opaque'; // your real room shows through
```

    Also add `inRoom = false;` to its `end` listener.
  - **The loop.** After `if (mode === 'atelier' && renderer.xr.isPresenting) poke();`, add:

```js
  // reading your hand in your own room: only the card and your hands; the world comes back after
  const room = mode === 'atelier' && inRoom;
  world.sky.visible = !room;
  surface.meshes.forEach((m) => (m.visible = !room));
  ink.mesh.visible = streakInk.mesh.visible = !room;
  dim.visible = !inRoom;
```

- [ ] **Step 2: Check it in the emulator.** Run `m2.mjs` with `?emulate&nodevui&auto` and click `#xrButton` instead of `#previewButton`.
  - IWER's Quest 3 profile supports immersive-ar but has no synthetic room loaded. So the atelier screenshot must show the card over the page background, with no wilderness.
  - After you lay your Hand, the world must come back.
  - The script must print `no errors`.

  Then force the VR path: in the page, before the click, run `navigator.xr.isSessionSupported = async (m) => m === 'immersive-vr';`. The atelier must show over the dimmed world (Review Focus 5).
- [ ] **Step 3: Run** `node --test tests/*.test.mjs`. Expected: all pass.
- [ ] **Step 4: Commit** `feat: read your hand in your own room (passthrough), then fly into the world`.

---

## After M2

- **M3, the server:**
  - the Hands registry in D1;
  - the World Durable Object for placement;
  - live rooms of 200;
  - the phone pairing relay.

  With it, other players' Hands join yours, and the second new Hand can join your rivers.
- **Better merge:**
  - grab a ghost and adjust it, with the badges updating live;
  - carve a channel across the seam where rivers meet (spec 6.3);
  - announce each confluence.
- **Changing a pick later** (spec 7.4, "you can change it later") belongs with the palm atlas (M5).
- **Your creature hatches from your prints:** its strand count and twist come from your pattern classes.
