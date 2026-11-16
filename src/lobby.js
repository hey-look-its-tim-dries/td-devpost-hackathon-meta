// src/lobby.js
// The lobby: the full screen between the title and the game. The world in numbers, who is flying right now and
// who is away, a live map with the players moving on it, the boards, the latest news, and a way in. It is there
// to show that this is one world with other people in it, before you dive in. lobbyFacts() and esc() are pure;
// createLobby() draws them into the page (#lobby in index.html) and paints the map.
import { cleanPicture } from './net/google.js';
import { icon } from './ui/icons.js';

const COUNT_ICONS = { 'FLYING NOW': 'fly', HANDS: 'hand', GROVES: 'sow', AWAY: 'away' };

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// the picture of a signed-in player, as markup, or nothing: pics is { name: address }, and only Google's own picture host passes
export const face = (name, pics) => { const u = cleanPicture(pics?.[name]); return u ? `<img class="face" src="${esc(u)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : ''; };
// A player's whorl as a small sign: five strands spiralling out, each shaped by one fingerprint class as the real
// whorl's strands are (src/creature.js STYLES). Points in a square from -1 to 1. No prints: the plain whorl.
const SIGN = { arch: [0.45, 0.9, 0, 0], tented: [0.6, 0.9, 0, 1], ulnar: [0.9, 1, -0.22, 0], radial: [0.9, 1, 0.22, 0], whorl: [1.7, 1, 0, 0], pocket: [1.35, 0.72, 0.1, 0.5], double: [-1.3, 1, 0, 0], accidental: [1.15, 0.9, -0.1, 0.7] };
export function whorlStrands(classes) {
  return Array.from({ length: 5 }, (_, k) => {
    const [spin, reach, side, peak] = (classes && SIGN[classes[k % classes.length]]) || [1, 1, 0, 0], pts = [];
    for (let i = 0; i <= 28; i++) { const s = i / 28, a = k * 1.2566 + spin * s * 5.2, r = Math.min(0.98, (0.08 + 0.84 * s) * reach * (1 + 0.35 * peak * Math.exp(-(((s - 0.4) / 0.14) ** 2)))); pts.push([Math.max(-1, Math.min(1, Math.cos(a) * r + side * s)), Math.sin(a) * r]); }
    return pts;
  });
}
const signs = new Map(); // drawn once per set of prints
export function whorlImg(classes) {
  const key = classes ? classes.join(',') : 'plain';
  if (!signs.has(key)) {
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const g = c.getContext('2d'), light = g.createLinearGradient(0, 0, 96, 96);
    light.addColorStop(0, '#3ff3ff'); light.addColorStop(1, '#ff4fe0');
    g.strokeStyle = light; g.lineWidth = 3.2; g.lineCap = 'round'; g.lineJoin = 'round'; g.shadowColor = 'rgba(255,79,224,0.7)'; g.shadowBlur = 6;
    for (const s of whorlStrands(classes)) { g.beginPath(); s.forEach(([x, y], i) => (i ? g.lineTo(48 + x * 40, 48 + y * 40) : g.moveTo(48 + x * 40, 48 + y * 40))); g.stroke(); }
    signs.set(key, c.toDataURL());
  }
  return `<img class="whorl" src="${signs.get(key)}" alt="">`;
}
// in: hands [{ name, founder }], flying [{ name, x, z }] (the others in your room), me (your Hand's name or null),
// groves, worldFlying (the map's count, all rooms), gardeners / converters [{ name, n }], news [{ when, text }]
export function lobbyFacts({ hands, flying, me, groves, worldFlying, gardeners, converters, news }) {
  const online = [{ name: me ? `${me} (you)` : 'You', you: true }, ...flying.map((p) => ({ name: p.name ?? 'A traveller', x: p.x, z: p.z }))];
  const here = new Set(flying.map((p) => p.name)), away = hands.filter((h) => !h.founder && h.name !== me && !here.has(h.name)).map((h) => h.name);
  const n = Math.max(online.length, worldFlying || 0), friend = flying.find((p) => p.name)?.name;
  return {
    online, away,
    counts: [[n, 'FLYING NOW'], [hands.length, 'HANDS'], [Number(groves || 0).toLocaleString('en'), 'GROVES'], [away.length, 'AWAY']],
    call: friend ? `${friend} is flying right now. Go and meet them: your whorls will braid.` : n > 1 ? `${n - 1} other${n > 2 ? 's are' : ' is'} flying right now. Go and find them.` : 'Nobody else is flying right now. Be the first one out there: what you sow stays for everyone.',
    gardeners: gardeners.slice(0, 5), converters: converters.slice(0, 5), news: news.slice(0, 6),
  };
}

export function createLobby(root) {
  const $ = (id) => root.querySelector(`#${id}`), canvas = $('lobbyMap'), g = canvas.getContext('2d');
  const list = (rows, none) => (rows.length ? rows.join('') : `<li class="none">${esc(none)}</li>`);
  let t0 = performance.now();
  // the map: every Hand where it lies (north up), the Source in the middle, blooming plots, and the players, pulsing
  function paint(d) {
    const box = canvas.getBoundingClientRect(), dpr = Math.min(2, globalThis.devicePixelRatio || 1); // drawn at the size it is shown
    if (box.width > 0 && (canvas.width !== Math.round(box.width * dpr) || canvas.height !== Math.round(box.height * dpr))) { canvas.width = Math.round(box.width * dpr); canvas.height = Math.round(box.height * dpr); }
    const W = canvas.width, H = canvas.height, t = (performance.now() - t0) / 1000;
    let R = 9000;
    for (const h of d.map.hands) R = Math.max(R, Math.hypot(h.x, h.z) + 3200);
    for (const p of d.map.players) R = Math.max(R, Math.min(26000, Math.hypot(p.x, p.z) + 1200)); // everyone flying is on the map
    const k = Math.min(W, H) / (2 * R), X = (x) => W / 2 + x * k, Y = (z) => H / 2 + z * k;
    g.clearRect(0, 0, W, H);
    g.strokeStyle = 'rgba(246,232,216,0.10)'; g.lineWidth = 1;
    for (let r = 4000; r < R; r += 4000) { g.beginPath(); g.arc(W / 2, H / 2, r * k, 0, Math.PI * 2); g.stroke(); }
    const poly = (pts) => { g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z)))); g.closePath(); };
    for (const h of d.map.hands) { // a Hand as it really lies: its own outline and fingers in its skin tone, its palm lines as rivers
      g.fillStyle = h.tone; g.strokeStyle = h.mine ? '#ffcfa8' : 'rgba(22,16,14,0.55)'; g.lineWidth = h.mine ? 3 : 1.2; g.lineJoin = 'round';
      g.globalAlpha = h.founder && !h.mine ? 0.8 : 1;
      for (const f of h.fingers) { poly(f); g.fill(); g.stroke(); }
      poly(h.outline); g.fill(); g.stroke();
      g.strokeStyle = '#3b83b0'; g.lineWidth = Math.max(1.2, W / 700); g.lineCap = 'round';
      for (const l of h.lines) { g.beginPath(); l.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z)))); g.stroke(); }
      g.globalAlpha = 1;
    }
    const px = Math.max(2, Math.round(W / 420)); /* every sowing: a pixel in its flower's colour, twinkling */
    (d.map.sowings ?? []).forEach(([x, z, c], i) => { g.globalAlpha = 0.65 + 0.35 * Math.sin(t * 2.2 + i * 1.7); g.fillStyle = c; g.fillRect(Math.round(X(x) - px / 2), Math.round(Y(z) - px / 2), px, px); });
    g.globalAlpha = 1;
    g.textAlign = 'center'; g.lineJoin = 'round';
    for (const h of d.map.hands) { // names over everything, readable on skin and on the dark
      g.font = `${h.mine ? 800 : 600} ${Math.max(11, W / 60)}px Inter, system-ui, sans-serif`;
      g.strokeStyle = 'rgba(16,10,9,0.85)'; g.lineWidth = 4; g.strokeText(h.name, X(h.x), Y(h.z) + 4);
      g.fillStyle = h.mine ? '#ffcfa8' : '#f6e8d8'; g.fillText(h.name, X(h.x), Y(h.z) + 4);
    }
    g.fillStyle = 'rgba(160,220,120,0.9)';
    for (const p of d.map.blooms) { g.beginPath(); g.arc(X(p.x), Y(p.z), 2 + p.level, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#ffcfa8'; g.beginPath(); g.arc(W / 2, H / 2, 5, 0, Math.PI * 2); g.fill();
    g.font = `600 ${Math.max(10, W / 70)}px Inter, system-ui, sans-serif`; g.fillText('THE SOURCE', W / 2, H / 2 - 10);
    for (const p of d.map.players) { // the living: a dot with a ring that breathes out
      const x = X(p.x), y = Y(p.z), s = (t * 0.9 + (p.x + p.z) * 0.0001) % 1;
      g.strokeStyle = p.you ? `rgba(255,150,90,${1 - s})` : `rgba(120,220,255,${1 - s})`; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 6 + s * 22, 0, Math.PI * 2); g.stroke();
      g.fillStyle = p.you ? '#ff965a' : '#78dcff'; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.font = `700 ${Math.max(12, W / 56)}px Inter, system-ui, sans-serif`; g.fillText(p.name, x, y - 14);
    }
  }
  let shown = '';
  return {
    get open() { return !root.classList.contains('hidden'); },
    show() { root.classList.remove('hidden'); t0 = performance.now(); },
    hide() { root.classList.add('hidden'); },
    // d: lobbyFacts(...) plus { map: { hands: [{ name, x, z, mine, founder, outline, fingers, lines (world points), tone }], blooms: [{ x, z, level }], players: [{ name, x, z, you }] }, me: { name, status, level } }
    update(d) {
      paint(d);
      const html = {
        lobbyCounts: d.counts.map(([n, label]) => `<div>${icon(COUNT_ICONS[label])}<b>${esc(n)}</b><span>${esc(label)}</span></div>`).join(''),
        lobbyOnline: list(d.online.map((p) => `<li class="${p.you ? 'you' : ''}"><i></i>${whorlImg(p.you ? d.me.whorl : d.whorls?.[p.name] ?? null)}${p.you ? face('', { '': d.me.pic }) : face(p.name, d.pics)}${esc(p.name)}</li>`), ''),
        lobbyAway: list(d.away.slice(0, 14).map((n) => `<li>${whorlImg(d.whorls?.[n] ?? null)}${face(n, d.pics)}${esc(n)}</li>`), 'everyone with a Hand is here'),
        lobbyGardeners: list(d.gardeners.map((r, i) => `<li><span>${i + 1}. ${d.whorls?.[r.name] ? whorlImg(d.whorls[r.name]) : ''}${face(r.name, d.pics)}${esc(r.name)}</span><b>${esc(Number(r.n).toLocaleString('en'))}</b></li>`), 'nobody has planted yet: be the first'),
        lobbyConverters: list(d.converters.map((r, i) => `<li><span>${i + 1}. ${face(r.name, d.pics)}${esc(r.name)}</span><b>${esc(r.n)}</b></li>`), 'no gnome has changed sides yet'),
        lobbyNews: list(d.news.map((e) => `<li><span>${esc(e.text)}</span><em>${esc(e.when)}</em></li>`), 'the world is quiet: make some news'),
        lobbyCall: esc(d.call),
        lobbyMe: `${whorlImg(d.me.whorl)}${face('', { '': d.me.pic })}<b>${esc(d.me.name)}</b><span>${esc(d.me.status)} · level ${esc(d.me.level)}</span>`,
      };
      const key = JSON.stringify(html);
      if (key === shown) return;
      shown = key;
      for (const [id, v] of Object.entries(html)) $(id).innerHTML = v;
    },
  };
}
