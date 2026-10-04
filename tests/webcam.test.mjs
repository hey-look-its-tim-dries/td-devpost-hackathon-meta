// tests/webcam.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toJoints } from '../src/webcam-hands.js';
import { JOINTS, palmFrame } from '../src/gesture.js';

// A right hand held up, palm to the camera, fingers up, as MediaPipe reports it from an unmirrored
// webcam: camera frame, x right in the image, y down, z away from the camera. The person's thumb
// shows on the image's right.
const CAM = [
  [0, 0.09, 0], // wrist
  [0.03, 0.06, 0], [0.05, 0.04, 0], [0.065, 0.02, 0], [0.075, 0, 0], // thumb
  ...[0.03, 0.01, -0.01, -0.03].flatMap((x) => [[x, 0, 0], [x, -0.04, 0], [x, -0.065, 0], [x, -0.085, 0]]),
].map(([x, y, z]) => ({ x, y, z }));
const image = (k) => CAM.map(({ x, y }) => ({ x: 0.5 + x * k, y: 0.5 + y * k }));

test('all 25 WebXR joints, and MediaPipe\'s handedness taken as it is (a raw webcam picture is not mirrored)', () => {
  const h = toJoints(CAM, image(3), 'Right');
  assert.equal(h.handedness, 'right');
  for (const n of JOINTS) assert.equal(h.joints[n].length, 3, n);
});

test('a palm shown to the camera faces the screen, fingers up', () => {
  const h = toJoints(CAM, image(3), 'Right');
  const f = palmFrame(h.joints, h.handedness);
  assert.ok(f.normal[2] < -0.95, `normal ${f.normal}`);
  assert.ok(f.forward[1] > 0.95, `forward ${f.forward}`);
});

test('the hand sits between your eyes and the screen, nearer you when it looks smaller', () => {
  const near = toJoints(CAM, image(6), 'Right').joints.wrist, far = toJoints(CAM, image(3), 'Right').joints.wrist;
  for (const w of [near, far]) assert.ok(w[2] < -0.1 && w[2] > -0.6, `z ${w[2]}`);
  assert.ok(far[2] > near[2]);
});
