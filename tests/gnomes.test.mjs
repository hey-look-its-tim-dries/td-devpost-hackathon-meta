// tests/gnomes.test.mjs: gnomes: where they live, what they do, their quests, their teams
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GNOME, HATS, isHome, gnomeAt, activity, shout, questFor, advance, afterQuest, afterAnnoy, withRiders, splitRiders } from '../src/gnomes/gnomes.js';
import { fromSignature } from '../src/garden/bouquet.js';

const S = [{ kind: 'flower' }, { kind: 'mushroom' }];
test('gnomes live in mushrooms: dead groves and planted mushrooms in fruit; about four in ten; never a temporary grove', () => {
  assert.equal(isHome({ id: 5, sp: 0, stage: 3, dry: 2 }, S), true, 'a dead grove: wild mushrooms');
  assert.equal(isHome({ id: 5, sp: 1, stage: 3, dry: 0 }, S), true, 'a planted mushroom in fruit');
  assert.equal(isHome({ id: 5, sp: 1, stage: 2, dry: 0 }, S), false, 'not yet in fruit');
  assert.equal(isHome({ id: 5, sp: 0, stage: 3, dry: 0 }, S), false, 'a flower');
  assert.equal(isHome({ id: -3, sp: 0, stage: 0, dry: 2 }, S), false);
  const homes = Array.from({ length: 1000 }, (_, i) => gnomeAt({ id: i + 1, sp: 0, stage: 0, dry: 2 }, S)).filter(Boolean);
  assert.ok(homes.length > 300 && homes.length < 460, `not common, not rare: ${homes.length} of 1000`);
  assert.deepEqual(gnomeAt({ id: homes[0].id, sp: 0, stage: 0, dry: 2 }, S), homes[0], 'the same gnome for everyone');
  assert.ok(new Set(homes.map((g) => g.name)).size > 60, 'many names');
  assert.ok(homes.every((g) => /^[A-Z][a-z]+$/.test(g.name) && g.hat >= 0 && g.hat < HATS.length));
});
test('what a gnome is doing comes from the clock: the same for everyone, changing through the day', () => {
  assert.equal(activity(7, 1_000_000), activity(7, 1_000_500));
  const seen = new Set(Array.from({ length: 200 }, (_, i) => activity(7, i * 20000)));
  assert.deepEqual([...seen].sort(), ['potter', 'ride', 'sit', 'sleep']);
  assert.equal(typeof shout('buzz', 3), 'string');
  assert.notEqual(shout('greet', 1, 0), shout('greet', 1, 1), 'not the same line twice running');
});
test('a side quest a day, made from what the world has; it knows when it is done', () => {
  const g = { id: 9, seed: 1234 }, world = { hands: [{ name: 'Oruvel', x: 5000, z: 0 }], homes: [{ id: 9, name: 'Self', x: 0, z: 0 }, { id: 11, name: 'Pipgle', x: 800, z: 800 }] };
  assert.deepEqual(questFor(g, 20000, world), questFor(g, 20000, world));
  const kinds = new Set(Array.from({ length: 300 }, (_, d) => questFor(g, d, world).kind));
  for (const k of ['source', 'hand', 'cousin', 'foxfire', 'sow', 'water', 'speed', 'high', 'cloud', 'river']) assert.ok(kinds.has(k), k);
  assert.ok(!new Set(Array.from({ length: 300 }, (_, d) => questFor(g, d, {}).kind)).has('hand'), 'no Hand quest in a world without Hands');
  const day = (kind) => Array.from({ length: 400 }, (_, d) => questFor(g, d, world)).find((q) => q.kind === kind);
  let q = day('sow');
  for (let i = 0; i < 4; i++) q = advance(q, { type: 'sow' });
  assert.equal(q.done, false);
  assert.equal(advance(q, { type: 'tend' }), q, 'watering is not sowing');
  assert.equal(advance(q, { type: 'sow' }).done, true);
  q = day('cousin');
  assert.match(q.text, /Pipgle/);
  assert.ok(!advance(q, { type: 'at', x: 0, z: 0 }).done);
  assert.equal(advance(q, { type: 'at', x: 790, z: 810 }).done, true);
  assert.equal(advance(day('speed'), { type: 'speed', v: 650 }).done, undefined);
  assert.equal(advance(day('speed'), { type: 'speed', v: 720 }).done, true);
  let r = day('river');
  r = advance(r, { type: 'wet', dt: 2 });
  assert.ok(!r.done);
  assert.equal(advance(r, { type: 'wet', dt: 1.5 }).done, true);
  assert.equal(advance(day('foxfire'), { type: 'fox' }).done, true);
});
test('teams: a quest wins a wild gnome, deepens your own, and turns another gardener\'s once its loyalty is low', () => {
  assert.deepEqual(afterQuest(null, 'me'), { owner: 'me', loyalty: 2, event: 'joined' });
  assert.deepEqual(afterQuest({ owner: 'me', loyalty: 2 }, 'me'), { owner: 'me', loyalty: 3, event: 'loyal' });
  assert.equal(afterQuest({ owner: 'me', loyalty: GNOME.loyal }, 'me').loyalty, GNOME.loyal);
  assert.deepEqual(afterQuest({ owner: 'you', loyalty: 4 }, 'me'), { owner: 'you', loyalty: 2, event: 'wavering' });
  assert.deepEqual(afterQuest({ owner: 'you', loyalty: 2 }, 'me'), { owner: 'me', loyalty: 2, event: 'converted' });
});
test('annoying a gnome: a wild one grumbles; another gardener\'s loses heart and in the end deserts them', () => {
  assert.equal(afterAnnoy(null, 'me').event, 'grumpy');
  assert.deepEqual(afterAnnoy({ owner: 'you', loyalty: 2 }, 'me'), { owner: 'you', loyalty: 1, event: 'grumpy' });
  assert.deepEqual(afterAnnoy({ owner: 'you', loyalty: 1 }, 'me'), { owner: null, loyalty: 0, event: 'deserted' });
});
test('gnomes on board travel in the bouquet\'s signature and come out again; the flowers are untouched', () => {
  const sig = [5, 10, 9, 20], out = withRiders(sig, [2, 4]);
  assert.deepEqual(out, [5, 10, 9, 20, 4095, 2, 4095, 4]);
  assert.deepEqual(splitRiders(out), { sig, hats: [2, 4] });
  assert.equal(fromSignature(splitRiders(out).sig).length, 2);
  assert.ok(withRiders(Array.from({ length: 48 }, (_, i) => i), [1, 2, 3, 4, 5]).length <= 48, 'never longer than the room allows');
  assert.equal(splitRiders(withRiders([], [1, 2, 3, 4, 5])).hats.length, GNOME.max);
  assert.deepEqual(splitRiders('junk'), { sig: [], hats: [] });
});

import { pose, CLIPS } from '../src/gnomes/pose.js';
test('every pose is a full set of finite joint angles, and reads as what it is', () => {
  for (const clip of [...CLIPS, 'idle']) for (const t of [0, 0.37, 2.2]) { const p = pose(clip, t, 5); for (const k of ['y', 'tilt', 'roll', 'headX', 'headY', 'armLx', 'armLz', 'armRx', 'armRz', 'legL', 'legR']) assert.ok(Number.isFinite(p[k]), `${clip}.${k}`); }
  assert.ok(pose('wave', 0.1).armRz > 1.8 && Math.abs(pose('wave', 0.1).armLz) < 0.6, 'one arm high');
  assert.ok(pose('hang', 1).armLz < -2.5 && pose('hang', 1).armRz > 2.5, 'both arms overhead');
  const a = pose('potter', 0.1), b = pose('potter', 0.1 + Math.PI / 9);
  assert.ok(Math.sign(a.legL) === -Math.sign(a.legR) && Math.sign(a.legL) === -Math.sign(b.legL), 'legs alternate');
  assert.ok(pose('sit', 1).legL < -1 && pose('sleep', 1).headX > 0.3, 'sitting with legs out; asleep with the head down');
  assert.notDeepEqual(pose('wave', 0.1), pose('wave', 0.2), 'it moves');
  assert.ok(pose('jump', 1).armRz > 2.5 && pose('jump', 0).armRz === 0, 'the leap reaches up');
});

test('a quest never asks for a place you are already at: targets are a good way from the gnome\'s own mushroom', () => {
  const g = { id: 9, seed: 1234 }, from = { x: 100, z: 100 };
  const world = { from, hands: [{ name: 'Here', x: 300, z: 0 }, { name: 'Far', x: 9000, z: 0 }], homes: [{ id: 11, name: 'Nextdoor', x: 230, z: 100 }, { id: 12, name: 'Faraway', x: 100, z: 2100 }] };
  const all = Array.from({ length: 600 }, (_, d) => questFor(g, d, world));
  assert.ok(all.filter((q) => q.kind === 'hand').every((q) => /Far/.test(q.text)), 'never the Hand it lives on');
  assert.ok(all.filter((q) => q.kind === 'cousin').every((q) => /Faraway/.test(q.text)), 'never the gnome next door');
  assert.ok(all.some((q) => q.kind === 'hand') && all.some((q) => q.kind === 'cousin'));
  const atSource = Array.from({ length: 600 }, (_, d) => questFor(g, d, { from: { x: 50, z: 50 }, hands: [], homes: [] }));
  assert.ok(!atSource.some((q) => q.kind === 'source'), 'a gnome that lives at the Source does not ask to go there');
  for (const q of all) if (q.r) assert.ok(Math.hypot(q.x - from.x, q.z - from.z) > q.r + 200, `${q.kind} is not done on the spot`);
});
