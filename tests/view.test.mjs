// tests/view.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NEAR, FAR, FOG_DENSITY } from '../src/view.js';

test('your hands, 10 cm from your eyes, are not clipped away', () => {
  assert.ok(NEAR <= 0.1, `near plane ${NEAR} m`);
});

test('the far plane lies past the point where the fog has hidden everything', () => {
  const hidden = Math.sqrt(Math.log(100)) / FOG_DENSITY; // exp2 fog at 99%
  assert.ok(FAR > hidden, `far ${FAR} m, fog closes at ${Math.round(hidden)} m`);
  assert.ok(FAR / NEAR < 5e5, 'keep depth precision for the coasts');
});
