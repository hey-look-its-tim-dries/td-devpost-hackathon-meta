// tests/facebook.test.mjs: Facebook Login's pure ends, and the profile a gardener carries between devices
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dialogUrl, fromFragment, verifyFacebook } from '../src/net/facebook.js';
import { createPouch } from '../src/garden/pouch.js';

const reply = (data, ok = true) => async () => ({ ok, json: async () => ({ data }) });
test('the server trusts a token only when Facebook says it is valid and made for this app', async () => {
  const tok = 'EAAB'.padEnd(60, 'x');
  assert.equal(await verifyFacebook(reply({ is_valid: true, app_id: '123', user_id: '777' }), '123', 'secret', tok), '777');
  assert.equal(await verifyFacebook(reply({ is_valid: true, app_id: '999', user_id: '777' }), '123', 'secret', tok), null, 'a token for another app');
  assert.equal(await verifyFacebook(reply({ is_valid: false, app_id: '123', user_id: '777' }), '123', 'secret', tok), null);
  assert.equal(await verifyFacebook(reply({}, false), '123', 'secret', tok), null);
  assert.equal(await verifyFacebook(async () => { throw new Error('down'); }, '123', 'secret', tok), null);
  assert.equal(await verifyFacebook(reply({ is_valid: true, app_id: '123', user_id: '777' }), '', 'secret', tok), null, 'not set up');
  let asked = '';
  await verifyFacebook(async (u) => { asked = u; return { ok: false }; }, '123', 's e', tok);
  assert.ok(asked.startsWith('https://graph.facebook.com/') && asked.includes('access_token=123%7Cs%20e'));
});
test('the dialog asks for the public profile only; what comes back counts only with our own state', () => {
  const u = new URL(dialogUrl('123', 'https://example.org/game/', 'abc'));
  assert.equal(u.hostname, 'www.facebook.com');
  assert.equal(u.searchParams.get('scope'), 'public_profile');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://example.org/game/');
  const tok = 'EAAB'.padEnd(60, 'x');
  assert.deepEqual(fromFragment(`#access_token=${tok}&state=abc&expires_in=5000`, 'abc'), { token: tok });
  assert.equal(fromFragment(`#access_token=${tok}&state=evil`, 'abc'), null);
  assert.equal(fromFragment('#ABC234', 'abc'), null, 'a pairing code is not a login');
  assert.equal(fromFragment(`#access_token=${tok}&state=abc`, null), null);
});
test('a pouch can be carried: dumped whole, and adopted on another device when it holds more', () => {
  const S = Array.from({ length: 9 }, (_, id) => ({ id, name: `S${id}`, kind: 'flower', habitat: 'dune', rarity: 1 }));
  const a = createPouch(null, S, [0, 1, 2]);
  for (let i = 0; i < 12; i++) { a.planted(4); a.credit('plant'); }
  a.gather(5, 7);
  const b = createPouch(null, S, [0, 1, 2]);
  assert.equal(b.adopt(a.dump()), true);
  assert.equal(b.plantedTotal, 12);
  assert.equal(b.has(5), 7);
  assert.deepEqual(b.log(), a.log());
  assert.equal(a.adopt(createPouch(null, S, [0, 1, 2]).dump()), false, 'a poorer pouch never replaces a richer one');
  assert.equal(b.adopt({ seeds: 'junk' }), false);
  assert.equal(b.adopt(null), false);
});
