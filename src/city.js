import * as THREE from 'three';
import { createInk } from './ink.js';

// The city that grows where you walk: little ink-wire houses on the ridges beside the paths you
// have walked, and a tower once you reach the summit. Kept between sessions, so tomorrow your
// land shows where you went today. Houses stand on the terrain, so they are redrawn whenever the
// terrain moves or lifts (taking off, landing), not every frame.
const MAX = 260;
const SEGS = 14;

export function createCity(terrain) {
  const ink = createInk(MAX * SEGS + 40, { width: 0.0009 });
  const houses = []; // [x, y, kind] in land pixels; kind 0 house, 1 tower
  let dirty = true, lastLift = -1;
  const lastMatrix = new THREE.Matrix4();
  const base = new THREE.Vector3();
  const v = (x, y, z) => ({ x: base.x + x, y: base.y + y, z: base.z + z });

  function draw() {
    ink.begin();
    const s = terrain.uniforms.uLift.value * 0.5 + 0.5; // houses grow a little with the deeper valleys
    for (const [px, py, kind] of houses) {
      terrain.worldOf(px, py, base);
      const w = 0.0055 * s, d = 0.0045 * s, h = (kind ? 0.03 : 0.007) * s, roof = (kind ? 0.01 : 0.005) * s;
      const turn = ((px * 7 + py * 13) % 4) * 0.4; // each house a little turned, like a sketch
      const c = Math.cos(turn), n = Math.sin(turn);
      const at = (x, y, z) => v(x * c - z * n, y, x * n + z * c);
      const front = [at(-w, 0, d), at(w, 0, d), at(w, h, d), at(0, h + roof, d), at(-w, h, d)];
      const back = [at(-w, 0, -d), at(w, 0, -d), at(w, h, -d), at(0, h + roof, -d), at(-w, h, -d)];
      for (const face of [front, back]) for (let i = 0; i < 5; i++) ink.segment(face[i], face[(i + 1) % 5]);
      for (const i of [1, 2, 3, 4]) ink.segment(front[i], back[i]);
    }
    ink.end();
  }

  return {
    mesh: ink.mesh,
    houses,
    get count() { return houses.length; },
    set width(w) { ink.width = w; },
    load(list) {
      houses.length = 0;
      for (const h of list || []) if (houses.length < MAX) houses.push(h);
      dirty = true;
    },
    add(px, py, kind = 0) {
      if (houses.length >= MAX) return false;
      houses.push([px, py, kind]);
      dirty = true;
      return true;
    },
    update() {
      ink.mesh.visible = terrain.mesh.visible;
      const lift = terrain.uniforms.uLift.value * terrain.uniforms.uRise.value;
      if (Math.abs(lift - lastLift) > 0.002 || !lastMatrix.equals(terrain.mesh.matrixWorld)) dirty = true;
      if (!dirty || !terrain.ready) return;
      lastLift = lift;
      lastMatrix.copy(terrain.mesh.matrixWorld);
      dirty = false;
      draw();
    },
  };
}
