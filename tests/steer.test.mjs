import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headSteer, handSteer, angleBetween, mul } from '../src/steer.js';

const deg = (d) => (d * Math.PI) / 180;
const axis = ([x, y, z], a) => [x * Math.sin(a / 2), y * Math.sin(a / 2), z * Math.sin(a / 2), Math.cos(a / 2)];
const I = [0, 0, 0, 1];
const turnRight = (d) => axis([0, 1, 0], deg(-d)); // three.js: -Z forward, +X right
const tiltRight = (d) => axis([0, 0, 1], deg(-d)); // right ear toward right shoulder
const lyingDown = axis([1, 0, 0], deg(90)); // looking straight up at the ceiling

test('centred head does not steer', () => assert.equal(headSteer(I, I), 0));

test('turning and tilting right both steer right, left mirrors it', () => {
  assert.ok(headSteer(I, turnRight(15)) > 0.4);
  assert.ok(headSteer(I, tiltRight(15)) > 0.4);
  assert.ok(Math.abs(headSteer(I, turnRight(-15)) + headSteer(I, turnRight(15))) < 1e-9);
});

test('small wobbles and nodding do nothing, big turns clamp', () => {
  assert.equal(headSteer(I, turnRight(2)), 0);
  assert.ok(Math.abs(headSteer(I, axis([1, 0, 0], deg(30)))) < 1e-9);
  assert.equal(headSteer(I, turnRight(70)), 1);
});

test('lying down steers exactly like sitting', () => {
  const lying = headSteer(lyingDown, mul(lyingDown, turnRight(12)));
  assert.ok(Math.abs(lying - headSteer(I, turnRight(12))) < 1e-9);
  assert.ok(lying > 0);
});

test('hand pull clamps and stillness angle reads', () => {
  assert.equal(handSteer(0.3), 1);
  assert.equal(handSteer(-0.075), -0.5);
  assert.ok(Math.abs(angleBetween(I, turnRight(10)) - deg(10)) < 1e-6);
});
