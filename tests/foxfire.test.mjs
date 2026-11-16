// tests/foxfire.test.mjs: mushrooms and the foxfire state they bring (the glowing mode)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFoxfire, wildMushroom, FOXFIRE } from '../src/garden/foxfire.js';

test('what died feeds mushrooms: a dead grove grows one, always the same kind; living groves grow none', () => {
  const fungi = [700, 701, 702, 703];
  assert.ok(fungi.includes(wildMushroom({ id: 12, dry: 2 }, fungi)));
  assert.equal(wildMushroom({ id: 12, dry: 2 }, fungi), wildMushroom({ id: 12, dry: 2 }, fungi));
  assert.equal(wildMushroom({ id: 12, dry: 0 }, fungi), null);
  assert.equal(wildMushroom({ id: 12, dry: 1 }, fungi), null, 'dry is not dead');
  assert.equal(wildMushroom({ id: 12, dry: 2 }, []), null);
  assert.ok(new Set(Array.from({ length: 40 }, (_, i) => wildMushroom({ id: i + 1, dry: 2 }, fungi))).size > 1, 'not all the same kind');
});
test('eating a mushroom brings the foxfire: it rises fast, holds, and fades; calm before and after', () => {
  const f = createFoxfire(), t0 = 1000;
  assert.equal(f.level(t0), 0);
  assert.equal(f.eat(t0), 1, 'the first of a chain');
  assert.ok(f.level(t0 + 200) > 0 && f.level(t0 + 200) < 1, 'rising');
  assert.equal(f.level(t0 + 5000), 1);
  assert.equal(f.active(t0 + 5000), true);
  assert.equal(f.left(t0 + 5000), Math.ceil((FOXFIRE.first - 5000) / 1000));
  const end = t0 + FOXFIRE.first;
  assert.ok(f.level(end + FOXFIRE.fade / 2) > 0 && f.level(end + FOXFIRE.fade / 2) < 1, 'fading');
  assert.equal(f.level(end + FOXFIRE.fade + 1), 0);
  assert.equal(f.active(end + 1), false, 'the rewards stop when the time is up, the glow lingers a moment');
});
test('a chain: each further mushroom adds time and raises the multiplier, up to a limit; the chain ends with the glow', () => {
  const f = createFoxfire(), t0 = 0;
  f.eat(t0);
  assert.equal(f.mult(t0 + 1000), 2);
  assert.equal(f.eat(t0 + 10000), 2);
  assert.equal(f.mult(t0 + 11000), 3);
  assert.equal(f.left(t0 + 10000), Math.ceil((FOXFIRE.first + FOXFIRE.more - 10000) / 1000));
  for (let i = 0; i < 20; i++) f.eat(t0 + 12000);
  assert.ok(f.left(t0 + 12000) * 1000 <= FOXFIRE.max, 'never longer than the limit');
  assert.equal(f.mult(t0 + 13000), FOXFIRE.maxMult);
  const over = t0 + 12000 + FOXFIRE.max + FOXFIRE.fade + 10;
  assert.equal(f.mult(over), 1);
  assert.equal(f.eat(over), 1, 'a new chain starts at one');
});
test('a mushroom you ate needs time to fruit again for you', () => {
  const f = createFoxfire();
  assert.equal(f.canEat(5, 0), true);
  f.ate(5, 0);
  assert.equal(f.canEat(5, 60000), false);
  assert.equal(f.canEat(6, 60000), true);
  assert.equal(f.canEat(5, FOXFIRE.regrow + 1), true);
});
