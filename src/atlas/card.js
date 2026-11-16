// src/atlas/card.js
// The palm atlas (spec 11.3 steps 9-11): a parchment card with four tabs. World: the map (drag to pan,
// wheel or spread to zoom, tap a Hand to inspect it), with layer chips. My Hand: your handbits and what
// you have charted. Community: the Community Hand. Journal: the world's history. Opened by turning
// your left palm up (it then follows your palm) or the M key. Taps come in as card uv (0..1).
import * as THREE from 'three';
import { drawMap, mapView, fromMap } from './map.js';
import { W, H, TABS, TAB_LABELS, MAP, LAYERS, layout, hitAt } from './layout.js';
import { TONES } from '../world/scene.js';
import { themed, look } from '../ui/themed.js';

const INK = '#16100e', PAPER = '#f6ead6', SEAL = '#b8442e', GILT = '#c9a35a', RIVER = '#2f5d7c';
const SERIF = 'Georgia, "Times New Roman", serif', SANS = 'Inter, "Segoe UI", system-ui, sans-serif';
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

export function createAtlas() {
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.45), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  mesh.renderOrder = 25;
  mesh.visible = false;
  const g = themed(canvas.getContext('2d')), map = document.createElement('canvas'); // calm or foxfire: the same drawing in either look
  map.width = MAP.w; map.height = MAP.h;
  const mg = themed(map.getContext('2d'));
  let tab = 'world', regions = layout(tab), view = null, layers = Object.fromEntries(LAYERS.map((l) => [l, l !== 'watersheds'])), drag = null, last = null;
  const rasters = new Map(); // hand id -> { mask, r }

  // a Hand's handbits as an image: charted in its skin, uncharted parchment, water blue (half resolution)
  function raster(hand, chart) {
    const d = hand.data;
    if (!d?.cells) return null;
    const mask = chart.mask(hand.id), have = rasters.get(hand.id);
    if (have && have.mask === mask && have.neon === look.neon) return have.r;
    const k = 2, w = Math.ceil(d.w / k), h = Math.ceil(d.h / k), c = document.createElement('canvas');
    c.width = w; c.height = h;
    const cg = c.getContext('2d'), img = cg.createImageData(w, h), tone = hex(TONES[(hand.palette ?? 2) * 3 + 1] ?? '#c98f6b'), parch = look.neon ? [22, 8, 46] : [243, 228, 210], river = look.neon ? [0, 229, 255] : [127, 167, 184]; // in the foxfire the map glows too
    for (let r = 0; r < h; r++) for (let q = 0; q < w; q++) {
      const v = d.cells[(r * k) * d.w + q * k], o = (r * w + q) * 4;
      if (v === -2) continue;
      const col = v === -1 ? river : mask & (1 << v) ? tone : parch;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
    }
    cg.putImageData(img, 0, 0);
    const out = { image: c, x0: d.x0, y0: d.y0, w, h, cell: d.cell * k };
    rasters.set(hand.id, { mask, r: out, neon: look.neon });
    return out;
  }

  const button = (id, x, y, w, h, text, { primary = false, on = true } = {}) => {
    g.fillStyle = primary ? SEAL : on ? PAPER : 'rgba(246,234,214,0.5)';
    g.strokeStyle = primary ? SEAL : on ? INK : 'rgba(22,16,14,0.35)';
    g.lineWidth = 3;
    g.beginPath(); g.roundRect(x, y, w, h, Math.min(h / 2, 30)); g.fill(); g.stroke();
    g.fillStyle = primary ? '#f7eedf' : on ? INK : 'rgba(22,16,14,0.45)';
    g.font = `700 ${Math.min(30, h * 0.45)}px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, x + w / 2, y + h / 2 + 1, w - 16);
    regions.push({ id, x, y, w, h });
  };
  const text = (t, x, y, { font = `400 30px ${SANS}`, color = INK, align = 'left', max = 1100 } = {}) => { g.font = font; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'alphabetic'; g.fillText(t, x, y, max); };

  function paint(s) {
    regions = layout(tab);
    g.clearRect(0, 0, W, H);
    g.fillStyle = PAPER; g.beginPath(); g.roundRect(0, 0, W, H, 36); g.fill();
    g.strokeStyle = INK; g.lineWidth = 4; g.stroke();
    TABS.forEach((t, i) => { // the tab row
      const x = 24 + i * 214, on = t === tab;
      g.fillStyle = on ? INK : PAPER; g.strokeStyle = INK; g.lineWidth = 3;
      g.beginPath(); g.roundRect(x, 22, 200, 64, 32); g.fill(); g.stroke();
      text(TAB_LABELS[t], x + 100, 64, { font: `700 28px ${SANS}`, color: on ? PAPER : INK, align: 'center' });
    });
    g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.roundRect(1100, 22, 76, 64, 32); g.stroke();
    text('✕', 1138, 66, { font: `700 32px ${SANS}`, align: 'center' });

    if (tab === 'world') {
      view ??= mapView(s.hands, MAP.w, MAP.h);
      drawMap(mg, { ...s, view, w: MAP.w, h: MAP.h, layers, raster: (hd) => raster(hd, s.chart) });
      g.drawImage(map, MAP.x, MAP.y);
      g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(MAP.x, MAP.y, MAP.w, MAP.h);
      LAYERS.forEach((l, i) => { // layer chips over the map
        const x = 36 + i * 150, on = layers[l];
        g.fillStyle = on ? 'rgba(22,16,14,0.85)' : 'rgba(246,234,214,0.92)'; g.strokeStyle = INK; g.lineWidth = 2;
        g.beginPath(); g.roundRect(x, MAP.y + 12, 138, 44, 22); g.fill(); g.stroke();
        text(l, x + 69, MAP.y + 42, { font: `600 22px ${SANS}`, color: on ? PAPER : INK, align: 'center' });
      });
      for (const [dir, label, y] of [['in', '+', MAP.y + 90], ['out', '−', MAP.y + 172]]) { g.fillStyle = PAPER; g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.roundRect(MAP.x + MAP.w - 90, y, 72, 72, 36); g.fill(); g.stroke(); text(label, MAP.x + MAP.w - 54, y + 50, { font: `700 44px ${SANS}`, align: 'center' }); }
      if (s.inspect) inspector(s.inspect);
      if (s.timeline) timeline(s.timeline);
    } else if (tab === 'hand') myHand(s);
    else if (tab === 'community') s.community ? s.community.paint(g, regions, { button, text }) : text('The Community Hand needs the shared map.', 60, 200, { font: `italic 400 34px ${SERIF}` });
    else if (tab === 'journal') journal(s);
    else if (tab === 'garden') s.garden?.paint(g, regions, { button, text });
    if (s.pickName) nameCard(s.pickName); // naming floats over any tab
    tex.needsUpdate = true;
  }

  // the inspector: a Hand tapped on the map (spec 11.3 step 10)
  function inspector(q) {
    const x = 700, y = 200, w = 452, h = 600;
    g.fillStyle = 'rgba(246,234,214,0.97)'; g.strokeStyle = INK; g.lineWidth = 3;
    g.beginPath(); g.roundRect(x, y, w, h, 24); g.fill(); g.stroke();
    text(q.kicker, x + 28, y + 50, { font: `700 22px ${SANS}`, color: q.founder ? GILT : SEAL });
    text(q.title, x + 28, y + 106, { font: `600 50px ${SERIF}`, max: w - 56 });
    let yy = y + 150;
    for (const line of q.lines) { text(line, x + 28, yy, { font: `400 25px ${SANS}`, color: 'rgba(22,16,14,0.75)', max: w - 56 }); yy += 36; }
    let by = y + h - 90;
    for (const b of [...q.buttons].reverse()) { button(b.id, x + 28, by, w - 56, 66, b.label, { primary: b.primary }); by -= 80; }
  }
  function timeline(t) { // the world's history: drag to replay the continent growing
    const x = 300, y = MAP.y + MAP.h - 70, w = 600; // bottom centre, clear of the legend and the scale bar
    g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y + 30); g.lineTo(x + w, y + 30); g.stroke();
    const k = (t.at - t.from) / Math.max(1, t.to - t.from);
    g.fillStyle = SEAL; g.beginPath(); g.arc(x + k * w, y + 30, 14, 0, Math.PI * 2); g.fill();
    text(t.label, x, y + 4, { font: `600 22px ${SANS}` });
    regions.push({ id: 'timeline', x, y, w, h: 60 });
  }
  function myHand(s) {
    const m = s.mine;
    if (!m) { text('Lay your Hand to see it here.', 60, 200, { font: `italic 400 36px ${SERIF}` }); return; }
    text(m.name, 60, 170, { font: `600 64px ${SERIF}` });
    const n = s.chart.sealedCount(), c = s.hands.reduce((a, h) => a + s.chart.count(h.id), 0);
    text(`${n} Hand${n === 1 ? '' : 's'} sealed · ${c} handbit${c === 1 ? '' : 's'} charted`, 60, 220, { font: `400 28px ${SANS}`, color: 'rgba(22,16,14,0.7)' });
    const bits = m.handbits ?? [];
    bits.forEach((b, i) => { // two columns of handbits, with the names you gave them
      const x = 60 + (i % 2) * 380, y = 280 + Math.floor(i / 2) * 50;
      text(`${b.code}`, x, y, { font: `700 24px ${SANS}`, color: SEAL });
      text(s.names?.[b.code] ?? b.name, x + 70, y, { font: `400 26px ${SERIF}`, max: 290 });
      regions.push({ id: `handbit:${i}`, x, y: y - 34, w: 360, h: 44 });
    });
    button('postcard', 840, 280, 320, 72, 'Postcard');
    button('export', 840, 372, 320, 72, 'Export my data');
  }
  function nameCard(p) { // naming without a keyboard: a generated name, another, keep (spec 6.4)
    const x = 800, y = 480, w = 380, h = 360;
    g.fillStyle = 'rgba(246,234,214,0.98)'; g.strokeStyle = SEAL; g.lineWidth = 4;
    g.beginPath(); g.roundRect(x, y, w, h, 24); g.fill(); g.stroke();
    text(`NAME ${p.code}`, x + 24, y + 48, { font: `700 22px ${SANS}`, color: SEAL });
    text(p.name, x + 24, y + 116, { font: `600 46px ${SERIF}`, max: w - 48 });
    button('name:another', x + 24, y + 160, w - 48, 64, 'Another name');
    button('name:keep', x + 24, y + 240, w - 48, 72, 'Keep this name', { primary: true });
  }
  function journal(s) {
    const items = s.journal;
    if (!items) { text('The journal needs the shared map.', 60, 200, { font: `italic 400 34px ${SERIF}` }); return; }
    if (!items.length) { text('Nothing has happened yet.', 60, 200, { font: `italic 400 34px ${SERIF}` }); return; }
    items.slice(0, 15).forEach((e, i) => {
      text(e.when, 60, 170 + i * 48, { font: `600 22px ${SANS}`, color: 'rgba(22,16,14,0.55)' });
      text(e.text, 260, 170 + i * 48, { font: `400 28px ${SERIF}`, max: 880 });
    });
  }

  const px = (uv) => [uv.x * W, (1 - uv.y) * H];
  return {
    mesh,
    get isOpen() { return mesh.visible; },
    get tab() { return tab; },
    get view() { return view; },
    get layers() { return layers; },
    // the card along your gaze: 0.7 m in the headset, closer on a screen so it reads at a desk (near: true)
    open(headLocal, headQuat, near = false) {
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuat);
      const pitch = Math.max(-0.6, Math.min(0.17, Math.asin(Math.max(-1, Math.min(1, f.y)))));
      f.setY(0).normalize().multiplyScalar(Math.cos(pitch)).setY(Math.sin(pitch));
      mesh.position.copy(headLocal).addScaledVector(f, near ? 0.42 : 0.7);
      mesh.lookAt(mesh.parent.localToWorld(headLocal.clone()));
      mesh.visible = true;
    },
    // above your upturned left palm, facing you (all in the parent's space)
    follow(palmCenter, headLocal, dt) {
      const want = new THREE.Vector3(...palmCenter).add(new THREE.Vector3(0, 0.28, 0));
      mesh.position.lerp(want, 1 - Math.exp(-dt * 8));
      mesh.lookAt(mesh.parent.localToWorld(headLocal.clone()));
    },
    close() { mesh.visible = false; drag = null; },
    paint,
    setTab(t) { if (TABS.includes(t)) tab = t; },
    fit(hands) { view = mapView(hands, MAP.w, MAP.h); },
    toggle(layer) { layers[layer] = !layers[layer]; },
    // a press: on the map it may become a drag (pan) or a tap; elsewhere it is the region's action
    down(uv) {
      const p = px(uv), a = hitAt(regions, p);
      last = p;
      if (a?.type === 'map' || a?.type === 'timeline') { drag = { start: p, moved: 0, type: a.type }; return a.type === 'timeline' ? { type: 'timeline', k: (p[0] - 300) / 600 } : null; }
      return a;
    },
    move(uv) {
      if (!drag) return null;
      const p = px(uv), dx = p[0] - last[0], dy = p[1] - last[1];
      last = p;
      drag.moved += Math.hypot(dx, dy);
      if (drag.type === 'timeline') return { type: 'timeline', k: Math.max(0, Math.min(1, (p[0] - 300) / 600)) };
      if (view && drag.moved > 8) { view.cx -= dx / view.scale; view.cz -= dy / view.scale; }
      return null;
    },
    up() {
      const d = drag;
      drag = null;
      if (!d || d.type !== 'map' || d.moved > 8 || !view) return null;
      const [x, z] = fromMap(view, d.start[0] - MAP.x, d.start[1] - MAP.y, MAP.w, MAP.h);
      return { type: 'pick', x, z };
    },
    zoom(k, uv = null) { if (view) view.scale = Math.max(0.0008, Math.min(0.2, view.scale * k)); },
  };
}
