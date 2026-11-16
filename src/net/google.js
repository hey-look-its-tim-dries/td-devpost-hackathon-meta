// src/net/google.js
// Signing in with Google, the two pure ends of it: the address of Google's own sign-in page (the game goes there
// and comes back with an identity token in its fragment), and the check the map's server makes of that token
// with Google (tokeninfo) before it trusts it. The page asks for `openid profile`: the account's id (`sub`, kept
// only as a hash) and its picture, shown beside your name to other players. No e-mail is asked for; the name
// Google sends is not kept. Pure: the server passes its own fetch.
export const googleUrl = (clientId, redirect, state, nonce) => `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirect)}&response_type=id_token&scope=openid%20profile&nonce=${encodeURIComponent(nonce)}&state=${encodeURIComponent(`g:${state}`)}`;
// what came back in the page's fragment: { idToken } when the state is the one we sent (marked g: for Google), else null
export function idFromFragment(hash, state) {
  const p = new URLSearchParams(String(hash).replace(/^#/, '')), t = p.get('id_token');
  return t && state && p.get('state') === `g:${state}` && /^[\w-]{20,}\.[\w-]{20,}\.[\w-]{20,}$/.test(t) && t.length <= 4096 ? { idToken: t } : null;
}
// a profile picture's address, or null: only Google's own picture host, only characters an address needs
export const cleanPicture = (u) => (typeof u === 'string' && /^https:\/\/lh[3-6]\.googleusercontent\.com\/[\w\-=.\/]{10,400}$/.test(u) ? u : null);
// the Google account behind an identity token, { id, picture }, or null when Google does not vouch for it for THIS app
export async function verifyGoogle(fetchFn, clientId, idToken, now = Date.now()) {
  if (!clientId || typeof idToken !== 'string' || idToken.length < 60 || idToken.length > 4096) return null;
  try {
    const r = await fetchFn(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!r.ok) return null;
    const d = await r.json();
    return d?.aud === clientId && (d.iss === 'https://accounts.google.com' || d.iss === 'accounts.google.com') && +d.exp * 1000 > now && /^\d{1,32}$/.test(String(d.sub ?? '')) ? { id: String(d.sub), picture: cleanPicture(d.picture) } : null;
  } catch { return null; }
}
// which account an identity token is for, as a short local tag (a hash of its `sub`; never sent anywhere): the
// game keeps one player per account on a device. null when the token cannot be read.
export function accountTag(idToken) {
  try {
    const sub = String(JSON.parse(atob(String(idToken).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub ?? '');
    if (!/^\d{1,32}$/.test(sub)) return null;
    let h = 2166136261;
    for (const ch of sub) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    return h.toString(36) + sub.length.toString(36) + sub.slice(-2);
  } catch { return null; }
}
