// src/gnomecomm.js
// Grandfather Tuft calling in: a small window in your view with his face, his name and what he is saying, the way
// a wingman calls in over the radio. His mouth moves while he talks. A child of the HUD (left, under the world's
// numbers), drawn here; what he says and when is the game's business (src/garden/voice.js).
import * as THREE from 'three';
import { themed, look } from './ui/themed.js';

const W = 1024, H = 400, INK = '#16100e', SEAL = '#b8442e';
export function createGnomeComm() {
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.082), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
  mesh.renderOrder = 33;
  mesh.visible = false;
  mesh.position.set(-0.185, -0.045, -0.65); // left of your view, between the world's numbers and the place card
  let drawn = '', clock = 0;
  function face(g, cx, cy, open) { // an old gnome: red hat, bushy brows, a big nose, a long white beard; `open` 0..1 is his mouth
    g.save(); g.beginPath(); g.roundRect(cx - 150, cy - 160, 300, 320, 40); g.clip();
    g.fillStyle = '#3f6a4a'; g.fillRect(cx - 150, cy - 160, 300, 320);
    g.fillStyle = '#e9b99a'; g.beginPath(); g.ellipse(cx, cy + 10, 92, 100, 0, 0, Math.PI * 2); g.fill(); // the face
    g.fillStyle = '#f4f1ea'; g.beginPath(); g.moveTo(cx - 104, cy + 20); g.quadraticCurveTo(cx - 120, cy + 150, cx, cy + 200); g.quadraticCurveTo(cx + 120, cy + 150, cx + 104, cy + 20); g.quadraticCurveTo(cx, cy + 70, cx - 104, cy + 20); g.fill(); // the beard
    g.fillStyle = '#5a2c22'; g.beginPath(); g.ellipse(cx, cy + 78, 26, 5 + 20 * open, 0, 0, Math.PI * 2); g.fill(); // the mouth
    g.fillStyle = '#f4f1ea'; g.beginPath(); g.ellipse(cx - 34, cy + 58, 44, 17, 0.25, 0, Math.PI * 2); g.ellipse(cx + 34, cy + 58, 44, 17, -0.25, 0, Math.PI * 2); g.fill(); // the moustache
    g.fillStyle = '#d99a7c'; g.beginPath(); g.ellipse(cx, cy + 30, 30, 26, 0, 0, Math.PI * 2); g.fill(); // the nose
    g.fillStyle = INK; g.beginPath(); g.arc(cx - 38, cy - 12, 8, 0, Math.PI * 2); g.arc(cx + 38, cy - 12, 8, 0, Math.PI * 2); g.fill(); // the eyes
    g.strokeStyle = '#f4f1ea'; g.lineWidth = 12; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx - 64, cy - 34 - 6 * open); g.lineTo(cx - 20, cy - 30); g.moveTo(cx + 64, cy - 34 - 6 * open); g.lineTo(cx + 20, cy - 30); g.stroke(); // the brows
    g.fillStyle = '#c8362c'; g.beginPath(); g.moveTo(cx - 118, cy - 44); g.quadraticCurveTo(cx - 30, cy - 150, cx + 60, cy - 230); g.quadraticCurveTo(cx + 80, cy - 110, cx + 118, cy - 44); g.quadraticCurveTo(cx, cy - 78, cx - 118, cy - 44); g.fill(); // the hat
    g.restore();
    g.strokeStyle = SEAL; g.lineWidth = 6; g.beginPath(); g.roundRect(cx - 150, cy - 160, 300, 320, 40); g.stroke();
  }
  function paint(s, open) {
    const g = themed(canvas.getContext('2d')); // calm or foxfire: the same drawing in either look
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(243, 228, 210, 0.95)'; g.beginPath(); g.roundRect(6, 6, W - 12, H - 12, 40); g.fill();
    g.strokeStyle = SEAL; g.lineWidth = 6; g.stroke();
    face(canvas.getContext('2d'), 190, 200, open); // (his own colours, in either look)
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = SEAL; g.font = '700 30px Inter, system-ui, sans-serif'; g.fillText('GRANDFATHER TUFT', 372, 74);
    g.fillStyle = INK; g.font = '600 40px Georgia, serif';
    let line = '', row = 0;
    for (const w of s.text.split(' ')) { if (g.measureText(`${line} ${w}`).width > W - 410 && line) { g.fillText(line, 372, 136 + row++ * 52); line = w; } else line = line ? `${line} ${w}` : w; }
    g.fillText(line, 372, 136 + row * 52);
  }
  return {
    mesh,
    // s: { text, talking } while he is on the line, or null
    update(dt, s) {
      clock += dt;
      mesh.material.opacity += ((s ? 1 : 0) - mesh.material.opacity) * (1 - Math.exp(-dt * 10));
      mesh.visible = mesh.material.opacity > 0.02;
      if (!s) return;
      const open = s.talking ? Math.round((0.5 + 0.5 * Math.sin(clock * 17) * Math.sin(clock * 5.3 + 1)) * 3) / 3 : 0;
      const key = `${look.neon}|${s.text}|${open}`;
      if (key !== drawn) { drawn = key; paint(s, open); tex.needsUpdate = true; }
    },
  };
}
