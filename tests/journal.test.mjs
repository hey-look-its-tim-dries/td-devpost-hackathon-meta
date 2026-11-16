// tests/journal.test.mjs: the world's history in words, and watersheds from confluences
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { journalText, watersheds, when } from '../src/journal.js';

test('each event reads as a line of the journal', () => {
  assert.equal(journalText({ kind: 'laid', data: { name: 'Firath', next: ['Saelo'] } }), 'Firath joined the world, next to Saelo');
  assert.equal(journalText({ kind: 'laid', data: { name: 'Firath', next: [] } }), 'Firath joined the world');
  assert.equal(journalText({ kind: 'confluence', data: { name: 'Firath', with: 'Cadio' } }), "Firath's rivers now reach Cadio");
  assert.equal(journalText({ kind: 'named', data: { name: 'Oru Vale', hand: 'Yanida' } }), 'Oru Vale was named on Yanida');
  assert.equal(journalText({ kind: 'donated', data: { name: 'Firath', slot: 'I1', no: 2 } }), 'Firath gave I1 to Community Hand 2');
  assert.equal(journalText({ kind: 'sealed', data: { no: 2 } }), 'Community Hand 2 was sealed');
  assert.equal(journalText({ kind: 'washed', data: { name: 'Firath' } }), 'Firath washed their hands');
  assert.equal(journalText({ kind: 'weird', data: null }), null);
});
test('watersheds: Hands joined by rivers share a system; lone Hands have none', () => {
  const w = watersheds([['a', 'b'], ['b', 'c'], ['d', 'e']]);
  assert.equal(w.a, w.c);
  assert.notEqual(w.a, w.d);
  assert.equal(w.d, w.e);
  assert.equal(w.z, undefined);
});
test('when: minutes, hours, days ago', () => {
  const now = Date.UTC(2026, 10, 15, 12);
  assert.equal(when(now - 30e3, now), 'just now');
  assert.equal(when(now - 5 * 60e3, now), '5 min ago');
  assert.equal(when(now - 3 * 3600e3, now), '3 h ago');
  assert.equal(when(now - 2 * 86400e3, now), '2 days ago');
});
test('the journal tells of blooms and golden seeds', () => {
  assert.equal(journalText({ kind: 'bloomed', data: { hand: 'Oruvel', bit: 3 } }), 'A plot of Oruvel came into bloom');
  assert.equal(journalText({ kind: 'golden', data: { name: 'Tilde' } }), 'Tilde caught the golden seed');
});
