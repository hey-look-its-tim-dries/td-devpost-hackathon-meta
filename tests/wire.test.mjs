// tests/wire.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POSE_BYTES, encodePose, decodePose, encodeSnapshot, decodeSnapshot } from '../src/net/wire.js';

const pose = { x: 1234.5, y: 1100.25, z: -15000, yaw: 2.5, pitch: -0.3, mode: 2 };

test('a pose is 21 bytes and comes back as float32 allows', () => {
  const b = encodePose(pose);
  assert.equal(b.length, POSE_BYTES);
  const p = decodePose(b);
  for (const k of ['x', 'y', 'z', 'yaw', 'pitch']) assert.ok(Math.abs(p[k] - pose[k]) < 1e-3, k);
  assert.equal(p.mode, 2);
});

test('a snapshot of 200 players round-trips and is about 4.6 KB', () => {
  const list = Array.from({ length: 200 }, (_, i) => ({ id: i * 7, pose: { ...pose, x: i } }));
  const b = encodeSnapshot(list);
  assert.equal(b.length, 2 + 200 * (2 + POSE_BYTES));
  const back = decodeSnapshot(b);
  assert.equal(back.length, 200);
  assert.equal(back[199].id, 199 * 7);
  assert.equal(back[199].pose.x, 199);
});

test('an empty snapshot and a short buffer are not errors', () => {
  assert.deepEqual(decodeSnapshot(encodeSnapshot([])), []);
  assert.deepEqual(decodeSnapshot(new Uint8Array(1)), []);
  assert.deepEqual(decodeSnapshot(new Uint8Array([1, 0, 5])), [], 'claims one player, holds none');
});
