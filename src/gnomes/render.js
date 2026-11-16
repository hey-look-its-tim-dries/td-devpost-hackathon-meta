// src/gnomes/render.js
// Draws every gnome in sight from the nine parts of assets/gnome.glb (tools/blender/gnome.py): one instanced
// draw per part, each instance placed by the gnome's pose (pose.js) and coloured per gnome (hat, coat, beard).
// Lit by the scene's own lights, so gnomes sit in the same air as the animals, and turn with the foxfire.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { pose } from './pose.js';
import { HATS } from './gnomes.js';

const MAX = 48, PARTS = ['body', 'belt', 'buckle', 'buttons', 'legL', 'legR', 'shinL', 'shinR', 'armL', 'armR', 'foreL', 'foreR', 'handL', 'handR', 'head', 'nose', 'cheeks', 'eyes', 'brows', 'beard', 'hat', 'bell', 'scarf', 'ropes'];
const COATS = ['#3b5fa8', '#2f7d5a', '#7a4a2a', '#8a3a6a', '#3a7a8a', '#a8652a', '#55606e'], BEARDS = ['#f5f1e6', '#e8e2d2', '#cfc8b8', '#f0d8a8'];
const SKIN = new THREE.Color('#f0c39c'), NOSE = new THREE.Color('#e89a7c'), BOOT = new THREE.Color('#3d2a1c'), GOLD = new THREE.Color('#f2c230'), CHEEK = new THREE.Color('#f29a8a'), EYE = new THREE.Color('#1a1210');

export function createGnomeRenderer() {
  const group = new THREE.Group(), meshes = {}, rest = {};
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0 }) /* smooth and round, with a soft sheen */;
  let ready = false, n = 0;
  new GLTFLoader().load(new URL('../../assets/gnome.glb', import.meta.url).href, (gltf) => {
    for (const name of PARTS) {
      const node = gltf.scene.getObjectByName(name);
      if (!node?.geometry) return console.warn('the gnome is missing its', name);
      const geo = node.geometry; /* its own smooth normals */
      const m = new THREE.InstancedMesh(geo, mat, MAX);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, SKIN); // makes the colour buffer
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.count = 0; m.frustumCulled = false;
      meshes[name] = m; rest[name] = node.position.clone();
      group.add(m);
    }
    ready = true;
  }, undefined, (e) => console.warn('the gnome could not load', e));

  const root = new THREE.Matrix4(), M = new THREE.Matrix4(), J = new THREE.Matrix4(), T = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(), c = new THREE.Color();
  const joint = (name, rx, ry, rz) => { // the part at its joint, turned
    e.set(rx, ry, rz, 'YZX'); J.makeRotationFromEuler(e); T.makeTranslation(rest[name].x, rest[name].y, rest[name].z);
    M.multiplyMatrices(root, T).multiply(J);
    meshes[name].setMatrixAt(n, M);
  };
  const K = new THREE.Matrix4(), off = new THREE.Vector3(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const limb = (upper, lowers, rx, rz, bend) => { // a limb of two parts: the upper one at its joint, the lower ones hanging from it and bent at theirs (elbow, knee)
    joint(upper, rx, 0, rz);
    off.copy(rest[lowers[0]]).sub(rest[upper]);
    e.set(bend, 0, 0, 'YZX'); J.makeRotationFromEuler(e); T.makeTranslation(off.x, off.y, off.z);
    K.copy(M).multiply(T).multiply(J);
    for (const name of lowers) meshes[name].setMatrixAt(n, K);
  };
  return {
    group,
    get ready() { return ready; },
    get count() { return n; },
    begin() { n = 0; },
    // one gnome: where its feet are, which way it faces, how tall a unit is (m), what it is doing, and its looks
    add({ x, y, z, yaw = 0, s = 11, clip = 'idle', t = 0, hat = 0, seed = 0, motion = null, grip = 0 }) { /* grip: hangs from this height (gnome units), so the body swings under its hands */ // motion: how the flight throws a hanging gnome about (pose.js)
      if (!ready || n >= MAX) return;
      const p = pose(clip, t, seed, motion);
      e.set(p.tilt, yaw + (p.spin ?? 0), p.roll, 'YXZ'); q.setFromEuler(e);
      root.compose(v.set(x, y + p.y * s, z), q, one.set(s, s, s));
      if (grip) root.multiply(T.makeTranslation(0, -grip, 0));
      if (grip) { joint('ropes', 0, 0, 0); meshes.ropes.setColorAt(n, EYE); } else meshes.ropes.setMatrixAt(n, ZERO); /* its lines, only while it hangs */
      joint('body', 0, 0, 0); joint('belt', 0, 0, 0); joint('buckle', 0, 0, 0); joint('buttons', 0, 0, 0);
      limb('legL', ['shinL'], p.legL, 0, p.kneeL ?? 0); limb('legR', ['shinR'], p.legR, 0, p.kneeR ?? 0);
      limb('armL', ['foreL', 'handL'], p.armLx, p.armLz, p.elbowL ?? 0); limb('armR', ['foreR', 'handR'], p.armRx, p.armRz, p.elbowR ?? 0);
      for (const name of ['head', 'nose', 'cheeks', 'eyes', 'brows', 'beard', 'hat', 'bell', 'scarf']) joint(name, p.headX, p.headY, 0);
      const coat = c.set(COATS[seed % COATS.length]);
      meshes.body.setColorAt(n, coat); meshes.armL.setColorAt(n, coat); meshes.armR.setColorAt(n, coat); meshes.foreL.setColorAt(n, coat); meshes.foreR.setColorAt(n, coat);
      meshes.shinL.setColorAt(n, BOOT); meshes.shinR.setColorAt(n, BOOT); meshes.buttons.setColorAt(n, GOLD); meshes.scarf.setColorAt(n, c.set(HATS[(hat + 3) % HATS.length]));
      meshes.legL.setColorAt(n, BOOT); meshes.legR.setColorAt(n, BOOT);
      meshes.head.setColorAt(n, SKIN); meshes.nose.setColorAt(n, NOSE); meshes.handL.setColorAt(n, SKIN); meshes.handR.setColorAt(n, SKIN);
      meshes.belt.setColorAt(n, BOOT); meshes.buckle.setColorAt(n, GOLD); meshes.bell.setColorAt(n, GOLD); meshes.cheeks.setColorAt(n, CHEEK); meshes.eyes.setColorAt(n, EYE);
      meshes.beard.setColorAt(n, c.set(BEARDS[(seed >> 3) % BEARDS.length])); meshes.brows.setColorAt(n, c);
      meshes.hat.setColorAt(n, c.set(HATS[hat % HATS.length]));
      n++;
    },
    end() { if (!ready) return; for (const name of PARTS) { const m = meshes[name]; m.count = n; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; } },
  };
}
