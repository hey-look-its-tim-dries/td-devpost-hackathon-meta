import test from 'node:test';
import assert from 'node:assert/strict';
import { worldCells, nearest } from '../src/world/worldcells.js';

// a 10 x 10 square whose middle 6 x 6 is hand
const lab = { w: 10, h: 10, label: Array.from({ length: 100 }, (_, i) => (i % 10 >= 2 && i % 10 < 8 && i >= 20 && i < 80 ? 0 : -1)) };
test('the whole world in one hand: every sowing lands on a hand cell in its own colour, north higher up', () => {
  const cells = worldCells([[0, 0, '#ff0000'], [0, -9000, '#00ff00'], [9400, 9400, '#0000ff'], [-50000, 0, '#ffffff']], 9500, lab);
  assert.equal(cells.size, 4);
  for (const i of cells.keys()) assert.ok(lab.label[i] >= 0, 'even a sowing outside the outline, or outside the world, lands on the hand');
  const at = (color) => [...cells].find(([, c]) => c === color)[0];
  assert.ok(at('#00ff00') > at('#ff0000'), 'north (-z) is a later row');
  assert.equal(worldCells([[10, -10, '#111111'], [12, -9, '#222222']], 9500, lab).get(at('#ff0000')), '#222222', 'two sowings in one spot share a cell: the later colour');
  assert.equal(nearest(lab)[0], 22, 'a corner goes to the nearest hand cell');
});
