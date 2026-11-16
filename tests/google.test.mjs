// tests/google.test.mjs: signing in with Google, the two pure ends of it
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { googleUrl, idFromFragment, verifyGoogle, cleanPicture } from '../src/net/google.js';

test('the page goes to Google asking for an identity only, and takes back a token only with the state it sent', () => {
  const u = new URL(googleUrl('abc.apps.googleusercontent.com', 'https://x.test/game/', 'st4te', 'n0nce'));
  assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(u.searchParams.get('response_type'), 'id_token');
  assert.equal(u.searchParams.get('scope'), 'openid profile', 'the basic profile (for the picture): no e-mail asked for');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://x.test/game/');
  assert.equal(u.searchParams.get('state'), 'g:st4te');
  const jwt = 'aaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbb.cccccccccccccccccccc';
  assert.deepEqual(idFromFragment(`#state=g%3Ast4te&id_token=${jwt}`, 'st4te'), { idToken: jwt });
  assert.equal(idFromFragment(`#state=g%3Aother&id_token=${jwt}`, 'st4te'), null);
  assert.equal(idFromFragment(`#state=st4te&access_token=${jwt}`, 'st4te'), null, 'a Facebook answer is not a Google one');
  assert.equal(idFromFragment('#id_token=short&state=g%3Ast4te', 'st4te'), null);
});
test('the map trusts a Google token only when Google vouches for it, for this app, and it has not run out', async () => {
  const ID = 'abc.apps.googleusercontent.com', jwt = 'a'.repeat(40) + '.' + 'b'.repeat(40) + '.' + 'c'.repeat(40), now = 1_800_000_000_000;
  const google = (body, ok = true) => async (url) => { assert.match(url, /^https:\/\/oauth2\.googleapis\.com\/tokeninfo\?id_token=/); return { ok, json: async () => body }; };
  const good = { aud: ID, iss: 'https://accounts.google.com', sub: '1234567890', exp: String(now / 1000 + 600) };
  assert.deepEqual(await verifyGoogle(google(good), ID, jwt, now), { id: '1234567890', picture: null });
  const pic = 'https://lh3.googleusercontent.com/a/ACg8ocK-abc_DEF=s96-c';
  assert.deepEqual(await verifyGoogle(google({ ...good, picture: pic }), ID, jwt, now), { id: '1234567890', picture: pic });
  assert.equal((await verifyGoogle(google({ ...good, picture: 'https://evil.test/x.png' }), ID, jwt, now)).picture, null, 'only a picture Google itself hosts');
  assert.equal(await verifyGoogle(google({ ...good, aud: 'someone-else' }), ID, jwt, now), null, 'a token made for another app');
  assert.equal(await verifyGoogle(google({ ...good, exp: String(now / 1000 - 5) }), ID, jwt, now), null, 'run out');
  assert.equal(await verifyGoogle(google({ ...good, iss: 'https://evil.test' }), ID, jwt, now), null);
  assert.equal(await verifyGoogle(google(good, false), ID, jwt, now), null);
  assert.equal(await verifyGoogle(google(good), '', jwt, now), null, 'not set up');
  assert.equal(await verifyGoogle(async () => { throw new Error('down'); }, ID, jwt, now), null);
});

test('a profile picture is only ever an address on Google\'s own picture host', () => {
  assert.equal(cleanPicture('https://lh3.googleusercontent.com/a/ACg8ocK-abc_DEF=s96-c'), 'https://lh3.googleusercontent.com/a/ACg8ocK-abc_DEF=s96-c');
  for (const bad of ['http://lh3.googleusercontent.com/a/abcdefghijk', 'https://lh3.googleusercontent.com.evil.test/a/abcdefghijk', 'https://lh3.googleusercontent.com/a/x"onerror="alert(1)', 'javascript:alert(1)', null, 42, '']) assert.equal(cleanPicture(bad), null, String(bad));
});
