// src/stamp.js
// The seal stamp (spec 11.1): a Seal-red stamp that thumps onto your view for the big moments (a Hand
// sealed, a Community Hand sealed). Scale 1.15 -> 1 in 80 ms, holds, fades. A child of the camera.
import { themed } from './ui/themed.js';
import * as THREE from 'three';

const W = 768, H = 384, SEAL = '#b8442e';
export function createStamp() {
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.145), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }));
  mesh.renderOrder = 35;
  mesh.position.set(-0.211, -0.022, -0.65); /* left of your view, between the stats and the place card: never over your whorl or the lesson */
  mesh.visible = false;
  let t = Infinity;
  return {
    mesh,
    show(title, sub = '', kicker = 'SEALED') {
      const g = themed(canvas.getContext('2d')); // calm or foxfire: the same drawing in either look
      g.clearRect(0, 0, W, H);
      g.fillStyle = 'rgba(243, 228, 210, 0.95)';
      g.beginPath(); g.roundRect(8, 8, W - 16, H - 16, 40); g.fill();
      g.strokeStyle = SEAL; g.lineWidth = 10; g.stroke();
      g.lineWidth = 3; g.beginPath(); g.roundRect(30, 30, W - 60, H - 60, 26); g.stroke();
      g.save(); g.translate(130, H / 2); g.rotate(-0.18); // the seal itself
      g.beginPath(); g.arc(0, 0, 80, 0, Math.PI * 2); g.fillStyle = SEAL; g.fill();
      g.strokeStyle = 'rgba(243, 228, 210, 0.9)'; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 64, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#f3e4d2'; g.font = '700 64px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('✋', 0, 4);
      g.restore();
      g.fillStyle = SEAL; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.font = '700 26px Inter, system-ui, sans-serif'; g.fillText(kicker, 250, 140);
      g.fillStyle = '#16100e'; g.font = '600 56px Georgia, serif'; g.fillText(title, 250, 210, W - 290);
      g.fillStyle = 'rgba(22, 16, 14, 0.7)'; g.font = '400 28px Inter, system-ui, sans-serif'; g.fillText(sub, 250, 260, W - 290);
      tex.needsUpdate = true;
      t = 0;
    },
    update(dt) {
      t += dt;
      const k = Math.min(1, t / 0.08);
      mesh.scale.setScalar((1.15 - 0.15 * k) * 0.62); /* a small card among the others */
      mesh.material.opacity = t < 3.5 ? Math.min(1, t / 0.05) : Math.max(0, 1 - (t - 3.5) / 0.6);
      mesh.visible = mesh.material.opacity > 0;
    },
  };
}
