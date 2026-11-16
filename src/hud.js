// src/hud.js
// The flight HUD (spec 11.3 step 8), minimal and fading when idle: a compass ribbon at the top of your
// view with markers (your Hand, the Source, pins, the nearest player), and a place card bottom left
// (handbit, Hand, charted count) with your altitude in spans. Both are children of the camera, inside
// 24 degrees of the centre so the glasses profile shows them whole.
import * as THREE from 'three';

import { bearings, spans } from './compass.js';
import { themed, look } from './ui/themed.js';
import { hintLine } from './garden/hints.js';
import { drawIcon } from './ui/icons.js';

const PUN = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']; // -z is north

const card = (w, h, mw, mh, pos) => {
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
  mesh.renderOrder = 28;
  mesh.position.set(...pos);
  return { canvas, tex, mesh, g: themed(canvas.getContext('2d')) };
};

export function createHud() {
  const group = new THREE.Group();
  const ribbon = card(1024, 128, 0.34, 0.0425, [0, 0.19, -0.65]);
  const place = card(640, 290, 0.2, 0.0906, [-0.15, -0.141, -0.65]); /* the place, and under it the territory: whose Hand, what grows there */ // (clear of the steering card under it)
  const garden = card(640, 200, 0.2, 0.0625, [0.15, -0.155, -0.65]); // your pouch and the plot under you
  const radar = card(360, 360, 0.1, 0.1, [-0.302, -0.136, -0.65]); /* bottom left, beside the place card */ // who and what is around you (on the right, under Grandfather Tuft's window)
  const stats = card(560, 300, 0.14, 0.075, [-0.215, 0.085, -0.65]); // the world in numbers (its far edge 23.7 degrees out: inside the glasses' view, clear of a stamp)
  const keys = card(300, 150, 0.094, 0.047, [0, -0.163, -0.65]); /* always there, in every mode: how to pause, how to open your inventory */
  const cards = [ribbon, place, garden, radar, stats, keys];
  group.add(...cards.map((c) => c.mesh));
  let alpha = 0, since = 0, lastKey = '', clock = 0, gardenKey = '', statsKey = '', neon = false, keysKey = '';
  function paintKeys(hands, touch) {
    const { g, canvas: c } = keys, rows = hands ? [['PALM UP', 'pause · inventory'], ['PALM DOWN', 'fly on']] : touch ? [['❚❚', 'pause'], ['BAG', 'inventory']] : [['P', 'pause'], ['I', 'inventory']];
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = PAPER; g.beginPath(); g.roundRect(4, 4, c.width - 8, c.height - 8, 24); g.fill();
    g.strokeStyle = 'rgba(22,16,14,0.5)'; g.lineWidth = 2; g.stroke();
    rows.forEach(([k, what], i) => { const y = 58 + i * 56; g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.fillStyle = SEAL; g.font = `800 ${hands ? 22 : 30}px Inter, system-ui, sans-serif`; g.fillText(k, 24, y); g.fillStyle = INK; g.font = `600 ${hands ? 22 : 28}px Inter, system-ui, sans-serif`; g.textAlign = 'right'; g.fillText(what, c.width - 24, y); });
    keys.tex.needsUpdate = true;
  }
  const GILT = '#c9a35a', RIVER = '#2f5d7c', LEAF = '#3f7d3a';
  const INK = '#16100e', SEAL = '#b8442e', PAPER = 'rgba(243, 228, 210, 0.9)';

  function paintRibbon(yaw, marks) {
    const { g, canvas: c } = ribbon;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = PAPER; g.beginPath(); g.roundRect(4, 30, c.width - 8, 60, 30); g.fill();
    g.strokeStyle = 'rgba(22,16,14,0.5)'; g.lineWidth = 2; g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let k = 0; k < 8; k++) { // the cardinal and intercardinal points
      const a = Math.atan2(Math.sin(k * Math.PI / 4 + yaw), Math.cos(k * Math.PI / 4 + yaw)), x = a / (Math.PI / 2);
      if (Math.abs(x) > 1) continue;
      g.fillStyle = k % 2 ? 'rgba(22,16,14,0.45)' : INK;
      g.font = `${k % 2 ? 500 : 700} ${k % 2 ? 22 : 30}px Inter, system-ui, sans-serif`;
      g.fillText(PUN[k], 512 + x * 470, 60);
    }
    const said = []; // where labels already stand: a marker too close to one keeps its arrow but not its words
    for (const m of marks) { // markers above the ribbon, edge arrows when off it
      const x = 512 + m.x * 470, col = m.color ?? SEAL;
      g.fillStyle = col;
      g.beginPath();
      if (Math.abs(m.x) >= 0.999) { const s = Math.sign(m.x); g.moveTo(x + s * 14, 60); g.lineTo(x - s * 6, 46); g.lineTo(x - s * 6, 74); }
      else { g.moveTo(x, 34); g.lineTo(x - 9, 18); g.lineTo(x + 9, 18); }
      g.fill();
      g.font = '600 20px Inter, system-ui, sans-serif'; g.fillStyle = INK;
      if (Math.abs(m.x) < 0.999 && said.every((q) => Math.abs(q - x) > 190)) { said.push(x); g.fillText(`${m.label} ${spans(m.dist)}`, x, 108); }
    }
    ribbon.tex.needsUpdate = true;
  }
  function paintPlace(p, altitude) {
    const { g, canvas: c } = place;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = PAPER; g.beginPath(); g.roundRect(4, 4, c.width - 8, c.height - 8, 28); g.fill();
    g.strokeStyle = 'rgba(22,16,14,0.5)'; g.lineWidth = 2; g.stroke();
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    if (p) {
      g.fillStyle = SEAL; g.font = '700 22px Inter, system-ui, sans-serif';
      g.fillText(`${p.code} · ${p.charted ? 'CHARTED' : 'UNCHARTED'}`, 28, 50);
      g.fillStyle = INK; g.font = '600 46px Georgia, serif'; g.fillText(p.name, 28, 104, 460);
      g.fillStyle = 'rgba(22,16,14,0.7)'; g.font = '400 26px Inter, system-ui, sans-serif';
      g.fillText(`${p.hand}${p.owner ? '' : ' · founder'} · ${p.count} of ${p.total} charted`, 28, 150, 460);
      /* the territory: its owner's picture (or the Hand's initial), whose it is, and its garden */
      g.strokeStyle = 'rgba(22,16,14,0.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(28, 176); g.lineTo(c.width - 28, 176); g.stroke();
      g.save(); g.beginPath(); g.arc(66, 230, 38, 0, Math.PI * 2); g.clip();
      if (p.face) g.drawImage(p.face, 28, 192, 76, 76); else { g.fillStyle = SEAL; g.fillRect(28, 192, 76, 76); g.fillStyle = '#f7eedf'; g.font = '700 44px Georgia, serif'; g.textAlign = 'center'; g.fillText(p.hand.slice(0, 1).toUpperCase(), 66, 246); g.textAlign = 'left'; }
      g.restore();
      g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.arc(66, 230, 38, 0, Math.PI * 2); g.stroke();
      g.fillStyle = INK; g.font = '700 26px Inter, system-ui, sans-serif'; g.fillText(p.owner ? `${p.hand}'s territory${p.yours ? ' · yours' : ''}` : `${p.hand} · a founder's Hand`, 122, 222, 490);
      g.fillStyle = 'rgba(22,16,14,0.7)'; g.font = '400 23px Inter, system-ui, sans-serif';
      g.fillText(p.land ? `${p.land.groves} groves · ${p.land.kinds} kinds · ${p.land.blooms} plots in bloom` : 'nothing sown here yet', 122, 256, 490);
    } else {
      g.fillStyle = 'rgba(22,16,14,0.6)'; g.font = 'italic 400 34px Georgia, serif'; g.fillText('the wilderness', 28, 110);
      g.fillStyle = 'rgba(22,16,14,0.25)'; g.fillRect(28, 175, c.width - 56, 2);
      g.fillStyle = 'rgba(22,16,14,0.7)'; g.font = '400 24px Inter, system-ui, sans-serif'; g.fillText('No Hand under you: nothing grows here.', 28, 222, c.width - 56); g.fillText('Follow the compass to the nearest Hand.', 28, 256, c.width - 56);
    }
    g.textAlign = 'right'; g.fillStyle = INK; g.font = '700 40px Inter, system-ui, sans-serif'; g.fillText(spans(altitude), c.width - 28, 104);
    g.font = '500 20px Inter, system-ui, sans-serif'; g.fillStyle = 'rgba(22,16,14,0.6)'; g.fillText('SPANS UP', c.width - 28, 140);
    place.tex.needsUpdate = true;
  }

  function paintGarden(gd) {
    const { g, canvas: c } = garden;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = PAPER; g.beginPath(); g.roundRect(4, 4, c.width - 8, c.height - 8, 28); g.fill();
    g.strokeStyle = 'rgba(22,16,14,0.5)'; g.lineWidth = 2; g.stroke();
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    const s = gd.selected;
    if (s) {
      if (s.icon) { g.imageSmoothingEnabled = s.style !== 'pixel'; g.drawImage(s.icon.canvas, s.icon.x, s.icon.y, s.icon.s, s.icon.s, 20, 18, 92, 92); }
      g.fillStyle = SEAL; g.font = '700 20px Inter, system-ui, sans-serif'; g.fillText(`SEED · ${s.style.toUpperCase()}`, 124, 44);
      g.fillStyle = INK; g.font = '600 36px Georgia, serif'; g.fillText(s.name, 124, 84, 330);
      g.fillStyle = 'rgba(22,16,14,0.7)'; g.font = '400 22px Inter, system-ui, sans-serif'; g.fillText(`${s.n} of these · ${gd.seeds} seeds in all`, 124, 114, 330);
    } else { g.fillStyle = 'rgba(22,16,14,0.6)'; g.font = 'italic 400 30px Georgia, serif'; g.fillText('no seeds: find a seed cloud', 28, 78); }
    // water: five drops
    for (let i = 0; i < 5; i++) { g.fillStyle = i < gd.water ? RIVER : 'rgba(47,93,124,0.18)'; g.beginPath(); g.arc(486 + i * 28, 40, 10, 0, Math.PI * 2); g.fill(); }
    g.textAlign = 'right'; g.fillStyle = INK; g.font = '700 30px Inter, system-ui, sans-serif'; g.fillText(`LEVEL ${gd.level}`, c.width - 26, 92);
    g.font = '500 18px Inter, system-ui, sans-serif'; g.fillStyle = 'rgba(22,16,14,0.6)'; g.fillText(`${gd.found} of ${gd.of} found`, c.width - 26, 116);
    // the plot under you: its bloom
    g.textAlign = 'left';
    const p = gd.plot;
    g.fillStyle = 'rgba(22,16,14,0.12)'; g.beginPath(); g.roundRect(24, 150, c.width - 48, 14, 7); g.fill();
    if (p) {
      g.fillStyle = LEAF; g.beginPath(); g.roundRect(24, 150, Math.max(14, (c.width - 48) * p.progress), 14, 7); g.fill();
      g.fillStyle = INK; g.font = '600 20px Inter, system-ui, sans-serif'; g.fillText(`${(p.title ?? p.label).toUpperCase()} · ${p.n}/${p.cap} · ${p.hint}`, 26, 142, c.width - 52);
      for (let i = 0; i < 4; i++) { g.fillStyle = i < p.level ? GILT : 'rgba(22,16,14,0.2)'; g.beginPath(); g.arc(c.width - 40 - i * 22, 182, 7, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = gd.hyper ? SEAL : 'rgba(22,16,14,0.6)'; g.font = `${gd.hyper ? 700 : 500} 17px Inter, system-ui, sans-serif`;
      g.fillText(hintLine(gd, gd.hands), 26, 187, c.width - 150); // a gnome's wish, the foxfire, the hyper sow, or how to sow
    } else { g.fillStyle = 'rgba(22,16,14,0.6)'; g.font = '500 20px Inter, system-ui, sans-serif'; g.fillText(gd.wet ? 'ON THE RIVER: WATER FILLED' : 'FLY OVER A HAND TO PLANT', 26, 142); }
    garden.tex.needsUpdate = true;
  }
  function paintRadar(r, yaw, pos) {
    const { g, canvas: c } = radar, R = 168, cx = 180, cy = 180;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = PAPER; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(22,16,14,0.5)'; g.lineWidth = 2; g.stroke();
    g.strokeStyle = 'rgba(22,16,14,0.15)'; g.beginPath(); g.arc(cx, cy, R / 2, 0, Math.PI * 2); g.stroke();
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const at = (x, z) => { const dx = x - pos[0], dz = z - pos[2]; let sx = (dx * -fz + dz * fx) / r.range, sy = -(dx * fx + dz * fz) / r.range; const l = Math.hypot(sx, sy), edge = l > 0.94; if (edge) { sx *= 0.94 / l; sy *= 0.94 / l; } return [cx + sx * R, cy + sy * R, edge]; };
    g.textAlign = 'center'; g.textBaseline = 'middle';
    // the Hands as hands: each one's real palm and fingers in its skin tone, its palm lines as rivers, clipped to the radar's round
    const raw = (x, z) => { const dx = x - pos[0], dz = z - pos[2]; return [cx + ((dx * -fz + dz * fx) / r.range) * R, cy - ((dx * fx + dz * fz) / r.range) * R]; };
    g.save(); g.beginPath(); g.arc(cx, cy, R * 0.97, 0, Math.PI * 2); g.clip();
    for (const h of r.hands) {
      if (!h.outline || Math.hypot(h.x - pos[0], h.z - pos[2]) > r.range + 3500) continue;
      const poly = (pts) => { g.beginPath(); pts.forEach((q, i) => { const [x, y] = raw(q[0], q[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); };
      g.fillStyle = h.tone; g.strokeStyle = 'rgba(22,16,14,0.6)'; g.lineWidth = 1.2; g.globalAlpha = 0.9;
      for (const f of h.fingers) { poly(f); g.fill(); g.stroke(); }
      poly(h.outline); g.fill(); g.stroke();
      g.strokeStyle = RIVER; g.lineWidth = 1.6;
      for (const l of h.lines) { g.beginPath(); l.forEach((q, i) => { const [x, y] = raw(q[0], q[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
      g.globalAlpha = 1;
    }
    g.restore();
    for (const h of r.hands) { const [x, y, edge] = at(h.x, h.z); if (edge) { g.fillStyle = SEAL; g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); g.fillStyle = INK; g.font = '600 14px Inter, system-ui, sans-serif'; g.fillText(h.name, cx + (x - cx) * 0.84, cy + (y - cy) * 0.84); continue; } g.font = '700 15px Inter, system-ui, sans-serif'; g.lineWidth = 3.5; g.strokeStyle = 'rgba(243,228,210,0.9)'; g.strokeText(h.name, x, y); g.fillStyle = INK; g.fillText(h.name, x, y); }
    if (r.storm) { const [x, y, edge] = at(r.storm.x, r.storm.z); if (!edge) { g.fillStyle = 'rgba(150,110,60,0.4)'; g.beginPath(); g.arc(x, y, (r.storm.r / r.range) * R, 0, Math.PI * 2); g.fill(); } }
    for (const p of r.blooms) { const [x, y, edge] = at(p.x, p.z); if (!edge) { g.fillStyle = LEAF; g.beginPath(); g.arc(x, y, 3 + p.level * 1.5, 0, Math.PI * 2); g.fill(); } }
    for (const q of r.clouds) { const [x, y, edge] = at(q.x, q.z); if (!edge) { g.fillStyle = q.color; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.5; g.stroke(); } }
    if (r.gold) { const [x, y] = at(r.gold.x, r.gold.z); g.fillStyle = GILT; g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, q = i % 2 ? 6 : 14; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } g.closePath(); g.fill(); g.stroke(); }
    for (const o of r.others) { // other players: the loudest thing on the radar. A bright dot in a breathing ring, the name and how far; out of range, an arrow on the rim
      const [x, y, edge] = at(o.x, o.z), km = Math.hypot(o.x - pos[0], o.z - pos[2]) / 1000, beat = (performance.now() / 900) % 1, label = `${o.name ?? 'player'} · ${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
      g.strokeStyle = `rgba(0,150,220,${1 - beat})`; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 9 + beat * 16, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#0aa4e8'; g.beginPath();
      if (edge) { const a = Math.atan2(y - cy, x - cx); g.moveTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12); g.lineTo(x + Math.cos(a + 2.4) * 12, y + Math.sin(a + 2.4) * 12); g.lineTo(x + Math.cos(a - 2.4) * 12, y + Math.sin(a - 2.4) * 12); g.closePath(); } else g.arc(x, y, 9, 0, Math.PI * 2);
      g.fill(); g.strokeStyle = '#ffffff'; g.lineWidth = 2.5; g.stroke();
      const lx = cx + (x - cx) * (edge ? 0.78 : 1), ly = cy + (y - cy) * (edge ? 0.78 : 1) - (edge ? 0 : 20);
      g.font = '700 17px Inter, system-ui, sans-serif'; g.lineWidth = 4; g.strokeStyle = 'rgba(243,228,210,0.95)'; g.strokeText(label, lx, ly); g.fillStyle = '#075a85'; g.fillText(label, lx, ly);
    }
    g.fillStyle = SEAL; g.beginPath(); g.moveTo(cx, cy - 13); g.lineTo(cx - 9, cy + 9); g.lineTo(cx + 9, cy + 9); g.closePath(); g.fill(); // you, heading up
    radar.tex.needsUpdate = true;
  }
  function paintStats(w) {
    const { g, canvas: c } = stats;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = PAPER; g.beginPath(); g.roundRect(4, 4, c.width - 8, c.height - 8, 28); g.fill();
    g.strokeStyle = 'rgba(22,16,14,0.5)'; g.lineWidth = 2; g.stroke();
    g.textBaseline = 'alphabetic';
    const cols = [[w.flying, 'FLYING NOW'], [w.hands, 'HANDS'], [w.plants, 'GROVES']];
    cols.forEach(([n, label], i) => { const x = 100 + i * 180; drawIcon(g, ['fly', 'hand', 'sow'][i], x - 88, 30, 34, SEAL); g.textAlign = 'center'; g.fillStyle = INK; g.font = '700 44px Inter, system-ui, sans-serif'; g.fillText(Number(n).toLocaleString('en'), x, 62); g.fillStyle = 'rgba(22,16,14,0.6)'; g.font = '500 17px Inter, system-ui, sans-serif'; g.fillText(label, x, 86); });
    g.textAlign = 'left'; g.fillStyle = SEAL; g.font = '700 18px Inter, system-ui, sans-serif'; g.fillText(w.board.title, 28, 128);
    g.textAlign = 'right'; g.fillText(`YOU ${w.board.you}`, c.width - 28, 128);
    w.board.rows.slice(0, 4).forEach((t, i) => { const y = 160 + i * 32; g.textAlign = 'left'; g.fillStyle = INK; g.font = '600 24px Georgia, serif'; g.fillText(`${i + 1}. ${t.name}`, 28, y, 380); g.textAlign = 'right'; g.font = '700 22px Inter, system-ui, sans-serif'; g.fillText(Number(t.n).toLocaleString('en'), c.width - 28, y); });
    g.textAlign = 'left'; g.fillStyle = SEAL; g.font = '700 16px Inter, system-ui, sans-serif'; g.fillText(`GNOMES ON YOUR TEAM ${w.team ?? 0} · CONVERTED ${w.converted ?? 0}`, 28, 286);
    if (!w.board.rows.length) { g.textAlign = 'left'; g.fillStyle = 'rgba(22,16,14,0.6)'; g.font = 'italic 400 24px Georgia, serif'; g.fillText(w.board.empty, 28, 166); }
    stats.tex.needsUpdate = true;
  }

  return {
    group,
    meshes: cards.map((c) => c.mesh), // (on a screen a click on a card puts it away: main.js)
    // show: false in the atelier and on the title; active: the player is steering or something changed
    update(dt, { show, yaw, pos, altitude, place: p, markers, active, garden: gd, radar: rd, world: wd }) {
      clock += dt;
      since = active ? 0 : since + dt;
      const want = show ? (since < 4 ? 1 : 0.85) : 0; // always legible while you fly
      alpha += (want - alpha) * (1 - Math.exp(-dt * 4));
      for (const { mesh: m } of cards) { m.material.opacity = alpha; m.visible = alpha > 0.02 && !m.userData.away; }
      if (alpha <= 0.02 || clock < 0.1) return;
      clock = 0; // repaint at most 10 times a second
      if (neon !== look.neon) { neon = look.neon; lastKey = gardenKey = statsKey = keysKey = ''; } // the look changed (foxfire): paint everything again
      paintRibbon(yaw, bearings(pos, yaw, markers));
      const key = JSON.stringify([p, !!p?.face, spans(altitude)]);
      if (key !== lastKey) { lastKey = key; paintPlace(p, altitude); }
      if (gd) { const k = JSON.stringify([gd.selected?.id, gd.selected?.n, gd.seeds, gd.water, gd.wet, gd.level, gd.found, gd.plot, gd.hyper, Math.round(gd.charge * 20), gd.fox, gd.gnome, gd.hands]); if (k !== gardenKey) { gardenKey = k; paintGarden(gd); } }
      { const k = `${!!gd?.hands}|${!!gd?.touch}`; if (k !== keysKey) { keysKey = k; paintKeys(!!gd?.hands, !!gd?.touch); } }
      if (rd) paintRadar(rd, yaw, pos);
      if (wd) { const k = JSON.stringify(wd); if (k !== statsKey) { statsKey = k; paintStats(wd); } }
    },
  };
}
