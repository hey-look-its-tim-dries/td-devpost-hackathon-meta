// src/world/ghosts.js
import * as THREE from 'three';
import { createInk } from '../ink.js';
import { toWorld } from './founders.js';
import { OUTLINE, FINGERS } from '../hand/shape.js';

// The three proposed places for your Hand: its outline inked on the land, and a badge above each saying
// why it fits. The chosen one is red. Look or point at a badge to choose it, then choose it again to
// lay your Hand there (pinch, click, or 1 2 3 and Enter).
const RINGS = [OUTLINE, ...FINGERS.map((f) => {
  const hw = f.width / 2, at = (u, t) => [f.base[0] + f.side[0] * u + f.dir[0] * t, f.base[1] + f.side[1] * u + f.dir[1] * t];
  const ring = [at(-hw, 0)];
  for (let a = 0; a <= 16; a++) { const ang = Math.PI - (a / 16) * Math.PI; ring.push(at(Math.cos(ang) * hw, f.len - hw + Math.sin(ang) * hw)); }
  ring.push(at(hw, 0));
  return ring;
})];
const SEGMENTS = RINGS.reduce((n, r) => n + r.length, 0);
const AIM = Math.cos(0.2); // a badge within about 11 degrees of where you look or point

export function createGhosts(groundAt) {
  const group = new THREE.Group();
  const chosenInk = createInk(SEGMENTS, { width: 40, color: '#a8402b' }), otherInk = createInk(SEGMENTS * 2, { width: 25, color: '#16100e' });
  group.add(chosenInk.mesh, otherInk.mesh);
  const badges = [0, 1, 2].map(() => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 640, height: 240 });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1200, 450), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.renderOrder = 20;
    group.add(m);
    return { m, canvas, tex };
  });
  group.visible = false;
  let fits = [], selected = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), v = new THREE.Vector3();

  function paint(i) {
    const { canvas, tex } = badges[i], g = canvas.getContext('2d'), f = fits[i], on = i === selected;
    g.clearRect(0, 0, 640, 240);
    g.fillStyle = on ? '#a8402b' : 'rgba(22,16,14,0.88)';
    g.beginPath();
    g.roundRect(8, 8, 624, 224, 40);
    g.fill();
    g.fillStyle = '#f7eedf';
    g.textAlign = 'center';
    g.font = '800 46px Inter, system-ui, sans-serif';
    g.fillText(`${i + 1}${i === 0 ? ' · best fit' : ''}`, 320, 74);
    g.font = '600 36px Inter, system-ui, sans-serif';
    g.fillText(f.rivers ? `${f.rivers} river${f.rivers > 1 ? 's' : ''} join` : `next to ${f.names.join(' and ')}`, 320, 140, 600);
    g.font = '400 30px Inter, system-ui, sans-serif';
    g.fillText(on ? 'choose it again to lay your Hand' : 'look at it to choose', 320, 200, 600);
    tex.needsUpdate = true;
  }

  function draw() {
    chosenInk.begin();
    otherInk.begin();
    fits.forEach((f, i) => {
      const k = i === selected ? chosenInk : otherInk;
      for (const ring of RINGS) for (let j = 1; j < ring.length; j++) {
        const [x0, z0] = toWorld(f.pose, ring[j - 1][0], ring[j - 1][1]), [x1, z1] = toWorld(f.pose, ring[j][0], ring[j][1]);
        k.segment(a.set(x0, groundAt(x0, z0) + 40, z0), b.set(x1, groundAt(x1, z1) + 40, z1));
      }
    });
    chosenInk.end();
    otherInk.end();
    fits.forEach((_, i) => paint(i));
  }

  return {
    group,
    get fits() { return fits; },
    get selected() { return selected; },
    // fits from findFits, each with `names` (who it lies next to) added
    show(list) {
      fits = list;
      selected = 0;
      badges.forEach((bd, i) => {
        bd.m.visible = i < fits.length;
        if (bd.m.visible) bd.m.position.set(fits[i].centre[0], groundAt(...fits[i].centre) + 700, fits[i].centre[1]);
      });
      draw();
      group.visible = true;
    },
    hide() { group.visible = false; fits = []; },
    select(i) { if (i >= 0 && i < fits.length && i !== selected) { selected = i; draw(); } },
    // the badge nearest a ray (world space), or -1
    aim(origin, dir) {
      let best = -1, c = AIM;
      badges.forEach((bd, i) => {
        if (i >= fits.length) return;
        const d = v.copy(bd.m.position).sub(origin).normalize().dot(dir);
        if (d > c) { c = d; best = i; }
      });
      return best;
    },
    update(cameraWorld) { for (const bd of badges) bd.m.lookAt(cameraWorld); },
  };
}
