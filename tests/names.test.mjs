// tests/names.test.mjs: names from players, made safe before anything draws them (Review Focus 4)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, nameFor } from '../src/world/names.js';

test('cleanName strips control characters, trims and caps at 24', () => {
  assert.equal(cleanName('\u0007' + 'a'.repeat(40)), 'a'.repeat(24));
  assert.equal(cleanName('  Yanida \n'), 'Yanida');
  assert.equal(cleanName('a‮b'), 'ab', 'no bidi overrides');
});
test('cleanName refuses empties, non-strings and blocked words', () => {
  assert.equal(cleanName(''), null);
  assert.equal(cleanName('   '), null);
  assert.equal(cleanName(42), null);
  assert.equal(cleanName('xNaZIx'), null);
});
test('generated names are already clean', () => {
  for (let s = 1; s < 50; s++) assert.equal(cleanName(nameFor(s)), nameFor(s));
});

test('place names: the same seed gives the same name; summits get a landform word', async () => {
  const { placeName } = await import('../src/world/names.js');
  assert.equal(placeName(7, 'I1'), placeName(7, 'I1'));
  assert.notEqual(placeName(7, 'I1'), placeName(8, 'I1'));
  assert.match(placeName(7, 'summit:1'), / (Fell|Crown|Peak|Knoll|Cairn|Spire)$/);
  for (let s = 1; s < 30; s++) assert.equal(cleanName(placeName(s, 'P2')), placeName(s, 'P2'));
});

test('cleanName never splits an emoji in two (deferred minor)', () => {
  const n = cleanName('a'.repeat(23) + '🌊🌊');
  assert.equal(n, 'a'.repeat(23) + '🌊');
  assert.ok(!/[\ud800-\udbff]$/.test(n));
});
