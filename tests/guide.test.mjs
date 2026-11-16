// tests/guide.test.mjs: "Explain this game to me": everything, in order, in plain words
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUIDE, guideHtml } from '../src/guide.js';

test('the guide explains the whole game from the world to the gnomes, and how to do every move', () => {
  const titles = GUIDE.map((s) => s.title.toLowerCase()).join(' | ');
  for (const word of ['world', 'whorl', 'fly', 'seed', 'sow', 'water', 'bloom', 'hyper', 'storm', 'mushroom', 'gnome', 'players', 'hand', 'atlas', 'sign']) assert.ok(titles.includes(word), word);
  for (const s of GUIDE) { assert.ok(s.text.length >= 1 && s.text.every((p) => p.length > 20 && p.length < 420), s.title); }
  const html = guideHtml(true), keys = guideHtml(false);
  assert.match(html, /Pinch and hold/);
  assert.ok(!/hold SPACE/.test(html), 'in the headset the moves are hand movements');
  assert.match(keys, /hold SPACE/);
  assert.ok(html.indexOf('The world') < html.indexOf('Gnomes'), 'in order');
  assert.ok(!/<script/i.test(html));
});
