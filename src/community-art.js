// src/community-art.js
// The Community Hand (spec 6.4, 11.3 step 11), drawn the way a map is: a gilt hand outline 4.4 km
// across lying on the Source lake, each of its 22 slots filled in the donor's skin tone as handbits are
// given, with "14 of 22 · sealed 3" beneath. The same drawing serves the atlas's Community tab.
import * as THREE from 'three';
import { labelHand } from './hand/label.js';
import { handShape, templatePalm } from './hand/shape.js';
import { SLOTS } from './world/community.js';
import { nearest, worldCells } from './world/worldcells.js';
import { TONES } from './world/scene.js';

const S = 1024, GILT = '#c9a35a', INK = '#16100e';
const LAB = labelHand(handShape(templatePalm({ seed: 1, fate: true, sun: true, mercury: true })), 3); // a palm cut into exactly 7 regions
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));

const NEAR = nearest(LAB);

export function createCommunityArt() {
  const canvas = Object.assign(document.createElement('canvas'), { width: S, height: S });
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4400, 4400), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, 3, 0);
  mesh.renderOrder = 2;
  let state = { no: 1, sealed: 0, slots: [] }, world = new Map(), groves = 0, worldKey = '';

  function paint() {
    g.clearRect(0, 0, S, S);
    const filled = new Map(state.slots.map((q) => [q.slot, q]));
    // the hand, cell by cell: given slots in their donor's tone, open ones a pale gilt wash
    const k = Math.min(860 / LAB.w, 860 / LAB.h), ox = (S - LAB.w * k) / 2, oy = 40;
    const img = g.createImageData(S, S);
    for (let r = 0; r < LAB.h; r++) for (let c = 0; c < LAB.w; c++) {
      const L = LAB.label[r * LAB.w + c];
      if (L < 0) continue;
      const slot = SLOTS[L], q = filled.get(slot), sown = world.get(r * LAB.w + c), col = sown ? hex(sown) : q ? hex(TONES[(q.palette ?? 2) * 3 + 1]) : [233, 214, 170]; /* a sowing somewhere in the world: its flower's colour, here */
      const x0 = Math.floor(ox + c * k), y0 = Math.floor(oy + (LAB.h - 1 - r) * k); // north up: the fingers point away from the Source's south shore
      for (let y = y0; y < y0 + Math.ceil(k); y++) for (let x = x0; x < x0 + Math.ceil(k); x++) { const o = (y * S + x) * 4; img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = sown ? 255 : q ? 235 : 150; }
    }
    g.putImageData(img, 0, 0);
    // gilt borders between slots
    g.fillStyle = GILT;
    for (let r = 1; r < LAB.h; r++) for (let c = 1; c < LAB.w; c++) {
      const L = LAB.label[r * LAB.w + c], a = LAB.label[r * LAB.w + c - 1], b = LAB.label[(r - 1) * LAB.w + c];
      if ((L >= 0 || a >= 0 || b >= 0) && (L !== a || L !== b)) g.fillRect(ox + c * k - 1.5, oy + (LAB.h - 1 - r) * k - 1.5, 3, 3);
    }
    g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = '600 46px Georgia, serif'; g.letterSpacing = '6px';
    g.fillText(`COMMUNITY HAND ${state.no}`, S / 2, S - 70);
    g.letterSpacing = '0px'; g.font = '400 34px Georgia, serif';
    g.fillText(`the whole world in one hand · ${groves.toLocaleString('en')} groves sown · ${filled.size} of ${SLOTS.length} given`, S / 2, S - 24, S - 40);
    tex.needsUpdate = true;
  }
  paint();
  return {
    mesh,
    canvas,
    get state() { return state; },
    set(s) { if (s) { state = s; paint(); } },
    // everything sown in the world, as pixels on the hand (repainted only when it changed)
    sown(points, R = 9500) { const k = `${points.length}:${points.at(-1)?.join()}`; if (k === worldKey) return; worldKey = k; world = worldCells(points, R, LAB, NEAR); groves = points.length; paint(); },
    // a donation heard from the room
    add({ no, slot, palette }) { if (no === state.no && !state.slots.some((q) => q.slot === slot)) { state.slots.push({ slot, palette }); paint(); } },
    // for the atlas tab: the drawing, and what it means
    paintTab(g2, regions, { text }) {
      g2.drawImage(canvas, 40, 110, 680, 680);
      text('The Community Hand', 760, 180, { font: '600 46px Georgia, serif', max: 400 });
      const lines = ['The whole world in one hand:', 'every pixel is a grove somebody', 'sowed, where it lies in the world.', '', `${groves.toLocaleString('en')} groves sown so far.`, '', `${state.slots.length} of ${SLOTS.length} slots given · ${state.sealed} sealed.`, 'Give one handbit of your own Hand:', 'tap it on the map, then', '"Give to the Community Hand".', '', 'When all 22 are given it is sealed', 'and the next one begins.'];
      lines.forEach((t, i) => text(t, 760, 236 + i * 36, { font: '400 26px Inter, system-ui, sans-serif', color: 'rgba(22,16,14,0.8)', max: 400 }));
    },
  };
}
