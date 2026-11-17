// tests/fov.test.mjs: in the headset the HUD is laid out from the view the runtime reports (Meta: "use the view
// and projection data your runtime provides", never hard-coded display values). On the Meta VR Glasses (70 x 66)
// every card stays inside the 58 x 54 degree design area; on a Quest 3 (about 104 x 96 rendered) the cards spread
// out to the edges of a comfortable zone instead of huddling over your whorl.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fovOf, spreadOf, placeCard } from '../src/ui/fov.js';

const D = Math.PI / 180;
// a column-major projection matrix with the given half angles (degrees)
const proj = (l, r, u, d) => { const L = Math.tan(l * D), R = Math.tan(r * D), U = Math.tan(u * D), B = Math.tan(d * D), m = new Array(16).fill(0); m[0] = 2 / (L + R); m[8] = (R - L) / (L + R); m[5] = 2 / (U + B); m[9] = (U - B) / (U + B); m[10] = -1; m[11] = -1; return m; };
const glasses = proj(37, 37, 34, 34); // render extent 74 x 68
const quest3 = proj(54, 50, 48, 48); // a Quest 3 eye, wider outward

test('the half angles come back out of the projection matrix', () => {
  const f = fovOf(proj(40, 30, 35, 25));
  assert.ok(Math.abs(f.h - (Math.tan(40 * D) + Math.tan(30 * D)) / 2) < 1e-9);
  assert.ok(Math.abs(f.v - (Math.tan(35 * D) + Math.tan(25 * D)) / 2) < 1e-9);
});

test('on the glasses: nothing moves sideways, the design area is 29 by 27 degrees', () => {
  const s = spreadOf(fovOf(glasses));
  assert.ok(Math.abs(s.x - 1) < 0.02);
  assert.ok(Math.abs(Math.atan(s.h) / D - 29) < 1, `h ${Math.atan(s.h) / D}`);
  assert.ok(Math.abs(Math.atan(s.v) / D - 27) < 1, `v ${Math.atan(s.v) / D}`);
  assert.ok(s.y > 1.25, 'the cards leave the middle of the view free: up and down');
});

test('on a Quest 3 the cards spread wider, but stay within a comfortable 33 degrees', () => {
  const s = spreadOf(fovOf(quest3)), g = spreadOf(fovOf(glasses));
  assert.ok(s.x > g.x && s.y >= g.y);
  assert.ok(Math.atan(s.h) / D <= 33.01 && Math.atan(s.v) / D <= 30.01);
});

test('a card is pushed out but never past the design area, whole card included', () => {
  const s = spreadOf(fovOf(glasses));
  // the radar: 0.1 wide at x -0.302, 0.65 m away
  const r = placeCard({ x: -0.302, y: -0.136 }, { w: 0.1, h: 0.1 }, 0.65, s);
  assert.ok(Math.atan((Math.abs(r.x) + 0.05) / 0.65) / D <= 29.01);
  assert.ok(r.y < -0.136, 'lower than before');
  assert.ok(Math.atan((Math.abs(r.y) + 0.05) / 0.65) / D <= 27.01);
  // the gesture card already sits low: it stays inside, never pushed out of view
  const g = placeCard({ x: 0, y: -0.245 }, { w: 0.3, h: 0.1125 }, 0.6, s);
  assert.equal(g.x, 0);
  assert.ok(Math.atan((Math.abs(g.y) + 0.05625) / 0.6) / D <= 27.01);
});

test('an unreadable matrix changes nothing', () => {
  const s = spreadOf(fovOf(null));
  assert.deepEqual(placeCard({ x: 0.2, y: 0.1 }, { w: 0.1, h: 0.05 }, 0.65, s), { x: 0.2, y: 0.1 });
});
