// tests/icons.test.mjs: the icon set, and that everything that names an icon names one that exists
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ICONS, icon, FOXFIRE_DEFS } from '../src/ui/icons.js';
import { GUIDE } from '../src/guide.js';
import { STEPS } from '../src/garden/tutorial.js';
import { MOVE_ICONS, MOVES } from '../src/garden/hints.js';

test('every icon is a path on the 24 grid; the markup takes the text\'s colour', () => {
  assert.ok(Object.keys(ICONS).length >= 30);
  for (const [name, d] of Object.entries(ICONS)) { assert.match(d, /^M[\d. -]/, name); assert.ok(d.length < 400 && !/[<>"]/.test(d), name); }
  assert.match(icon('sow'), /^<svg class="icon"[^>]*stroke="url\(#foxfire\)"[^>]*><path d="M12 21v-9/, 'drawn in the foxfire\'s light: cyan running into magenta');
  assert.match(FOXFIRE_DEFS, /<linearGradient id="foxfire"/);
  assert.equal(icon('nonsense'), '');
});
test('the guide\'s chapters, the tutorial\'s steps, every move and the pages all name icons that exist', () => {
  for (const s of GUIDE) assert.ok(ICONS[s.icon], `guide: ${s.title}`);
  for (const s of STEPS) assert.ok(ICONS[s.icon], `tutorial: ${s.id}`);
  assert.equal(MOVE_ICONS.length, MOVES.length);
  for (const n of MOVE_ICONS) assert.ok(ICONS[n], n);
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8'), used = [...html.matchAll(/data-icon="([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(used.length >= 14, 'the title and the lobby carry icons');
  for (const n of used) assert.ok(ICONS[n], `index.html: ${n}`);
});
