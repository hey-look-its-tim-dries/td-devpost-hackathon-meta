// tests/palm-lines.test.mjs: palm lines read from a photo (spec 7.3), on a synthetic palm only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPalmLines, frameFromKnuckles } from '../src/phone/palm-lines.js';
import { templatePalm, FINGERS, PALM_UNIT } from '../src/hand/shape.js';

const W = 512, H = 512;
const frame = { toImage: ([X, Y]) => [256 + X * 170, 470 - Y * 190] }; // palm units to pixels, thumb to the right
// a pale palm with dark creases drawn along a template's lines (with a little wobble), plus skin texture
function palmImage(palm) {
  const g = new Float32Array(W * H).fill(0.78);
  for (let i = 0; i < W * H; i++) g[i] += 0.04 * Math.sin(i * 0.37) * Math.sin(i * 0.011);
  for (const l of palm.lines) {
    for (let k = 0; k < l.pts.length - 1; k++) for (let t = 0; t <= 1; t += 0.01) {
      const X = l.pts[k][0] + (l.pts[k + 1][0] - l.pts[k][0]) * t, Y = l.pts[k][1] + (l.pts[k + 1][1] - l.pts[k][1]) * t;
      const [px, py] = frame.toImage([X, Y]);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const d = Math.hypot(dx, dy); if (d <= 3) { const i = Math.round(py + dy) * W + Math.round(px + dx); if (i >= 0 && i < W * H) g[i] = Math.min(g[i], 0.78 - 0.35 * (1 - d / 3.5)); } }
    }
  }
  return g;
}

test('three creases drawn along a palm read as heart, head and life, close to where they were drawn', () => {
  const truth = templatePalm({ seed: 11, fate: false });
  const lines = readPalmLines(palmImage(truth), W, H, frame);
  for (const kind of ['heart', 'head', 'life']) {
    const got = lines.find((l) => l.kind === kind), want = truth.lines.find((l) => l.kind === kind);
    assert.ok(got, `${kind} found`);
    assert.equal(got.pts.length, 8);
    const err = Math.max(...got.pts.map((p, i) => Math.hypot(p[0] - want.pts[i][0], p[1] - want.pts[i][1])));
    assert.ok(err < 0.08, `${kind} off by ${err.toFixed(3)} palm units`);
  }
  assert.equal(lines.find((l) => l.kind === 'fate'), undefined, 'no fate line was drawn, none is read');
});
test('a frame from two knuckles and the wrist maps them back onto the template, the right way round', () => {
  const at = (id) => FINGERS.find((f) => f.id === id).base.map((v) => v / PALM_UNIT);
  const truth = ([X, Y]) => [256 + X * 180, 480 - Y * 180]; // a photo: one scale, y down
  const f = frameFromKnuckles(truth(at('I')), truth(at('L')), truth([0.1, -0.1]));
  for (const p of [[0.3, 0.9], [-0.5, 0.2], [0.6, 1.4]]) { const [x, y] = f.toImage(p), [u, v] = truth(p); assert.ok(Math.hypot(x - u, y - v) < 1e-6, `${p}`); }
  const left = ([X, Y]) => [256 - X * 180, 480 - Y * 180]; // a left hand: the mirror image, read as a right palm
  const g = frameFromKnuckles(left(at('I')), left(at('L')), left([0.1, -0.1]));
  for (const p of [[0.3, 0.9], [-0.5, 0.2]]) { const [x, y] = g.toImage(p), [u, v] = left(p); assert.ok(Math.hypot(x - u, y - v) < 1e-6, `left ${p}`); }
});
