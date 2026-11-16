// src/tutorialcard.js
// The tutorial's card: fixed in your view under the compass. Which step you are on, what to do (in hand
// movements in the headset, in keys on a screen), and a bar that fills as you do it. The steps and when
// they are done are src/garden/tutorial.js.
import * as THREE from 'three';
import { themed, look } from './ui/themed.js';
import { STEPS } from './garden/tutorial.js';
import { drawIcon } from './ui/icons.js';

const W = 1024, H = 300, INK = '#16100e', SEAL = '#b8442e';
export function createTutorialCard(y = 0.125) { // y: how high in your view
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.088), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
  mesh.renderOrder = 34;
  mesh.visible = false;
  mesh.scale.setScalar(0.86); // between the stats card and the radar, clear of both
  mesh.position.set(0, y, -0.65); // a child of the camera: between the compass and the middle of your view
  let drawn = '';
  function paint(s) {
    const g = themed(canvas.getContext('2d')); // calm or foxfire: the same drawing in either look
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(243, 228, 210, 0.95)'; g.beginPath(); g.roundRect(6, 6, W - 12, H - 12, 36); g.fill();
    g.strokeStyle = SEAL; g.lineWidth = 6; g.stroke();
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    if (s.note) { // a what-is-what note: its name, and two lines of what it is
      g.fillStyle = SEAL; g.font = '700 28px Inter, system-ui, sans-serif'; g.fillText(`WHAT IS THIS · ${s.note.title.toUpperCase()}`, 40, 62);
      g.fillStyle = INK; g.font = '600 38px Georgia, serif';
      const words = s.note.text.split(' '); let line = '', row = 0;
      for (const w of words) { if (g.measureText(`${line} ${w}`).width > W - 90 && line) { g.fillText(line, 40, 122 + row++ * 50); line = w; } else line = line ? `${line} ${w}` : w; }
      g.fillText(line, 40, 122 + row * 50);
      g.fillStyle = 'rgba(22,16,14,0.15)'; g.beginPath(); g.roundRect(40, 262, W - 80, 10, 5); g.fill();
      g.fillStyle = SEAL; g.beginPath(); g.roundRect(40, 262, Math.max(10, (W - 80) * (1 - s.progress)), 10, 5); g.fill(); // how long it stays
      return;
    }
    g.fillStyle = SEAL; g.font = '700 28px Inter, system-ui, sans-serif'; g.fillText(`TUTORIAL · ${s.index + 1} OF ${STEPS.length} · ${s.step.title.toUpperCase()}`, 40, 62);
    g.textAlign = 'right'; g.fillStyle = 'rgba(22,16,14,0.6)'; g.font = '500 22px Inter, system-ui, sans-serif'; g.fillText(s.hands ? 'skip: left palm up, How' : 'Esc skips', W - 40, 62);
    drawIcon(g, s.step.icon, 40, 92, 64, SEAL); // what the step is about
    g.textAlign = 'left'; g.fillStyle = INK; g.font = '600 52px Georgia, serif'; g.fillText(s.hands ? s.step.hand : s.step.keys, 124, 144, W - 164);
    g.fillStyle = 'rgba(22,16,14,0.15)'; g.beginPath(); g.roundRect(40, 186, W - 80, 22, 11); g.fill();
    g.fillStyle = s.coach ? SEAL : '#3f7d3a'; g.font = '700 30px Inter, system-ui, sans-serif'; g.fillText(s.coach ?? (s.ready ? 'You are in the right place: do it now' : ''), 40, 258, W - 80); // what is still missing, or the go-ahead
    if (s.progress > 0.01) { g.fillStyle = '#3f7d3a'; g.beginPath(); g.roundRect(40, 186, Math.max(22, (W - 80) * s.progress), 22, 11); g.fill(); }
  }
  return {
    mesh,
    // s: { index, step, progress, hands, coach (what is missing, or null), ready (the step needs a place, and you are there) }, or null to hide it
    update(dt, s) {
      mesh.material.opacity += ((s ? 1 : 0) - mesh.material.opacity) * (1 - Math.exp(-dt * 8));
      mesh.visible = mesh.material.opacity > 0.02;
      if (!s) return;
      const key = `${look.neon}|${s.note?.id}|${s.index}|${s.hands}|${Math.round(s.progress * 40)}|${s.coach}|${s.ready}`;
      if (key !== drawn) { drawn = key; paint(s); tex.needsUpdate = true; }
    },
  };
}
