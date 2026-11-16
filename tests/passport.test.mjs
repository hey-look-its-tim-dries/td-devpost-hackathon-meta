// tests/passport.test.mjs: what you have met and done, kept on your device, and the profile page made from it
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPassport, profile, STATUS } from '../src/garden/passport.js';

const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
test('the passport counts who you met and what you did, and keeps it', () => {
  const s = memory(), p = createPassport(s);
  p.note('friend', 'Oruvel'); p.note('friend', 'Oruvel'); p.note('friend', 'Quosaira'); p.note('rival', 'Quosaira'); p.note('gnome', 'Bimble');
  p.note('friend', null); p.note('nonsense', 'x');
  p.sync({ eaten: 2, tends: 5, clouds: 1 }); p.sync({ eaten: 3, tends: 5, clouds: 1 }); // the game's running counts: only what is new is added
  const again = createPassport(s).data;
  assert.deepEqual(again.friends, { Oruvel: 2, Quosaira: 1 });
  assert.deepEqual(again.rivals, { Quosaira: 1 });
  assert.deepEqual(again.gnomes, { Bimble: 1 });
  assert.deepEqual([again.eaten, again.tends, again.clouds], [3, 5, 1]);
  const q = createPassport(s); q.sync({ eaten: 1, tends: 0, clouds: 0 }); // a new session counts from nought again
  assert.equal(q.data.eaten, 4);
  assert.doesNotThrow(() => createPassport(null).note('friend', 'x'), 'no storage: it lasts until you close the page');
});
test('the profile page: a status that grows with your level, your numbers, what you sowed most, who you know', () => {
  const species = [{ name: 'Poppy', kind: 'flower' }, { name: 'Oak', kind: 'tree' }, { name: 'Wren', kind: 'bird' }, { name: 'Fox', kind: 'animal' }, { name: 'Morel', kind: 'mushroom' }, { name: 'Bee', kind: 'insect' }, { name: 'Carp', kind: 'fish' }];
  const pass = { friends: { Oruvel: 2, Quosaira: 5 }, rivals: { Quosaira: 1 }, gnomes: { Bimble: 3, Todbo: 1 }, eaten: 4, tends: 9, clouds: 2 };
  const pr = profile({ pass, species, found: new Set([0, 1, 2, 3, 4]), level: 5, xp: 900, planted: { 0: 12, 1: 30 }, seeds: 44, charted: 17, sealed: 1, team: 2, converted: 1, hand: { name: 'Trusel', bits: 21 } });
  assert.equal(pr.status, STATUS[2]);
  assert.equal(pr.name, 'Trusel');
  const row = (label) => pr.rows.find((r) => r[0] === label)?.[1];
  assert.equal(row('Groves sown'), 42);
  assert.equal(row('Flowers, trees found'), '2 of 2');
  assert.equal(row('Animals met'), '2 of 4', 'birds, insects, fish and animals');
  assert.equal(row('Mushrooms found'), '1 of 1');
  assert.equal(row('Mushrooms eaten'), 4);
  assert.equal(row('Places charted'), 17);
  assert.equal(row('Gnomes on your team'), 2);
  assert.deepEqual(pr.sown, [{ sp: 1, n: 30 }, { sp: 0, n: 12 }], 'most sown first');
  assert.deepEqual(pr.friends[0], ['Quosaira', 5]);
  assert.deepEqual(pr.rivals, [['Quosaira', 1]]);
  assert.deepEqual(pr.gnomes[0], ['Bimble', 3]);
  assert.equal(profile({ pass: { friends: {}, rivals: {}, gnomes: {}, eaten: 0, tends: 0, clouds: 0 }, species, found: new Set(), level: 1, xp: 0, planted: {}, seeds: 30, charted: 0, sealed: 0, team: 0, converted: 0, hand: null }).name, 'A traveller');
});
