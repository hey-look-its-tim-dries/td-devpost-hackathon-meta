// src/journal.js
// The world's history in words (spec 6.4 History), how long ago things happened, and watersheds: the
// river systems that Hands joined by confluences share. Pure.
export function journalText({ kind, data }) {
  const d = data ?? {};
  if (kind === 'laid') return d.next?.length ? `${d.name} joined the world, next to ${d.next.join(' and ')}` : `${d.name} joined the world`;
  if (kind === 'confluence') return `${d.name}'s rivers now reach ${d.with}`;
  if (kind === 'named') return `${d.name} was named on ${d.hand}`;
  if (kind === 'donated') return `${d.name} gave ${d.slot} to Community Hand ${d.no}`;
  if (kind === 'sealed') return `Community Hand ${d.no} was sealed`;
  if (kind === 'bloomed') return `A plot of ${d.hand} came into bloom`;
  if (kind === 'golden') return `${d.name} caught the golden seed`;
  if (kind === 'gnome') return `${d.name} won a gnome over from another gardener`;
  if (kind === 'washed') return `${d.name} washed their hands`;
  return null;
}

export function when(at, now = Date.now()) {
  const s = (now - at) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} day${s < 172800 ? '' : 's'} ago`;
}

// handId -> system number, for Hands linked by confluence pairs (union-find)
export function watersheds(pairs) {
  const up = {};
  const find = (a) => { while (up[a] !== a) a = up[a] = up[up[a]]; return a; };
  for (const [a, b] of pairs) { up[a] ??= a; up[b] ??= b; up[find(a)] = find(b); }
  const out = {}, num = {};
  let n = 0;
  for (const k of Object.keys(up)) out[k] = num[find(k)] ??= n++;
  return out;
}
