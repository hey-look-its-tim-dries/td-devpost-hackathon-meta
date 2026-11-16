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
