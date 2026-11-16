// tests/atlas.test.mjs: the atlas map drawing and the card's tabs, with a recording 2D context
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawMap, mapView, toMap } from '../src/atlas/map.js';
import { layout, hitAt, TABS } from '../src/atlas/layout.js';
import { founders } from '../src/world/founders.js';
import { createChart } from '../src/world/chart.js';

// a 2D context that records what was drawn
const recorder = () => {
  const calls = [];
  return new Proxy({ calls }, {
    get: (t, k) => (k in t ? t[k] : (...a) => { calls.push([k, ...a]); return k === 'measureText' ? { width: 10 } : undefined; }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
};
const hands = founders().map((f, i) => ({ ...f, id: `h${i}` }));

test('every Hand is drawn as an outline and labelled with its name', () => {
  const g = recorder();
  drawMap(g, { hands, chart: createChart(null), me: { pos: [0, 0, 9000], yaw: 0 }, others: [], view: mapView(hands, 1000, 800), w: 1000, h: 800 });
  const names = g.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
  for (const h of hands) assert.ok(names.includes(h.name.toUpperCase()), `label for ${h.name}`);
  assert.ok(g.calls.filter((c) => c[0] === 'closePath').length >= hands.length, 'an outline per Hand');
});
test('an empty world still draws (legend, compass), no throw', () => {
  const g = recorder();
  assert.doesNotThrow(() => drawMap(g, { hands: [], chart: createChart(null), me: { pos: [0, 0, 0], yaw: 0 }, others: [], view: mapView([], 400, 300), w: 400, h: 300 }));
  assert.ok(g.calls.some((c) => c[0] === 'fillText' && c[1] === 'N'), 'a compass rose');
});
test('the view fits every Hand; toMap puts the Source at the view centre when it is the centre', () => {
  const v = mapView(hands, 1000, 800);
  for (const h of hands) { const [x, y] = toMap(v, h.pose.x, h.pose.z, 1000, 800); assert.ok(x > 0 && x < 1000 && y > 0 && y < 800, h.name); }
  const [sx, sy] = toMap({ cx: 0, cz: 0, scale: 0.01 }, 0, 0, 1000, 800);
  assert.deepEqual([sx, sy], [500, 400]);
});
test('tabs: a tap on Journal opens the Journal', () => {
  const regions = layout('world');
  const j = regions.find((r) => r.id === 'tab:journal');
  assert.deepEqual(hitAt(regions, [j.x + 5, j.y + 5]), { type: 'tab', tab: 'journal' });
  assert.deepEqual(TABS, ['world', 'hand', 'garden', 'community', 'journal', 'how']);
  const tabs = regions.filter((r) => r.id.startsWith('tab:')), close = regions.find((r) => r.id === 'close');
  assert.ok(tabs.every((t, i) => i === 0 || t.x >= tabs[i - 1].x + tabs[i - 1].w) && tabs.at(-1).x + tabs.at(-1).w <= close.x, 'six tabs side by side, clear of the close button');
  assert.equal(hitAt(regions, [-5, -5]), null);
});
test('the timeline draws only the Hands laid by then', () => {
  const g = recorder(), later = hands.map((h, i) => ({ ...h, placed_at: i < 5 ? 100 : 200 }));
  drawMap(g, { hands: later, chart: createChart(null), me: { pos: [0, 0, 0], yaw: 0 }, others: [], view: mapView(later, 1000, 800), w: 1000, h: 800, until: 150 });
  const names = g.calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
  assert.ok(names.includes(later[0].name.toUpperCase()) && !names.includes(later[7].name.toUpperCase()));
});
