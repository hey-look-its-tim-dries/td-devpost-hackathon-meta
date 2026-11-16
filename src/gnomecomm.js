// src/gnomecomm.js
// Grandfather Tuft calling in: a small window in your view with his face, his name and what he is saying, the way
// a wingman calls in over the radio. His mouth moves while he talks. A child of the HUD (top right), drawn here; what he says and when is the game's business (src/garden/voice.js).
import * as THREE from 'three';
import { themed, look } from './ui/themed.js';

const W = 1024, H = 400, INK = '#16100e', SEAL = '#b8442e';
export function createGnomeComm() {
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.074), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
  mesh.renderOrder = 33;
  mesh.visible = false;
  mesh.position.set(0.225, 0.095, -0.65); // top right of your view (the radar sits under him)
  let drawn = '', clock = 0;
  // his face: 16 frames rendered in Blender (tools/blender/tuft.py), 8 x 2 of 256 px: frame 0 at rest, 1..15 talking
  const sheet = new Image();
  sheet.src = new URL('../assets/tuft.png', import.meta.url).href;
  function face(g, cx, cy, frame) {
    g.save(); g.beginPath(); g.roundRect(cx - 150, cy - 160, 300, 320, 40); g.clip();
    const sky = g.createLinearGradient(0, cy - 160, 0, cy + 160); sky.addColorStop(0, '#f1d9bd'); sky.addColorStop(1, '#d9a57e');
    g.fillStyle = sky; g.fillRect(cx - 150, cy - 160, 300, 320);
    if (sheet.complete && sheet.naturalWidth) g.drawImage(sheet, (frame % 8) * 256, Math.floor(frame / 8) * 256, 256, 256, cx - 212, cy - 178, 424, 424); // close on his face
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
      const open = s.talking ? 1 + (Math.floor(clock * 11) % 15) : 0; // which frame of his face
      const key = `${look.neon}|${s.text}|${open}|${sheet.complete}`;
      if (key !== drawn) { drawn = key; paint(s, open); tex.needsUpdate = true; }
    },
  };
}
