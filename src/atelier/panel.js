// src/atelier/panel.js
import * as THREE from 'three';
import { glyph } from './glyphs.js';
import { palmView, toPixel, strokeToLine, lineToPixels } from './strokes.js';
import { PICKS, FINGER_NAMES, LINE_STEPS } from './flow.js';
import { OUTLINE, FINGERS } from '../hand/shape.js';
import { TONES } from '../world/scene.js';

// The atelier: one paper card in front of you that walks you through reading your hand by eye. Poke
// it with a fingertip, pinch while looking at it, or click it. On the lines page you trace on the
// drawing of a palm, with a fingertip pressed to the card or with the mouse. 0.6 x 0.45 m at 0.75 m:
// inside the 30 degree cone, and its smallest text (22 px of 900) is about 17 mm tall.
const W = 1200, H = 900, INK = '#16100e', PAPER = '#f6ead6', SEAL = '#a8402b', RIVER = '#2f5d7c', GILT = '#a88442';
const SERIF = 'Georgia, "Times New Roman", serif', SANS = 'Inter, "Segoe UI", system-ui, sans-serif';
const LABEL = { arch: 'arch', tented: 'tented arch', ulnar: 'loop', whorl: 'whorl', pocket: 'pocket loop', double: 'double loop' };
const HINT = {
  heart: 'From the little-finger edge towards your index finger.',
  head: 'From between thumb and index finger, across the palm.',
  life: 'Round the base of your thumb, down towards the wrist.',
  fate: 'Up the middle of the palm from the wrist. Many hands have none.',
};
const DRAW = { x: 40, y: 150, w: 640, h: 710 }; // where the palm is drawn on the lines page

export function createAtelierPanel() {
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.45),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }),
  );
  mesh.renderOrder = 25;
  mesh.visible = false;
  const glyphs = Object.fromEntries(PICKS.map((cls, i) => [cls, glyph(cls, 150, 186, i + 3)]));
  const view = palmView(DRAW.x, DRAW.y, DRAW.w, DRAW.h);
  const g = canvas.getContext('2d');
  let regions = [], stroke = null, warn = false;

  const button = (id, x, y, w, h, text, primary = false) => {
    g.fillStyle = primary ? SEAL : PAPER;
    g.strokeStyle = primary ? SEAL : INK;
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(x, y, w, h, h / 2);
    g.fill();
    g.stroke();
    g.fillStyle = primary ? '#f7eedf' : INK;
    g.font = `700 30px ${SANS}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, x + w / 2, y + h / 2 + 1, w - 20);
    regions.push({ id, x, y, w, h });
  };
  const header = (step, title, sub) => {
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillStyle = SEAL;
    g.font = `700 24px ${SANS}`;
    g.fillText(step.toUpperCase(), 40, 56);
    g.fillStyle = INK;
    g.font = `400 52px ${SERIF}`;
    g.fillText(title, 40, 110, W - 80);
    g.fillStyle = 'rgba(22,16,14,0.65)';
    g.font = `400 26px ${SANS}`;
    g.fillText(sub, 40, 142, W - 80);
  };
  const path = (pts, close) => {
    g.beginPath();
    pts.forEach((p, i) => { const [x, y] = toPixel(view, p); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    if (close) g.closePath();
  };
  const polyline = (pixels, colour, width, dash = []) => {
    g.setLineDash(dash);
    g.strokeStyle = colour;
    g.lineWidth = width;
    g.lineCap = 'round';
    g.beginPath();
    pixels.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    g.setLineDash([]);
  };
  const fingerOutline = (f) => {
    const hw = f.width / 2, at = (u, t) => [f.base[0] + f.side[0] * u + f.dir[0] * t, f.base[1] + f.side[1] * u + f.dir[1] * t];
    const pts = [at(-hw, 0)];
    for (let a = 0; a <= 12; a++) { const ang = Math.PI - (a / 12) * Math.PI; pts.push(at(Math.cos(ang) * hw, f.len - hw + Math.sin(ang) * hw)); }
    pts.push(at(hw, 0));
    return pts;
  };
  const drawPalm = (flow) => {
    g.fillStyle = '#ecc9aa';
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.lineJoin = 'round';
    for (const f of FINGERS) { path(fingerOutline(f), false); g.fill(); g.stroke(); }
    path(OUTLINE, true);
    g.fill();
    g.stroke();
    for (const l of flow.lines) polyline(lineToPixels(view, l.pts), RIVER, 9);
    const guide = flow.guide();
    if (guide) polyline(lineToPixels(view, guide), GILT, 5, [12, 12]);
    if (stroke) polyline(stroke, RIVER, 9);
  };

  function paint(flow) {
    regions = [];
    g.clearRect(0, 0, W, H);
    g.fillStyle = PAPER;
    g.beginPath();
    g.roundRect(4, 4, W - 8, H - 8, 36);
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 4;
    g.stroke();
    if (flow.step === 'prints') {
      header('1 of 3 · your prints', `Which pattern is on your ${FINGER_NAMES[flow.finger]}?`, 'Look at the fingertip, then touch the pattern that matches.');
      FINGER_NAMES.forEach((n, k) => { // the five fingers as chips: done, now, to come
        const x = 40 + k * 120, done = k < flow.finger, now = k === flow.finger;
        g.fillStyle = done ? INK : PAPER;
        g.strokeStyle = now ? SEAL : INK;
        g.lineWidth = now ? 6 : 2;
        g.beginPath();
        g.roundRect(x, 180, 104, 48, 24);
        g.fill();
        g.stroke();
        g.fillStyle = done ? '#f7eedf' : INK;
        g.font = `700 22px ${SANS}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(n.split(' ')[0], x + 52, 205);
      });
      PICKS.forEach((cls, k) => {
        const x = 40 + (k % 3) * 300, y = 260 + Math.floor(k / 3) * 300;
        g.fillStyle = '#fbf3e6';
        g.strokeStyle = 'rgba(22,16,14,0.35)';
        g.lineWidth = 2;
        g.beginPath();
        g.roundRect(x, y, 270, 280, 20);
        g.fill();
        g.stroke();
        g.drawImage(glyphs[cls], x + 60, y + 20);
        g.fillStyle = INK;
        g.font = `600 28px ${SERIF}`;
        g.textAlign = 'center';
        g.textBaseline = 'alphabetic';
        g.fillText(LABEL[cls], x + 135, y + 250);
        regions.push({ id: `pick:${cls}`, x, y, w: 270, h: 280 });
      });
      button('notSure', 960, 520, 200, 70, 'Not sure');
    } else if (flow.step === 'lines') {
      const [kind, everyone] = LINE_STEPS[flow.line];
      header('2 of 3 · your lines', `Trace your ${kind} line`, HINT[kind]);
      drawPalm(flow);
      regions.push({ id: 'draw', ...DRAW });
      let y = 260;
      button('guide', 730, y, 430, 72, 'Use the dotted guide');
      y += 100;
      if (!everyone) { button('noLine', 730, y, 430, 72, "I don't have one"); y += 100; }
      button('typical', 730, y, 430, 72, 'Use a typical palm');
      if (warn) { g.fillStyle = SEAL; g.font = `600 26px ${SANS}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText('Trace along the whole line', 730, y + 130); }
    } else if (flow.step === 'palette') {
      header('3 of 3 · your Hand', flow.name, 'Choose its skin. Any palette: it does not have to match yours.');
      for (let i = 0; i < 6; i++) {
        const x = 40 + i * 185, y = 200, now = i === flow.palette;
        for (let t = 0; t < 3; t++) { g.fillStyle = TONES[i * 3 + t]; g.fillRect(x, y + t * 60, 165, 60); }
        g.strokeStyle = now ? SEAL : 'rgba(22,16,14,0.35)';
        g.lineWidth = now ? 8 : 2;
        g.strokeRect(x, y, 165, 180);
        regions.push({ id: `palette:${i}`, x, y, w: 165, h: 180 });
      }
      button('reroll', 40, 440, 300, 72, 'Another name');
      button('lay', 700, 720, 460, 110, 'Lay my Hand', true);
    }
    tex.needsUpdate = true;
  }

  const px = (uv) => [uv.x * W, (1 - uv.y) * H];
  const regionAt = ([x, y]) => regions.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)?.id ?? null;
  const action = (id) => {
    if (!id || id === 'draw') return null;
    const [type, arg] = id.split(':');
    if (type === 'pick') return { type, cls: arg };
    if (type === 'palette') return { type, i: +arg };
    return { type };
  };

  return {
    mesh,
    get isOpen() { return mesh.visible; },
    // the card 0.75 m along your gaze (never more than 35 degrees down or 10 up), turned to face you
    // (head pose in the parent's space)
    open(headLocal, headQuat) {
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuat);
      const pitch = Math.max(-0.6, Math.min(0.17, Math.asin(Math.max(-1, Math.min(1, f.y)))));
      f.setY(0).normalize().multiplyScalar(Math.cos(pitch)).setY(Math.sin(pitch));
      mesh.position.copy(headLocal).addScaledVector(f, 0.75);
      mesh.lookAt(mesh.parent.localToWorld(headLocal.clone()));
      mesh.visible = true;
    },
    close() { mesh.visible = false; stroke = null; },
    paint,
    down(uv, flow) {
      const p = px(uv), id = regionAt(p);
      if (id === 'draw' && flow.step === 'lines') { stroke = [p]; paint(flow); return null; }
      return action(id);
    },
    move(uv, flow) {
      if (!stroke) return;
      const p = px(uv), last = stroke[stroke.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 4) { stroke.push(p); paint(flow); }
    },
    up(flow) {
      if (!stroke) return null;
      const pts = strokeToLine(view, stroke);
      stroke = null;
      warn = !pts;
      paint(flow);
      return { type: 'traced', pts };
    },
  };
}
