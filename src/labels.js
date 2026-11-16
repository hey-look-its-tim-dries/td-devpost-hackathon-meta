// src/labels.js
// A name tag floating over another player: ink on a parchment pill, always facing you, scaled with
// distance so it reads at the same size near or far (about 1.4 degrees tall).
import { themed } from './ui/themed.js';
import * as THREE from 'three';

const W = 512, H = 96;
export function createLabel(text = '') {
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
  sprite.renderOrder = 15;
  let shown = null;
  const label = {
    sprite,
    set(t) {
      if (t === shown) return;
      shown = t;
      const g = themed(canvas.getContext('2d')); // calm or foxfire: the same drawing in either look
      g.clearRect(0, 0, W, H);
      g.font = '600 52px Georgia, "Times New Roman", serif';
      const w = Math.min(W - 8, g.measureText(t).width + 56);
      g.fillStyle = 'rgba(243, 228, 210, 0.92)';
      g.beginPath();
      g.roundRect((W - w) / 2, 6, w, H - 12, 40);
      g.fill();
      g.strokeStyle = 'rgba(22, 16, 14, 0.8)';
      g.lineWidth = 3;
      g.stroke();
      g.fillStyle = '#16100e';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(t, W / 2, H / 2 + 2, W - 60);
      tex.needsUpdate = true;
    },
    // over `pos` (world), sized for a viewer at `eye`
    update(pos, eye) {
      sprite.position.set(pos[0], pos[1] + 30, pos[2]);
      const d = sprite.position.distanceTo(eye), h = d * 0.025;
      sprite.scale.set(h * (W / H), h, 1);
    },
    dispose() { tex.dispose(); sprite.material.dispose(); },
  };
  label.set(text);
  return label;
}
