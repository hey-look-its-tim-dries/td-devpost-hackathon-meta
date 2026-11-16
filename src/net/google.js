// src/net/google.js
// Signing in with Google, the two pure ends of it: the address of Google's own sign-in page (the game goes there
// and comes back with an identity token in its fragment), and the check the map's server makes of that token
// with Google (tokeninfo) before it trusts it. Only the account's id (`sub`) is ever used: the page asks for
// `openid` alone, so no name and no e-mail come back. Pure: the server passes its own fetch.
export const googleUrl = (clientId, redirect, state, nonce) => `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirect)}&response_type=id_token&scope=openid&nonce=${encodeURIComponent(nonce)}&state=${encodeURIComponent(`g:${state}`)}`;
// what came back in the page's fragment: { idToken } when the state is the one we sent (marked g: for Google), else null
export function idFromFragment(hash, state) {
  const p = new URLSearchParams(String(hash).replace(/^#/, '')), t = p.get('id_token');
  return t && state && p.get('state') === `g:${state}` && /^[\w-]{20,}\.[\w-]{20,}\.[\w-]{20,}$/.test(t) && t.length <= 4096 ? { idToken: t } : null;
}
// the Google account id behind an identity token, or null when Google does not vouch for it for THIS app
export async function verifyGoogle(fetchFn, clientId, idToken, now = Date.now()) {
  if (!clientId || typeof idToken !== 'string' || idToken.length < 60 || idToken.length > 4096) return null;
  try {
    const r = await fetchFn(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!r.ok) return null;
    const d = await r.json();
    return d?.aud === clientId && (d.iss === 'https://accounts.google.com' || d.iss === 'accounts.google.com') && +d.exp * 1000 > now && /^\d{1,32}$/.test(String(d.sub ?? '')) ? String(d.sub) : null;
  } catch { return null; }
}
