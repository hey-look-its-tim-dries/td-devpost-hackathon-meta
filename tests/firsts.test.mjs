// tests/firsts.test.mjs: "what is what", said once, the first time you meet each thing
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIRSTS, createFirsts } from '../src/garden/firsts.js';

const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
const st = (o = {}) => ({ onHand: false, onWater: false, cloud: false, mushroom: false, gnome: false, player: false, storm: false, gold: false, bloom: 0, ...o });
const run = (f, s, seconds) => { let last = null; for (let i = 0; i < seconds * 10; i++) last = f.update(s, 0.1); return last; };
test('everything a new player meets has its note: the screen, the land, seeds, mushrooms, gnomes, players, the storm', () => {
  const ids = FIRSTS.map((n) => n.id);
  for (const id of ['screen', 'hand', 'river', 'wilderness', 'cloud', 'mushroom', 'gnome', 'player', 'storm', 'gold', 'bloom']) assert.ok(ids.includes(id), id);
  for (const n of FIRSTS) assert.ok(n.title.length <= 28 && n.text.length <= 110, `${n.id} fits its card (${n.text.length})`);
});
test('a note comes when you first meet the thing, one at a time, stays a few seconds, and never comes again', () => {
  const s = memory(), f = createFirsts(s);
  assert.equal(run(f, st(), 1), null, 'not in the very first second');
  assert.equal(run(f, st(), 3).id, 'screen', 'first of all: what is on your screen');
  assert.equal(run(f, st({ onHand: true, cloud: true }), 4).id, 'screen', 'it stays while you read');
  let seen = [];
  for (let i = 0; i < 600; i++) { const n = f.update(st({ onHand: true, cloud: true }), 0.1); if (n && seen.at(-1) !== n.id) seen.push(n.id); }
  assert.deepEqual(seen, ['screen', 'hand', 'cloud'], 'then what is under you, then what is near, each once');
  assert.equal(run(f, st({ onHand: true, cloud: true }), 30), null, 'and then silence');
  assert.equal(run(f, st({ onWater: true }), 4).id, 'river', 'until something new');
  const again = createFirsts(s);
  assert.equal(run(again, st({ onHand: true, cloud: true, onWater: true }), 30), null, 'what you have been told stays told, also next time');
  assert.equal(run(again, st({ gnome: true, onHand: true }), 4).id, 'gnome');
  assert.equal(again.left, FIRSTS.length - 5);
});
test('it can be switched off, and without storage it still works for the visit', () => {
  const f = createFirsts(memory(), { off: true });
  assert.equal(run(f, st({ onHand: true }), 20), null);
  assert.equal(run(createFirsts(null), st(), 4).id, 'screen');
});
