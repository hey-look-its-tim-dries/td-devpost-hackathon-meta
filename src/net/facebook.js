// src/net/facebook.js
// Facebook Login, the two pure ends of it: the address of Facebook's own sign-in dialog (the page goes
// there and comes back with a token in its fragment), and the check the map's server makes of that
// token with Facebook (debug_token) before it trusts it. Only the app-scoped user id is ever used;
// no name, no e-mail, no friends. Pure: the server passes its own fetch.
export const GRAPH = 'v27.0';
export const dialogUrl = (appId, redirect, state) => `https://www.facebook.com/${GRAPH}/dialog/oauth?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirect)}&state=${encodeURIComponent(state)}&response_type=token&scope=public_profile`;
// what came back in the page's fragment: { token } when the state is the one we sent, else null
export function fromFragment(hash, state) {
  const p = new URLSearchParams(String(hash).replace(/^#/, '')), token = p.get('access_token');
  return token && state && p.get('state') === state && /^[\w.\-|%]{20,600}$/.test(token) ? { token } : null;
}
// the app-scoped user id behind a token, or null when Facebook does not vouch for it for THIS app
export async function verifyFacebook(fetchFn, appId, secret, token) {
  if (!appId || !secret || typeof token !== 'string' || token.length < 20 || token.length > 600) return null;
  try {
    const r = await fetchFn(`https://graph.facebook.com/${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(`${appId}|${secret}`)}`);
    if (!r.ok) return null;
    const d = (await r.json())?.data;
    return d?.is_valid === true && String(d.app_id) === String(appId) && /^\d{1,32}$/.test(String(d.user_id ?? '')) ? String(d.user_id) : null;
  } catch { return null; }
}
