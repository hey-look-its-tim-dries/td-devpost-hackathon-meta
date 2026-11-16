// tests/postcard.test.mjs: your Hand as a printed map, and your data as a file
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawPostcard, POSTCARD, exportData } from '../src/postcard.js';
import { founders } from '../src/world/founders.js';
import { labelHand } from '../src/hand/label.js';
import { handShape } from '../src/hand/shape.js';
import { unpackPalm } from '../src/hand/dna.js';

const recorder = () => { const calls = []; return new Proxy({ calls }, { get: (t, k) => (k in t ? t[k] : (...a) => { calls.push([k, ...a]); return k === 'measureText' ? { width: 10 } : undefined; }), set: (t, k, v) => { t[k] = v; return true; } }); };
const f = founders()[2], lab = labelHand(handShape(unpackPalm(f.palm)), 0.75);

test('the postcard carries the Hand name, its handbit names, a compass, and a dated stamp', () => {
  const g = recorder();
  drawPostcard(g, { name: 'Oruvel', palm: f.palm, handbits: lab.handbits, names: { I1: 'Brisk Fell' }, date: new Date(Date.UTC(2026, 10, 18)) });
  const text = g.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
  assert.ok(text.includes('OruveL'.replace('L', 'l')) || text.includes('Oruvel'));
  assert.ok(text.includes('Brisk Fell'), 'a named handbit is labelled by its name');
  assert.ok(text.includes('N'), 'a compass');
  assert.ok(text.some((t) => /18 NOV 2026/.test(t)), 'the stamp is dated');
  assert.equal(POSTCARD.w, 1600);
});
test('export: your DNA, place, name, charting and pins as JSON, nothing else', () => {
  const j = JSON.parse(exportData({ palm: f.palm, prints: f.prints, pose: f.pose, name: 'Oru', id: 'h1' }, { 'h2': { m: 3, n: 20 } }, [{ label: 'A' }]));
  assert.deepEqual(Object.keys(j).sort(), ['charted', 'gift', 'hand', 'names', 'note', 'pins']);
  assert.equal(j.hand.prints.length, 5);
  assert.equal(typeof j.hand.palm, 'string', 'base64, as the map keeps it');
});
test('export also carries what the map holds for you: your names and your Community gift (deferred minor)', () => {
  const j = JSON.parse(exportData({ palm: f.palm, prints: f.prints, pose: f.pose, name: 'Oru', id: 'h1' }, {}, [], { names: { I1: 'Oru Vale' }, gift: { no: 2, slot: 'I1' } }));
  assert.deepEqual(j.names, { I1: 'Oru Vale' });
  assert.deepEqual(j.gift, { no: 2, slot: 'I1' });
});
