// tests/hints.test.mjs: how you play, said in the words of what you play with
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOVES, hintLine, hyperReady, firstHint } from '../src/garden/hints.js';

const KEYS = /\b(SPACE|Q\/E|F:|X clear|G sets|press F|[A-Z] [A-Z] turn)\b/;
test('in the headset nothing on screen names a key; on a screen the keys are named', () => {
  const idle = { gnome: null, fox: null, hyper: 0, charge: 0.4 }, ready = { ...idle, charge: 1 };
  const quest = { ...idle, gnome: { name: 'Bimble', kind: 'sow', have: 2, need: 5, left: 95, done: false } };
  for (const gd of [idle, ready, quest]) assert.ok(!KEYS.test(hintLine(gd, true)), hintLine(gd, true));
  assert.match(hintLine(ready, true), /LEFT PINCH/);
  assert.match(hintLine(ready, false), /F: HYPER SOW READY/);
  assert.match(hintLine(idle, false), /SPACE plant/);
  assert.match(hintLine(idle, true), /pinch/);
  assert.match(hintLine(idle, true), /40%/);
  assert.match(hintLine(quest, true), /BIMBLE WANTS: sow 2\/5 · 1:35 · toss a hand up/);
  assert.match(hintLine(quest, false), /G sets it down/);
  assert.ok(!/press F/.test(hyperReady(true)) && /press F/.test(hyperReady(false)));
  assert.ok(!KEYS.test(firstHint(true)) && /SPACE/.test(firstHint(false)));
});
test('the foxfire and a running hyper sow come before the hints; a finished quest steps aside', () => {
  const gd = { gnome: { name: 'Bimble', kind: 'sow', have: 5, need: 5, left: 60, done: true }, fox: { left: 12, mult: 2 }, hyper: 0, charge: 1 };
  assert.match(hintLine(gd, true), /^FOXFIRE · 12 s/);
  assert.match(hintLine({ ...gd, fox: null, hyper: 7 }, true), /^HYPER SOW · 7 s/);
});
test('the How page lists every move both ways, short enough for its card', () => {
  assert.ok(MOVES.length >= 10);
  for (const [what, hand, screen] of MOVES) { assert.ok(what && hand && (screen === null || screen), what); assert.ok(what.length <= 16 && hand.length <= 52 && (screen ?? '').length <= 22, `${what}: ${hand.length}`); }
  assert.ok(MOVES.some((m) => m[2] === null), 'some moves are the same with hands and with keys');
  for (const what of ['Fly', 'Sow', 'Scatter', 'Pour', 'Hyper sow', 'Clear a grove', 'Set a gnome down', 'Atlas']) assert.ok(MOVES.some((m) => m[0] === what), what);
});

test('the sow cue: it shines exactly when sowing would work (low over a Hand, seeds in the pouch)', async () => {
  const { sowReady } = await import('../src/garden/hints.js');
  assert.equal(sowReady({ onHand: true, alt: 120, seeds: 5 }), true);
  assert.equal(sowReady({ onHand: false, alt: 120, seeds: 5 }), false, 'the wilderness or a river is not sand');
  assert.equal(sowReady({ onHand: true, alt: 400, seeds: 5 }), false, 'too high: the seed would drift away');
  assert.equal(sowReady({ onHand: true, alt: 120, seeds: 0 }), false, 'nothing to sow');
});
