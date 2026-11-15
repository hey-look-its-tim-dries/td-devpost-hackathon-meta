// src/hud.js
// The flight HUD (spec 11.3 step 8), minimal and fading when idle: a compass ribbon at the top of your
// view with markers (your Hand, the Source, pins, the nearest player), and a place card bottom left
// (handbit, Hand, charted count) with your altitude in spans. Both are children of the camera, inside
// 24 degrees of the centre so the glasses profile shows them whole.
import * as THREE from 'three';

import { bearings, spans } from './compass.js';

const PUN = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']; // -z is north

const card = (w, h, mw, mh, pos) => {
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
  mesh.renderOrder = 28;
  mesh.position.set(...pos);
  return { canvas, tex, mesh, g: canvas.getContext('2d') };
};

export function createHud() {
  const group = new THREE.Group();
  const ribbon = card(1024, 128, 0.34, 0.0425, [0, 0.19, -0.65]);
  const place = card(640, 200, 0.2, 0.0625, [-0.15, -0.165, -0.65]);
  group.add(ribbon.mesh, place.mesh);
  let alpha = 0, since = 0, lastKey = '', clock = 0;
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
    for (const m of marks) { // markers above the ribbon, edge arrows when off it
      const x = 512 + m.x * 470, col = m.color ?? SEAL;
      g.fillStyle = col;
      g.beginPath();
      if (Math.abs(m.x) >= 0.999) { const s = Math.sign(m.x); g.moveTo(x + s * 14, 60); g.lineTo(x - s * 6, 46); g.lineTo(x - s * 6, 74); }
      else { g.moveTo(x, 34); g.lineTo(x - 9, 18); g.lineTo(x + 9, 18); }
      g.fill();
      g.font = '600 20px Inter, system-ui, sans-serif'; g.fillStyle = INK;
      if (Math.abs(m.x) < 0.999) g.fillText(`${m.label} ${spans(m.dist)}`, x, 108);
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
    } else {
      g.fillStyle = 'rgba(22,16,14,0.6)'; g.font = 'italic 400 34px Georgia, serif'; g.fillText('the wilderness', 28, 110);
    }
    g.textAlign = 'right'; g.fillStyle = INK; g.font = '700 40px Inter, system-ui, sans-serif'; g.fillText(spans(altitude), c.width - 28, 104);
    g.font = '500 20px Inter, system-ui, sans-serif'; g.fillStyle = 'rgba(22,16,14,0.6)'; g.fillText('SPANS UP', c.width - 28, 140);
    place.tex.needsUpdate = true;
  }

  return {
    group,
    // show: false in the atelier and on the title; active: the player is steering or something changed
    update(dt, { show, yaw, pos, altitude, place: p, markers, active }) {
      clock += dt;
      since = active ? 0 : since + dt;
      const want = show ? (since < 4 ? 1 : 0.35) : 0;
      alpha += (want - alpha) * (1 - Math.exp(-dt * 4));
      for (const m of [ribbon.mesh, place.mesh]) { m.material.opacity = alpha; m.visible = alpha > 0.02; }
      if (alpha <= 0.02 || clock < 0.1) return;
      clock = 0; // repaint at most 10 times a second
      paintRibbon(yaw, bearings(pos, yaw, markers));
      const key = JSON.stringify([p, spans(altitude)]);
      if (key !== lastKey) { lastKey = key; paintPlace(p, altitude); }
    },
  };
}
