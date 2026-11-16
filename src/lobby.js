// src/lobby.js
// The lobby: the full screen between the title and the game. The world in numbers, who is flying right now and
// who is away, a live map with the players moving on it, the boards, the latest news, and a way in. It is there
// to show that this is one world with other people in it, before you dive in. lobbyFacts() and esc() are pure;
// createLobby() draws them into the page (#lobby in index.html) and paints the map.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
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
        lobbyCounts: d.counts.map(([n, label]) => `<div><b>${esc(n)}</b><span>${esc(label)}</span></div>`).join(''),
        lobbyOnline: list(d.online.map((p) => `<li class="${p.you ? 'you' : ''}"><i></i>${esc(p.name)}</li>`), ''),
        lobbyAway: list(d.away.slice(0, 14).map((n) => `<li>${esc(n)}</li>`), 'everyone with a Hand is here'),
        lobbyGardeners: list(d.gardeners.map((r, i) => `<li><span>${i + 1}. ${esc(r.name)}</span><b>${esc(Number(r.n).toLocaleString('en'))}</b></li>`), 'nobody has planted yet: be the first'),
        lobbyConverters: list(d.converters.map((r, i) => `<li><span>${i + 1}. ${esc(r.name)}</span><b>${esc(r.n)}</b></li>`), 'no gnome has changed sides yet'),
        lobbyNews: list(d.news.map((e) => `<li><span>${esc(e.text)}</span><em>${esc(e.when)}</em></li>`), 'the world is quiet: make some news'),
        lobbyCall: esc(d.call),
        lobbyMe: `<b>${esc(d.me.name)}</b><span>${esc(d.me.status)} · level ${esc(d.me.level)}</span>`,
      };
      const key = JSON.stringify(html);
      if (key === shown) return;
      shown = key;
      for (const [id, v] of Object.entries(html)) $(id).innerHTML = v;
    },
  };
}
