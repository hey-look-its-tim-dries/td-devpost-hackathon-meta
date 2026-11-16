import * as THREE from 'three';
import { themed, look } from './ui/themed.js';

// The gesture card: a small card fixed at the bottom of your view that says what your hand is
// commanding right now. Not steering: the three parts of the palm-down gesture as a checklist, each
// with how far along it is, and a bar that fills during the half-second hold. Steering: a red
// "STEERING" with turn and climb gauges. Works the same for headset hands and webcam hands.
const W = 640, H = 240;
const INK = '#16100e', PAPER = 'rgba(246, 232, 216, 0.95)', SEAL = '#a8402b', MUTED = 'rgba(22, 16, 14, 0.45)';
const FONT = 'Inter, "Segoe UI", system-ui, sans-serif';
const PARTS = [['raised', 'hand up'], ['open', 'no fist']];

export function createGestureCard() {
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.1125), // 28 degrees wide at 0.6 m: its smallest text stays above 1 degree
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }),
  );
  mesh.renderOrder = 30;
  mesh.visible = false;
  mesh.position.set(0, -0.24, -0.6); // a child of the camera: bottom centre, about 22 degrees down
  let drawn = '';

  function paint(s) {
    const g = themed(canvas.getContext('2d')); // calm or foxfire: the same drawing in either look
    g.clearRect(0, 0, W, H);
    g.fillStyle = PAPER;
    g.beginPath();
    g.roundRect(4, 4, W - 8, H - 8, 28);
    g.fill();
    g.strokeStyle = s.steering ? SEAL : 'rgba(22, 16, 14, 0.5)';
    g.lineWidth = s.steering ? 6 : 3;
    g.stroke();
    // the command line
    g.textBaseline = 'middle';
    g.font = `800 34px ${FONT}`;
    const label = s.steering ? 'STEERING' : 'NOT STEERING';
    const lw = g.measureText(label).width + 40;
    g.fillStyle = s.steering ? SEAL : 'transparent';
    g.beginPath();
    g.roundRect(24, 22, lw, 54, 27);
    g.fill();
    if (!s.steering) { g.strokeStyle = MUTED; g.lineWidth = 3; g.stroke(); }
    g.fillStyle = s.steering ? '#f7eedf' : MUTED;
    g.fillText(label, 44, 50);
    g.font = `600 30px ${FONT}`;
    g.fillStyle = INK;
    g.textAlign = 'right';
    g.fillText(s.steering ? 'point where you want to fly' : 'raise a relaxed hand', W - 30, 50);
    g.textAlign = 'left';
    if (s.steering) {
      // turn: a track with a marker; climb: the same, standing up
      const gauge = (x, y, w, v, name) => {
        g.fillStyle = MUTED;
        g.fillRect(x, y - 3, w, 6);
        g.fillRect(x + w / 2 - 2, y - 14, 4, 28);
        g.fillStyle = SEAL;
        g.beginPath();
        g.arc(x + w / 2 + (v * w) / 2, y, 14, 0, Math.PI * 2);
        g.fill();
        g.font = `600 26px ${FONT}`;
        g.fillStyle = INK;
        g.fillText(`${name} ${v > 0.05 ? (name === 'turn' ? 'right' : 'up') : v < -0.05 ? (name === 'turn' ? 'left' : 'down') : 'straight'} ${Math.round(Math.abs(v) * 100)}%`, x, y + 44);
      };
      gauge(40, 132, 260, s.turn, 'turn');
      gauge(340, 132, 260, s.climb, 'climb');
      return;
    }
    // the checklist: a chip per part, filled when good, with how far along it is
    PARTS.forEach(([key, name], k) => {
      const w = (W - 48 - 12 * (PARTS.length - 1)) / PARTS.length, c = s.checks?.[key], x = 24 + k * (w + 12), y = 96, h = 62;
      const ok = !!c?.ok, frac = c ? c.frac : 0;
      g.fillStyle = ok ? INK : 'transparent';
      g.beginPath();
      g.roundRect(x, y, w, h, 14);
      g.fill();
      g.setLineDash(ok ? [] : [8, 6]);
      g.strokeStyle = ok ? INK : MUTED;
      g.lineWidth = 3;
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = ok ? '#f7eedf' : INK;
      g.font = `700 24px ${FONT}`;
      g.fillText(`${ok ? '✓' : '○'} ${name}`, x + 14, y + 24, w - 28);
      if (!ok) { // how close: a thin bar under the name
        g.fillStyle = MUTED;
        g.fillRect(x + 14, y + 46, w - 28, 5);
        g.fillStyle = INK;
        g.fillRect(x + 14, y + 46, (w - 28) * frac, 5);
      }
    });
    // the hold: fills over half a second once all three are good
    g.fillStyle = MUTED;
    g.fillRect(24, 186, W - 48, 10);
    g.fillStyle = SEAL;
    g.fillRect(24, 186, (W - 48) * s.progress, 10);
    g.font = `600 22px ${FONT}`;
    g.fillStyle = INK;
    g.fillText(s.checks?.all ? 'hold still…' : s.checks ? 'not yet' : 'show me your hand', 24, 218);
  }

  return {
    mesh,
    // s: { checks (null when no hand is seen), progress, steering, turn, climb }, or null to hide it
    update(dt, s) {
      const want = s ? 1 : 0;
      mesh.material.opacity += (want - mesh.material.opacity) * (1 - Math.exp(-dt * 8));
      mesh.visible = mesh.material.opacity > 0.02;
      if (!s) return;
      const key = JSON.stringify([look.neon, s.steering, Math.round(s.turn * 20), Math.round(s.climb * 20), Math.round(s.progress * 10),
        ...PARTS.map(([k]) => s.checks && [s.checks[k].ok, Math.round(s.checks[k].frac * 10)])]);
      if (key !== drawn) { drawn = key; paint(s); tex.needsUpdate = true; }
    },
  };
}
