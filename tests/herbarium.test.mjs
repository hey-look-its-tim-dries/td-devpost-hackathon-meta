// tests/herbarium.test.mjs: the herbarium tab says what you found and lets you pick a seed you carry
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paintHerbarium, PER_PAGE } from '../src/garden/herbarium.js';
import { layout, hitAt, TABS, LAYERS } from '../src/atlas/layout.js';

const species = Array.from({ length: 150 }, (_, id) => ({ id, name: `Bloom ${id}`, latin: 'Flos test', kind: id < 130 ? 'flower' : 'bird', habitat: 'dune', rarity: 1 + (id % 4), color: '#ff0000', color2: '#00ff00' }));
const fake = () => { const texts = []; const g = new Proxy({}, { get: (_, k) => (k === 'texts' ? texts : () => {}), set: () => true }); return { g, texts, text: (t) => texts.push(t), button: (id, x, y, w, h) => regions.push({ id, x, y, w, h }) }; };
let regions = [];
test('found species are named, the others are blanks; only seeds you carry can be picked; pages turn', () => {
  regions = [];
  const f = fake(), st = { species, found: new Set([0, 1, 2]), has: (id) => (id === 1 ? 4 : 0), icon: () => null, style: () => 'paint', selected: 1, kind: 'flower', page: 0 };
  const r = paintHerbarium(f.g, regions, f, st);
  assert.equal(r.pages, Math.ceil(130 / PER_PAGE));
  assert.ok(f.texts.includes('Bloom 1') && f.texts.includes('Bloom 2'));
  assert.ok(!f.texts.includes('Bloom 7'), 'what you have not found stays a blank');
  assert.deepEqual(regions.filter((q) => q.id.startsWith('seed:')).map((q) => q.id), ['seed:1']);
  assert.ok(regions.some((q) => q.id === 'kind:bird') && regions.some((q) => q.id === 'page:next'));
  assert.deepEqual(hitAt(regions, [regions.find((q) => q.id === 'seed:1').x + 5, regions.find((q) => q.id === 'seed:1').y + 5]), { type: 'seed', arg: '1' });
  assert.deepEqual(hitAt(regions, [35, 110]), { type: 'kind', arg: 'flower' });
});
test('the atlas has a Garden tab and a bloom layer', () => {
  assert.ok(TABS.includes('garden') && LAYERS.includes('bloom'));
  const tabs = layout('garden').filter((q) => q.id.startsWith('tab:'));
  assert.ok(tabs.every((q) => q.x + q.w <= 1096), 'the tabs leave room for the close button');
});
