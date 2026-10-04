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
  for (const s of ['0x27d4eb2du', '0x165667b1u', '0x1b873593u', '0x2c1b3c6du', '0x297a2d39u', '11000.0', '17000.0', '2500.0', '650.0', '60.0', '3500.0', '6000.0', '2.03', '900.0', '4000.0'])
    assert.ok(WILD_GLSL.includes(s), s);
});

test('canyon walls are slopes you can glide down, not cliffs (no forced lurches)', () => {
  let worst = 0;
  for (let i = 0; i < 20000; i++) {
    const x = (hashI(i, 3, 9) - 0.5) * 120000, z = (hashI(i, 4, 9) - 0.5) * 120000;
    worst = Math.max(worst, Math.abs(wildHeight(x + 2, z) - wildHeight(x, z)) / 2, Math.abs(wildHeight(x, z + 2) - wildHeight(x, z)) / 2);
  }
  assert.ok(worst < 3, `steepest ${worst.toFixed(2)} m per m`);
});
