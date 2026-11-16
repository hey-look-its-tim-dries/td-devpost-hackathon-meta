// tests/species.test.mjs: the species index is data other code and the server lean on, so its shape is pinned
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES, FLORA, STARTERS, byKind } from '../src/garden/species.js';

const MIN = { flower: 220, tree: 100, bird: 70, insect: 30, fish: 30, animal: 30, mushroom: 20 };
const FORMS = {
  mushroom: ['cap'],
  flower: ['daisy', 'tulip', 'bell', 'spike', 'umbel', 'rosette'],
  tree: ['round', 'cone', 'palm', 'umbrella', 'column', 'cactus'],
  bird: ['songbird', 'raptor', 'wader', 'hummer'],
  insect: ['butterfly', 'dragonfly', 'bee'],
  fish: ['fish'],
  animal: ['antelope', 'fox', 'camel', 'giraffe', 'tortoise', 'hare'],
};
const HABITATS = ['dune', 'bank', 'ridge'];
const HEX = /^#[0-9a-f]{6}$/;

test('there are enough species of every kind', () => {
  for (const [kind, min] of Object.entries(MIN)) assert.ok(byKind(kind).length >= min, `${kind}: ${byKind(kind).length} of at least ${min}`);
  assert.ok(SPECIES.length >= 480);
  assert.equal(Object.keys(MIN).reduce((n, kind) => n + byKind(kind).length, 0), SPECIES.length, 'no species of an unknown kind');
});

test('the id of a species is its index', () => {
  SPECIES.forEach((s, i) => assert.equal(s.id, i));
});

test('names and latin names are unique', () => {
  for (const key of ['name', 'latin']) {
    const seen = new Map();
    for (const s of SPECIES) {
      const v = s[key].trim().toLowerCase();
      assert.ok(v.length > 0, `species ${s.id} has no ${key}`);
      assert.ok(!seen.has(v), `${key} "${s[key]}" is used by ${seen.get(v)} and ${s.id}`);
      seen.set(v, s.id);
    }
  }
});

test('latin names are binomials', () => {
  for (const s of SPECIES) assert.match(s.latin, /^[A-Z][a-z]+ [a-z-]+$/, s.name);
});

test('every form belongs to its kind', () => {
  for (const s of SPECIES) {
    assert.ok(FORMS[s.kind], `${s.name}: unknown kind ${s.kind}`);
    assert.ok(FORMS[s.kind].includes(s.form), `${s.name}: ${s.form} is not a ${s.kind} form`);
  }
});

test('habitats and rarities are valid', () => {
  for (const s of SPECIES) {
    assert.ok(HABITATS.includes(s.habitat), `${s.name}: habitat ${s.habitat}`);
    assert.ok([1, 2, 3, 4].includes(s.rarity), `${s.name}: rarity ${s.rarity}`);
  }
});

test('every kind has every rarity, and plants and birds live in every habitat', () => {
  for (const kind of Object.keys(MIN)) for (const r of [1, 2, 3, 4]) assert.ok(byKind(kind).some((s) => s.rarity === r), `${kind} of rarity ${r}`);
  for (const kind of ['flower', 'tree', 'bird', 'insect', 'animal']) for (const h of HABITATS) assert.ok(byKind(kind).some((s) => s.habitat === h), `${kind} on the ${h}`);
});

test('colours are lowercase hex and sizes are between 0.5 and 2', () => {
  for (const s of SPECIES) {
    assert.match(s.color, HEX, `${s.name}: color`);
    assert.match(s.color2, HEX, `${s.name}: color2`);
    assert.equal(typeof s.size, 'number', `${s.name}: size`);
    assert.ok(s.size >= 0.5 && s.size <= 2, `${s.name}: size ${s.size}`);
    assert.equal(Math.round(s.size * 10) / 10, s.size, `${s.name}: size has one decimal`);
  }
});

test('FLORA is exactly the flowers and trees, in id order', () => {
  assert.deepEqual(FLORA, SPECIES.filter((s) => s.kind === 'flower' || s.kind === 'tree').map((s) => s.id));
  assert.equal(FLORA.length, byKind('flower').length + byKind('tree').length);
});

test('byKind filters the index', () => {
  assert.ok(byKind('bird').every((s) => s.kind === 'bird'));
  assert.deepEqual(byKind('dragon'), []);
});

test('the starters are three common flora, one per habitat', () => {
  assert.equal(STARTERS.length, 3);
  assert.equal(new Set(STARTERS).size, 3);
  for (const id of STARTERS) {
    assert.ok(FLORA.includes(id), `starter ${id} is flora`);
    assert.equal(SPECIES[id].rarity, 1, `${SPECIES[id].name} is common`);
  }
  assert.deepEqual(STARTERS.map((id) => SPECIES[id].habitat).sort(), ['bank', 'dune', 'ridge']);
});

test('fish live beside water', () => {
  for (const s of byKind('fish')) assert.equal(s.habitat, 'bank', s.name);
});
