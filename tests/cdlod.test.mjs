// tests/cdlod.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectNodes } from '../src/world/cdlod.js';

const levelAt = (nodes, x, z) => nodes.filter((n) => x >= n.x && x < n.x + n.size && z >= n.z && z < n.z + n.size);

for (const cam of [[0, 300, 0], [1234, 40, -5678], [250000, 900, -800000]]) {
  test(`patches tile the ground exactly once around ${cam}`, () => {
    const { nodes, root } = selectNodes(cam);
    const area = nodes.reduce((s, n) => s + n.size * n.size, 0);
    assert.equal(area, root * root);
    for (let i = 0; i < 3000; i++) {
      const x = cam[0] + (((i * 7919) % 1000) / 1000 - 0.5) * root * 0.4, z = cam[2] + (((i * 104729) % 1000) / 1000 - 0.5) * root * 0.4;
      assert.equal(levelAt(nodes, x, z).length, 1, `at ${x}, ${z}`);
    }
  });
  test(`finest under you, coarser with distance, neighbours never more than one level apart, around ${cam}`, () => {
    const { nodes, ranges } = selectNodes(cam);
    // the finest level present lies under you (high above the land, level 0 isn't needed at all)
    assert.equal(levelAt(nodes, cam[0], cam[2])[0].level, Math.min(...nodes.map((n) => n.level)));
    if (cam[1] < 200) assert.equal(levelAt(nodes, cam[0], cam[2])[0].level, 0);
    assert.ok(nodes.length < 400, `${nodes.length} patches`);
    for (const n of nodes.filter((q) => !q.part)) { // quarters may reach past their level: their vertices morph fully
      const dx = Math.max(n.x - cam[0], 0, cam[0] - n.x - n.size), dz = Math.max(n.z - cam[2], 0, cam[2] - n.z - n.size);
      const dy = Math.max(-120 - cam[1], 0, cam[1] - 750);
      assert.ok(Math.hypot(dx, dy, dz) <= ranges[n.level] + 1e-6);
    }
    const step = 24;
    for (let i = -400; i < 400; i++) {
      const x = cam[0] + i * step, z = cam[2] + ((i * 37) % 200) * step;
      const a = levelAt(nodes, x, z)[0], b = levelAt(nodes, x + step, z)[0], c = levelAt(nodes, x, z + step)[0];
      if (a && b) assert.ok(Math.abs(a.level - b.level) <= 1);
      if (a && c) assert.ok(Math.abs(a.level - c.level) <= 1);
    }
  });
}
