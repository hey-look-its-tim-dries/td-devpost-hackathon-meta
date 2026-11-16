// tests/voice.test.mjs: the old gnome's lines and when he says them
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LINES, relDir, createSpeaker } from '../src/garden/voice.js';
import { STEPS } from '../src/garden/tutorial.js';
import { FIRSTS } from '../src/garden/firsts.js';

test('he has a line for every tutorial step and every what-is-what note, short enough to say in one breath', () => {
  for (const s of STEPS) assert.ok(LINES[`tut-${s.id}`], s.id);
  for (const n of FIRSTS) assert.ok(LINES[`what-${n.id}`], n.id);
  assert.ok(Object.keys(LINES).length >= 55);
  for (const [id, text] of Object.entries(LINES)) { assert.match(id, /^[a-z0-9-]+$/, id); assert.ok(text.length >= 6 && text.length <= 110, `${id}: ${text.length}`); }
});
test('which way: ahead, right, behind or left of where you are flying', () => {
  assert.equal(relDir(0, 0, 0, 0, -500), 'ahead', 'yaw 0 looks along -z');
  assert.equal(relDir(0, 0, 0, 500, 0), 'right');
  assert.equal(relDir(0, 0, 0, -500, 0), 'left');
  assert.equal(relDir(0, 0, 0, 0, 500), 'behind');
  assert.equal(relDir(0, 0, Math.PI / 2, -500, 0), 'ahead', 'turned a quarter to the left, west is ahead');
  assert.equal(relDir(100, 100, Math.PI, 100, 900), 'ahead');
});
test('he does not talk over himself, and does not repeat a line until it has rested', () => {
  const s = createSpeaker({ rest: 45 });
  assert.equal(s.may(0, 'welcome', 5), true);
  assert.equal(s.may(2, 'what-hand', 3), false, 'still speaking');
  assert.equal(s.may(6, 'what-hand', 3), true);
  assert.equal(s.may(20, 'what-hand', 3), false, 'said not long ago');
  assert.equal(s.may(60, 'what-hand', 3), true);
  assert.equal(s.may(70, ['nearest-hand', 'left'], 3, 15), true);
  assert.equal(s.may(80, ['nearest-hand', 'left'], 3, 15), false);
  assert.equal(s.may(80, ['nearest-hand', 'right'], 3, 15), true, 'another direction is another thing to say');
});

test('he has many ways to say a thing: pickLine takes one at random, never the last one again; every variant is a line', async () => {
  const { LINES, MORE, MUSINGS, pickLine } = await import('../src/garden/voice.js');
  assert.ok(MUSINGS.length >= 90 && Object.keys(LINES).length >= 220);
  for (const [id, alts] of Object.entries(MORE)) { assert.ok(LINES[id], id); alts.forEach((_, i) => assert.ok(LINES[`${id}-v${i + 1}`])); }
  assert.equal(pickLine('welcome'), 'welcome'); // only one way to say it
  let was = 'ahead';
  for (let i = 0; i < 40; i++) { const now = pickLine('ahead', was); assert.notEqual(now, was); assert.ok(LINES[now]); was = now; }
  assert.equal(new Set(Object.values(LINES)).size, Object.keys(LINES).length, 'no two lines the same');
});
