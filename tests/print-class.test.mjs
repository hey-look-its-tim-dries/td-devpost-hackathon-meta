// tests/print-class.test.mjs: a fingertip close-up read on the phone (spec 7.2), on rendered prints only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPrint, toPrintDNA } from '../src/phone/print-class.js';
import { printPhase } from '../src/print/phase.js';
import { unpackPrint, PATTERN_OF } from '../src/hand/dna.js';

// a rendered print, as a phone close-up would look after cropping: dark ridges on light skin
function render(pattern, { size = 256, seed = 3, mirror = false, noise = 0 } = {}) {
  const g = new Float32Array(size * size);
  let s = 12345;
  const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const x = (px - size / 2) / (size * 0.41), y = (size / 2 - py) / (size * 0.45), r = Math.hypot(x, y * 0.95);
    const v = r > 0.95 ? 0.85 : 0.5 + 0.4 * Math.cos(2 * Math.PI * printPhase(pattern, mirror ? -x : x, y, seed));
    g[py * size + px] = v + noise * (rand() - 0.5);
  }
  return g;
}

for (const cls of ['arch', 'tented', 'ulnar', 'radial', 'whorl', 'pocket', 'double']) {
  test(`a rendered ${cls} reads as ${cls}`, () => {
    const [pattern, mirror] = PATTERN_OF[cls];
    for (const seed of [3, 8]) {
      const r = classifyPrint(render(pattern, { seed, mirror }), 256, 256);
      assert.equal(r.cls, cls, `seed ${seed}: read as ${r.cls} (cores ${JSON.stringify(r.cores)}, deltas ${JSON.stringify(r.deltas)})`);
    }
  });
}
test('a loop and its mirror read as opposite sides; a little noise changes nothing', () => {
  const a = classifyPrint(render('loop'), 256, 256).cls, b = classifyPrint(render('loop', { mirror: true }), 256, 256).cls;
  assert.notEqual(a, b);
  assert.equal(classifyPrint(render('whorl', { noise: 0.25 }), 256, 256).cls, 'whorl');
});
test('the orientation field is 8 x 8 in 16 steps; the DNA is 44 bytes and shuffled', () => {
  const r = classifyPrint(render('whorl'), 256, 256);
  assert.equal(r.orient.length, 64);
  assert.ok(r.orient.every((o) => o >= 0 && o < 16));
  const dna = toPrintDNA(r, 1, 77);
  assert.equal(dna.length, 44);
  const back = unpackPrint(dna);
  assert.equal(back.cls, 'whorl');
  assert.equal(back.finger, 1);
  assert.equal(back.scanned, true);
});
