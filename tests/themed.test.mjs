// tests/themed.test.mjs: one drawing, two looks
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { themed, neonColour, neonFont, look } from '../src/ui/themed.js';

const fake = () => { const calls = [], g = { fillStyle: '', strokeStyle: '', font: '', shadowBlur: 0, shadowColor: '', save() {}, restore() {}, moveTo(...a) { calls.push(['moveTo', ...a]); }, lineTo(...a) { calls.push(['lineTo', ...a]); }, closePath() { calls.push(['closePath']); }, roundRect(...a) { calls.push(['roundRect', ...a]); }, stroke() { calls.push(['stroke', this.shadowBlur]); }, fillText(...a) { calls.push(['fillText', a[0], this.shadowBlur]); }, fillRect(...a) { calls.push(['fillRect', ...a]); } }; return { g, calls }; };
test('ink becomes light, paper becomes translucent violet, the seal hot pink, the river cyan; unknown colours stay', () => {
  assert.equal(neonColour('#16100e'), '#f4fbff');
  assert.equal(neonColour('rgba(22,16,14,0.6)'), 'rgba(191,233,255,0.6)');
  assert.equal(neonColour('rgba(243, 228, 210, 0.9)'), 'rgba(11,0,26,0.72)');
  assert.equal(neonColour('#b8442e'), '#ff2bd6');
  assert.equal(neonColour('#2f5d7c'), '#00e5ff');
  assert.equal(neonColour('#123456'), '#123456');
  assert.match(neonFont('italic 400 34px Georgia, serif'), /^400 34px ui-monospace/);
});
test('the calm look passes through untouched; the foxfire look repaints the same calls', () => {
  const { g, calls } = fake(), t = themed(g, () => look.neon);
  look.neon = false;
  t.fillStyle = '#16100e'; t.font = '600 46px Georgia, serif'; t.roundRect(0, 0, 100, 50, 20); t.stroke(); t.fillText('Crown', 1, 2);
  assert.equal(g.fillStyle, '#16100e');
  assert.equal(g.font, '600 46px Georgia, serif');
  assert.deepEqual(calls, [['roundRect', 0, 0, 100, 50, 20], ['stroke', 0], ['fillText', 'Crown', 0]]);
  calls.length = 0;
  look.neon = true;
  t.fillStyle = '#16100e'; t.strokeStyle = 'rgba(22,16,14,0.5)'; t.font = '600 46px Georgia, serif'; t.roundRect(0, 0, 100, 50, 20); t.stroke(); t.fillText('Crown', 1, 2);
  assert.equal(g.fillStyle, '#f4fbff');
  assert.equal(g.strokeStyle, 'rgba(191,233,255,0.5)');
  assert.match(g.font, /ui-monospace/);
  assert.ok(!calls.some((c) => c[0] === 'roundRect'), 'no rounded panels');
  assert.equal(calls.filter((c) => c[0] === 'lineTo').length, 7, 'a chamfered one: eight corners');
  assert.ok(calls.find((c) => c[0] === 'stroke')[1] > 0 && calls.find((c) => c[0] === 'fillText')[2] > 0, 'lines and letters glow');
  look.neon = false;
});

test('in the foxfire look a shape filled with ink (a chosen tab, a pressed chip) is magenta glass, not a white slab, and the paper-coloured label on it is white', () => {
  const calls = [], g = { fillStyle: '', strokeStyle: '', font: '', shadowBlur: 0, shadowColor: '', save() {}, restore() {}, fill() { calls.push(['fill', this.fillStyle]); }, fillText(text) { calls.push(['fillText', text, this.fillStyle]); } };
  const t = themed(g, () => true);
  t.fillStyle = '#16100e'; t.fill();
  assert.deepEqual(calls.at(-1), ['fill', 'rgba(255,43,214,0.5)']);
  assert.equal(g.fillStyle, '#f4fbff', 'ink is still light for the letters that follow');
  t.fillText('ink letters', 0, 0);
  assert.deepEqual(calls.at(-1), ['fillText', 'ink letters', '#f4fbff']);
  t.fillStyle = '#f6ead6'; t.fillText('World', 0, 0);
  assert.deepEqual(calls.at(-1), ['fillText', 'World', '#ffffff'], 'a label in paper, on an inked shape');
  t.fill();
  assert.deepEqual(calls.at(-1), ['fill', '#0b001a'], 'a paper panel stays dark violet');
  t.fillStyle = '#b8442e'; t.fill();
  assert.deepEqual(calls.at(-1), ['fill', '#ff2bd6'], 'the seal is untouched');
  t.fillStyle = 'rgba(22,16,14,0.85)'; t.fill();
  assert.deepEqual(calls.at(-1), ['fill', 'rgba(255,43,214,0.5)'], 'dense ink (a chip switched on) is glass too');
  t.fillStyle = 'rgba(22,16,14,0.2)'; t.fill();
  assert.deepEqual(calls.at(-1), ['fill', 'rgba(191,233,255,0.2)'], 'thin ink (a track, a shadow) stays thin');
  const calm = themed(g, () => false);
  calm.fillStyle = '#16100e'; calm.fill();
  assert.deepEqual(calls.at(-1), ['fill', '#16100e'], 'and the calm look is untouched');
});
