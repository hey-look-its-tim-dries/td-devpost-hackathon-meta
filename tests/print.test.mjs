import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLand, CLASSES } from '../src/print/land.js';

const lands = Object.fromEntries(CLASSES.map((cls) => [cls, makeLand({ cls, seed: 11, size: 192 })]));

test('the same class and seed always grow the same land; another seed moves the minutiae', () => {
  const a = makeLand({ cls: 'loop', seed: 3, size: 128 }), b = makeLand({ cls: 'loop', seed: 3, size: 128 }), c = makeLand({ cls: 'loop', seed: 4, size: 128 });
  assert.deepEqual(a.ridge, b.ridge);
  assert.notDeepEqual(a.ridge, c.ridge);
  assert.notDeepEqual(a.landmarks.map((m) => [m.x, m.y]), c.landmarks.map((m) => [m.x, m.y]));
});

test('ridges are evenly spaced: about the asked number along the finger', () => {
  // counted down the middle, which crosses the ridges in every class (arches run sideways)
  for (const [cls, L] of Object.entries(lands)) {
    const N = L.size, x = Math.round(N / 2);
    let crossings = 0, width = 0;
    for (let y = 1; y < N; y++) {
      const i = y * N + x;
      if (L.mask[i] < 0.5) continue;
      width++;
      if ((L.ridge[i] > 0) !== (L.ridge[i - N] > 0)) crossings++;
    }
    const expected = (22 * width) / N, got = crossings / 2;
    assert.ok(Math.abs(got - expected) / expected < 0.35, `${cls}: ${got} ridges, expected about ${expected.toFixed(1)}`);
  }
});

test('the summit is at the core and the coast is at sea level', () => {
  for (const cls of ['loop', 'whorl', 'tented']) {
    const L = lands[cls], N = L.size, [cx, cy] = L.cores[0];
    let top = 0;
    for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) top = Math.max(top, L.height[(Math.round(cy) + dy) * N + Math.round(cx) + dx]);
    assert.ok(top >= L.levels - 2, `${cls}: summit ${top} of ${L.levels}`);
    assert.equal(L.height[0], 0);
    assert.ok(L.levels >= 5);
  }
});

test('the paths run through furrows inside the coast, and along a path the height mostly holds', () => {
  for (const [cls, L] of Object.entries(lands)) {
    const N = L.size;
    let pixels = 0, steps = 0, flat = 0;
    for (let i = 0; i < N * N; i++) {
      if (!L.paths[i]) continue;
      pixels++;
      assert.ok(L.mask[i] > 0.5 && L.ridge[i] <= 0, `${cls}: path pixel on a ridge or past the coast`);
      const x = i % N;
      if (x + 1 < N && L.paths[i + 1]) { steps++; if (L.height[i + 1] === L.height[i]) flat++; }
    }
    assert.ok(pixels > N * 5, `${cls}: only ${pixels} path pixels`);
    assert.ok(flat / steps > 0.9, `${cls}: height changes too often along paths`);
  }
});

test('every land has a healthy number of landmarks, all on land, each with a ridge for its bird', () => {
  for (const [cls, L] of Object.entries(lands)) {
    assert.ok(L.landmarks.length >= 8 && L.landmarks.length <= 120, `${cls}: ${L.landmarks.length} landmarks`);
    for (const m of L.landmarks) {
      assert.ok(L.mask[m.y * L.size + m.x] > 0.5, `${cls}: ${m.kind} past the coast`);
      assert.ok(m.ridge.length >= 2);
    }
    const singular = L.landmarks.filter((m) => m.kind === 'core' || m.kind === 'delta').length;
    assert.equal(singular, L.cores.length + L.deltas.length);
  }
  assert.equal(lands.arch.cores.length, 0);
  assert.equal(lands.whorl.deltas.length, 2);
});

test('a full-size land grows fast enough for a worker during the birth animation', () => {
  const t0 = performance.now();
  makeLand({ cls: 'double', seed: 5, size: 256 });
  assert.ok(performance.now() - t0 < 3000);
});
