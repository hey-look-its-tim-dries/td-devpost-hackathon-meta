// tests/growth.test.mjs: the world can grow for ever, as long as these hold. Species are only ever ADDED, at the
// end of the list: a species' id is its place in the list, and every saved garden, pouch and map row points at it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SPECIES, FLORA, FUNGI, FORMS } from '../src/garden/species.js';
import { atlasRow, MAX_FLORA } from '../src/garden/paint.js';
import { MAX_SPECIES } from '../src/garden/bouquet.js';

const FROZEN = JSON.parse(fs.readFileSync(new URL('./species-ids.json', import.meta.url)));
test('append only: every species keeps its id for ever (add new ones at the END of ROWS in species.js)', () => {
  assert.ok(SPECIES.length >= FROZEN.length, 'a species was removed');
  FROZEN.forEach((latin, id) => assert.equal(SPECIES[id].latin, latin, `id ${id} moved: it was ${latin}`));
});
test('every species is complete and drawable: a known kind, habitat and form, rarity 1..4, colours, a size', () => {
  const latins = new Set();
  for (const s of SPECIES) {
    assert.ok(!latins.has(s.latin), `two species called ${s.latin}`); latins.add(s.latin);
    assert.ok(['dune', 'bank', 'ridge'].includes(s.habitat), `${s.name}: habitat ${s.habitat}`);
    assert.ok(Number.isInteger(s.rarity) && s.rarity >= 1 && s.rarity <= 4, `${s.name}: rarity`);
    assert.match(s.color, /^#[0-9a-f]{6}$/i, `${s.name}: color`); assert.match(s.color2, /^#[0-9a-f]{6}$/i, `${s.name}: color2`);
    assert.ok(s.size > 0 && s.size < 10, `${s.name}: size`);
    const forms = FORMS[s.kind];
    assert.ok(forms, `${s.name}: unknown kind ${s.kind}`);
    assert.ok(forms.includes(s.form), `${s.name}: a ${s.kind} cannot be drawn as "${s.form}" (one of ${forms.join(', ')})`);
  }
});
test('room to grow: ids fit the map and the rooms (16 bits), and the sprite atlas grows with the flora', () => {
  assert.ok(SPECIES.length < MAX_SPECIES, `${SPECIES.length} species: the limit is ${MAX_SPECIES}`);
  assert.ok(FLORA.length + FUNGI.length <= MAX_FLORA, `${FLORA.length + FUNGI.length} plants: the atlas holds ${MAX_FLORA}`);
  assert.equal(atlasRow(400), 32); assert.equal(atlasRow(1024), 32); assert.equal(atlasRow(1025), 64); assert.equal(atlasRow(4096), 64);
  assert.ok(atlasRow(FLORA.length + FUNGI.length) ** 2 >= FLORA.length + FUNGI.length);
});
