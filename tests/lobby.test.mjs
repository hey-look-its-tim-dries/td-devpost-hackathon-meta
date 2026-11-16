// tests/lobby.test.mjs: the lobby's facts, from what the game knows
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lobbyFacts, esc, face } from '../src/lobby.js';

test('who is flying now, who is away, and the world in numbers', () => {
  const f = lobbyFacts({
    hands: [{ name: 'Yanida', founder: true }, { name: 'Oruvel' }, { name: 'Trusel' }, { name: 'Matasu' }],
    flying: [{ name: 'Oruvel', x: 10, z: 20 }, { name: null, x: 0, z: 0 }], me: 'Trusel', groves: 1234, worldFlying: 7,
    gardeners: [{ name: 'Oruvel', n: 40 }], converters: [], news: [{ when: '2 min ago', text: 'Oruvel laid a Hand' }],
  });
  assert.deepEqual(f.online.map((p) => p.name), ['Trusel (you)', 'Oruvel', 'A traveller'], 'you first');
  assert.deepEqual(f.away, ['Matasu'], 'players with a Hand who are not here now; founders are not players');
  assert.equal(f.counts.find((c) => c[1] === 'FLYING NOW')[0], 7, 'the whole world, not only your room');
  assert.equal(f.counts.find((c) => c[1] === 'HANDS')[0], 4);
  assert.equal(f.counts.find((c) => c[1] === 'GROVES')[0], '1,234');
  assert.match(f.call, /Oruvel/, 'the invitation names someone who is flying');
  const alone = lobbyFacts({ hands: [], flying: [], me: null, groves: 0, worldFlying: 0, gardeners: [], converters: [], news: [] });
  assert.deepEqual(alone.online.map((p) => p.name), ['You']);
  assert.match(alone.call, /first/i);
  assert.equal(alone.counts.find((c) => c[1] === 'FLYING NOW')[0], 1, 'you count');
});
test('faces: a signed-in player\'s picture goes with their name; anything that is not a Google picture address is left out', () => {
  const pic = 'https://lh3.googleusercontent.com/a/ACg8ocK-abc_DEF=s96-c';
  assert.match(face('Oruvel', { Oruvel: pic }), /^<img [^>]*src="https:\/\/lh3\.googleusercontent\.com\/a\/ACg8ocK-abc_DEF=s96-c"/);
  assert.equal(face('Oruvel', { Oruvel: 'https://evil.test/x.png' }), '');
  assert.equal(face('Nobody', { Oruvel: pic }), '');
  assert.equal(face('Oruvel', null), '');
});
test('names from other players never become markup', () => {
  assert.equal(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(esc('Tom & "Jo"'), 'Tom &amp; &quot;Jo&quot;');
  assert.equal(esc(null), '');
});
