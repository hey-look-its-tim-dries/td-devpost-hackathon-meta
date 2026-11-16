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
test('gnomes on board travel in the bouquet\'s signature, each with its hat and the mushroom it left; the flowers are untouched', () => {
  const sig = [5, 10, 9, 20], riders = [{ hat: 2, id: 70000 }, { hat: 4, id: 5 }], out = withRiders(sig, riders);
  assert.deepEqual(out, [5, 10, 9, 20, 65535, 2, 65534, 70000 & 65535, 65533, 70000 >>> 16, 65535, 4, 65534, 5, 65533, 0]);
  assert.deepEqual(splitRiders(out), { sig, riders });
  assert.equal(fromSignature(splitRiders(out).sig).length, 2);
  const full = withRiders(Array.from({ length: 48 }, (_, i) => i), [1, 2, 3, 4, 5].map((hat) => ({ hat, id: 16000000 + hat })));
  assert.ok(full.length <= 48 && full.every((v) => Number.isInteger(v) && v >= 0 && v < 65536), 'never longer, never larger than the room allows');
  assert.equal(splitRiders(full).riders.length, GNOME.max);
  assert.deepEqual(splitRiders(full).riders[0], { hat: 1, id: 16000001 });
  assert.deepEqual(splitRiders([5, 10, 65535, 3]), { sig: [5, 10], riders: [{ hat: 3, id: 0 }] }, 'a rider with no home told still rides');
  assert.deepEqual(splitRiders('junk'), { sig: [], riders: [] });
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

import { lostGnome } from '../src/gnomes/gnomes.js';
test('the room tells you when a gnome leaves your team: converted by another gardener, or driven off', () => {
  const mine = { tag: 'me', owner: 'you', loyalty: 2 };
  assert.equal(lostGnome(mine, 'me', [7, 'them', 'Quosaira', 2, 'converted']), 'Quosaira converted one of your gnomes');
  assert.equal(lostGnome(mine, 'me', [7, null, null, 0, 'deserted']), 'One of your gnomes deserted: someone annoyed it once too often');
  assert.equal(lostGnome(mine, 'me', [7, 'me', 'you', 3, 'loyal']), null, 'still yours');
  assert.equal(lostGnome({ tag: 'them', owner: 'Quosaira', loyalty: 2 }, 'me', [7, null, null, 0, 'deserted']), null, 'it was never yours');
  assert.equal(lostGnome(undefined, 'me', [7, 'them', 'Quosaira', 2, 'joined']), null, 'a wild gnome joining someone is no loss');
  assert.equal(lostGnome(mine, null, [7, 'them', 'Quosaira', 2, 'converted']), null, 'before you know who you are, nothing is yours');
});
test('gnomes hop on at any speed short of a roar: one threshold, below it they grab on, at it they are cross', () => {
  assert.equal(GNOME.pickup.speed, GNOME.buzz.speed);
  assert.ok(GNOME.pickup.speed > 340 * 1.35, 'the foxfire\'s push (a third over cruise) still picks gnomes up');
});

import { gainedGnome } from '../src/gnomes/gnomes.js';
test('the room also tells you when a gnome comes over to you, so your count is right even when the map\'s own answer got lost', () => {
  assert.equal(gainedGnome(undefined, 'me', [7, 'me', 'You', 2, 'joined']), 'joined');
  assert.equal(gainedGnome({ tag: 'them' }, 'me', [7, 'me', 'You', 2, 'converted']), 'converted');
  assert.equal(gainedGnome({ tag: 'me' }, 'me', [7, 'me', 'You', 3, 'loyal']), null, 'it was yours already');
  assert.equal(gainedGnome(undefined, 'me', [7, 'them', 'Quosaira', 2, 'joined']), null, 'someone else\'s gain');
  assert.equal(gainedGnome(undefined, null, [7, 'me', 'You', 2, 'joined']), null, 'before you know who you are');
});

test('a quest can be asked for by kind (the film and the checks do), if the world has what it needs', () => {
  const g = { id: 9, seed: 1234 }, world = { hands: [{ name: 'Oruvel', x: 5000, z: 0 }], homes: [] };
  for (let d = 0; d < 40; d++) assert.equal(questFor(g, d, { ...world, kind: 'foxfire' }).kind, 'foxfire');
  assert.match(questFor(g, 3, { ...world, kind: 'hand' }).text, /Oruvel/);
  const noCousins = Array.from({ length: 40 }, (_, d) => questFor(g, d, { ...world, kind: 'cousin' }).kind);
  assert.ok(!noCousins.includes('cousin'), 'no cousin to visit: the day\'s own quest instead');
  assert.deepEqual(questFor(g, 5, { ...world, kind: 'nonsense' }), questFor(g, 5, world));
});

import { questEvents } from '../src/gnomes/gnomes.js';
test('what a gnome on board sees is what happens while it is on board: being in the foxfire already is not eating a mushroom', () => {
  const was = { sown: 3, tends: 1, clouds: 0, eaten: 2 }, now = { sown: 5, tends: 1, clouds: 1, eaten: 2 };
  const ev = questEvents(was, now, { x: 10, z: 20, speed: 400, alt: 300, wet: false, dt: 0.1 });
  assert.equal(ev.filter((e) => e.type === 'sow').length, 2);
  assert.equal(ev.filter((e) => e.type === 'cloud').length, 1);
  assert.equal(ev.filter((e) => e.type === 'tend').length, 0);
  assert.equal(ev.filter((e) => e.type === 'fox').length, 0, 'no mushroom eaten since');
  assert.deepEqual(ev.find((e) => e.type === 'at'), { type: 'at', x: 10, z: 20 });
  assert.deepEqual(ev.find((e) => e.type === 'speed'), { type: 'speed', v: 400 });
  assert.deepEqual(ev.find((e) => e.type === 'alt'), { type: 'alt', h: 300 });
  assert.equal(ev.some((e) => e.type === 'wet'), false);
  const fed = questEvents(now, { ...now, eaten: 3 }, { x: 0, z: 0, speed: 0, alt: 0, wet: true, dt: 0.5 });
  assert.equal(fed.filter((e) => e.type === 'fox').length, 1, 'a mushroom eaten now');
  assert.deepEqual(fed.find((e) => e.type === 'wet'), { type: 'wet', dt: 0.5 });
  let q = questFor({ id: 9, seed: 1234 }, 1, { kind: 'foxfire' });
  for (const e of ev) q = advance(q, e);
  assert.ok(!q.done);
  for (const e of fed) q = advance(q, e);
  assert.equal(q.done, true);
});

import { dangle, JOYS } from '../src/gnomes/gnomes.js';
test('a gnome on your whorl dangles: a hard turn swings it out and it wobbles back; wild flying is joy, and joy squeals now and then', () => {
  let d = { swing: 0, vel: 0, joy: 0, quiet: 0 }, squeals = 0, most = 0;
  const step = (input, seconds) => { for (let i = 0; i < seconds * 60; i++) { const r = dangle(d, input, 1 / 60); d = r.state; if (r.squeal) squeals++; most = Math.max(most, Math.abs(d.swing)); } };
  step({ turn: 0, speed: 340, climb: 0 }, 2);
  assert.ok(Math.abs(d.swing) < 0.05 && d.joy < 0.1 && squeals === 0, 'calm flight: it just hangs');
  step({ turn: 1.0, speed: 340, climb: 0 }, 1.2);
  assert.ok(most > 0.5, `a hard turn swings it out (${most.toFixed(2)})`);
  const side = Math.sign(d.swing);
  let crossed = false;
  for (let i = 0; i < 120; i++) { d = dangle(d, { turn: 0, speed: 340, climb: 0 }, 1 / 60).state; if (Math.sign(d.swing) === -side) crossed = true; }
  assert.ok(crossed, 'let go of the turn and it swings back past the middle: a pendulum, not a stick');
  step({ turn: 0, speed: 900, climb: -200 }, 6);
  assert.ok(d.joy > 0.8, 'a fast dive is joy');
  assert.ok(squeals >= 1 && squeals <= 3, `it squeals, but not all the time (${squeals} in 6 s)`);
  assert.ok(JOYS.length >= 8 && JOYS.every((s) => s.length <= 22));
});
