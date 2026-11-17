// src/hands/gardenhand.js
// Your hands in the headset are a gardener's, drawn in the game's ink: green stems for bones, a broad leaf for a
// palm with two sprouts on its back, a gnome's red hat on your thumb and a gnome's red sleeve at your wrist. And
// it wears your garden: the kinds grown most on your laid Hand flower on your fingertips, and blossoms climb your
// fingers as your Hand fills up (src/hands/bones.js decorOf). Pinch, and the index flower closes into a bud; let
// go and it opens. Built every frame from the joint positions; nothing is kept.
import * as THREE from 'three';
import { BONES, openness, decorOf, MAX_BLOSSOMS } from './bones.js';

const INK = 0x16100e, STEM = 0x3d6b2f, LEAF = 0x6f9a3e, SPROUT = 0x8db456, RED = 0xb8442e, CREAM = 0xf3e4d2, HEART = 0xf2c84b;
const FINGERS = ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
// where blossoms grow, from the knuckles up: they climb as your Hand fills
const SLOTS = [...FINGERS.map((f) => `${f}-phalanx-proximal`), 'thumb-phalanx-proximal', ...FINGERS.map((f) => `${f}-phalanx-intermediate`), 'thumb-phalanx-distal', ...FINGERS.map((f) => `${f}-phalanx-distal`)];
const RIM = ['wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'index-finger-phalanx-proximal', 'middle-finger-phalanx-proximal', 'ring-finger-phalanx-proximal', 'pinky-finger-phalanx-proximal', 'pinky-finger-metacarpal'];

const flat = (color) => new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
const edge = () => new THREE.MeshBasicMaterial({ color: INK, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 3, polygonOffsetUnits: 3 }); // a flat shape's ink line: a larger black copy just behind
const hull = () => new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }); // a solid's ink line: its inside-out shell

const stemG = new THREE.CylinderGeometry(0.7, 1, 1, 7, 1, true); // narrower towards the fingertip
const petalG = new THREE.CircleGeometry(0.5, 10).scale(0.62, 1, 1).translate(0, 0.5, 0); // base at the origin, along +y
const leafShape = new THREE.Shape().moveTo(0, 0).quadraticCurveTo(0.38, 0.45, 0, 1).quadraticCurveTo(-0.38, 0.45, 0, 0);
const leafG = new THREE.ShapeGeometry(leafShape, 6);
const ballG = new THREE.SphereGeometry(1, 8, 6);
const hatG = new THREE.ConeGeometry(1, 2.4, 12).translate(0, 1.2, 0); // base at the origin
const tubeG = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);

const inst = (g, m, n) => { const o = new THREE.InstancedMesh(g, m, n); o.frustumCulled = false; o.instanceMatrix.setUsage(THREE.DynamicDrawUsage); return o; };
const v = () => new THREE.Vector3();
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), S = v(), P = v(), D = v(), X = v(), Y = v(), Z = v(), N = v(), U = v(), W = v(), UP = new THREE.Vector3(0, 1, 0), col = new THREE.Color();

export function createGardenHand() {
  const group = new THREE.Group();
  const stems = inst(stemG, flat(STEM), BONES.length), stemInk = inst(stemG, hull(), BONES.length);
  const petals = inst(petalG, flat(0xffffff), 20), petalInk = inst(petalG, edge(), 20);
  const hearts = inst(ballG, flat(0xffffff), 4);
  const buds = inst(petalG, flat(0xffffff), MAX_BLOSSOMS * 5), budInk = inst(petalG, edge(), MAX_BLOSSOMS * 5), budHearts = inst(ballG, flat(HEART), MAX_BLOSSOMS);
  const leaves = inst(leafG, flat(SPROUT), 4), leafInk = inst(leafG, edge(), 4);
  const hat = new THREE.Mesh(hatG, flat(RED)), hatInk = new THREE.Mesh(hatG, hull()), brim = new THREE.Mesh(tubeG, flat(CREAM));
  const sleeve = new THREE.Mesh(tubeG, flat(RED)), sleeveInk = new THREE.Mesh(tubeG, hull()), trim = new THREE.Mesh(tubeG, flat(CREAM));
  // the palm: a leaf fanned out between the wrist and the knuckles, and its ink line just behind it
  const palmPos = new Float32Array((RIM.length + 1) * 3), inkPos = new Float32Array((RIM.length + 1) * 3), fan = [];
  for (let i = 0; i < RIM.length; i++) fan.push(0, i + 1, ((i + 1) % RIM.length) + 1);
  const palmG = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(palmPos, 3)).setIndex(fan);
  const inkG = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(inkPos, 3)).setIndex(fan);
  const palm = new THREE.Mesh(palmG, flat(LEAF)), palmInk = new THREE.Mesh(inkG, edge());
  for (const o of [stems, stemInk, petals, petalInk, hearts, buds, budInk, budHearts, leaves, leafInk, hat, hatInk, brim, sleeve, sleeveInk, trim, palm, palmInk]) { o.frustumCulled = false; group.add(o); }
  group.visible = false;
  let worn = null;
  const wear = (d) => { // recolour only when your garden changes
    worn = d;
    d.tips.forEach((t, k) => { for (let i = 0; i < 5; i++) petals.setColorAt(k * 5 + i, col.set(t.petal)); hearts.setColorAt(k, col.set(t.heart)); });
    for (let b = 0; b < MAX_BLOSSOMS; b++) for (let i = 0; i < 5; i++) buds.setColorAt(b * 5 + i, col.set(d.colours[b % d.colours.length].petal));
    petals.instanceColor.needsUpdate = hearts.instanceColor.needsUpdate = buds.instanceColor.needsUpdate = true;
    buds.count = budInk.count = d.blossoms * 5; budHearts.count = d.blossoms;
  };
  wear(decorOf([], null, [], null));
  const inks = group.children.map((o) => o.material).filter((m) => m.color.getHex() === INK);

  return {
    group,
    tint(c) { for (const m of inks) m.color.copy(c); }, // the ink line: black by day, the foxfire's glow by night
    // j: { joint: [x, y, z] } in the rig's space, normal: out of the palm ([x, y, z]), decor: decorOf(...) or null
    update(j, normal, decor) {
      if (decor && decor !== worn) wear(decor);
      group.visible = !!(j && normal);
      if (!group.visible) return;
      const at = (n, out) => out.fromArray(j[n]);
      N.fromArray(normal);
      // stems, a little thicker at the wrist
      BONES.forEach(([a, b], i) => {
        at(a, P); at(b, D); D.sub(P); const len = D.length() || 1e-4, r = a === 'wrist' ? 0.0065 : 0.0055;
        q.setFromUnitVectors(UP, D.divideScalar(len)); P.addScaledVector(D, len / 2);
        stems.setMatrixAt(i, m4.compose(P, q, S.set(r, len, r))); stemInk.setMatrixAt(i, m4.compose(P, q, S.set(r * 1.55, len * 1.06, r * 1.55)));
      });
      // fingertip flowers: five petals round a yellow heart, facing out along the finger
      const o = openness(at('thumb-tip', P).distanceTo(at('index-finger-tip', D)));
      FINGERS.forEach((f, k) => {
        at(`${f}-tip`, P); at(`${f}-phalanx-distal`, D); D.subVectors(P, D).normalize(); // n: out along the finger
        U.crossVectors(D, N).normalize(); W.crossVectors(D, U);
        const open = k ? 1 : o, tilt = 1.3 - 1.05 * open, s = 0.021 * (0.75 + 0.25 * open);
        hearts.setMatrixAt(k, m4.compose(X.copy(P).addScaledVector(D, 0.002), q.identity(), S.setScalar(0.0038)));
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + k;
          X.copy(U).multiplyScalar(Math.cos(a)).addScaledVector(W, Math.sin(a)); // r: round the heart
          Y.copy(X).multiplyScalar(Math.cos(tilt)).addScaledVector(D, Math.sin(tilt)); // the petal's length
          Z.copy(D).multiplyScalar(Math.cos(tilt)).addScaledVector(X, -Math.sin(tilt)); // its face
          X.crossVectors(Y, Z);
          m4.makeBasis(X, Y, Z).scale(S.setScalar(s)).setPosition(P); petals.setMatrixAt(k * 5 + i, m4);
          m4.makeBasis(X, Y, Z).scale(S.set(s * 1.3, s * 1.18, s)).setPosition(P); petalInk.setMatrixAt(k * 5 + i, m4);
        }
      });
      // blossoms on the back of your fingers, facing out of the back of your hand
      for (let b = 0; b < worn.blossoms; b++) {
        at(SLOTS[b], P).addScaledVector(N, -0.007); D.copy(N).negate();
        U.set(Math.abs(D.y) < 0.9 ? 0 : 1, Math.abs(D.y) < 0.9 ? 1 : 0, 0).cross(D).normalize(); W.crossVectors(D, U);
        budHearts.setMatrixAt(b, m4.compose(X.copy(P).addScaledVector(D, 0.001), q.identity(), S.setScalar(0.0022)));
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + b, tilt = 0.25, s = 0.0095;
          X.copy(U).multiplyScalar(Math.cos(a)).addScaledVector(W, Math.sin(a));
          Y.copy(X).multiplyScalar(Math.cos(tilt)).addScaledVector(D, Math.sin(tilt));
          Z.copy(D).multiplyScalar(Math.cos(tilt)).addScaledVector(X, -Math.sin(tilt));
          X.crossVectors(Y, Z);
          m4.makeBasis(X, Y, Z).scale(S.setScalar(s)).setPosition(P); buds.setMatrixAt(b * 5 + i, m4);
          m4.makeBasis(X, Y, Z).scale(S.set(s * 1.3, s * 1.18, s)).setPosition(P); budInk.setMatrixAt(b * 5 + i, m4);
        }
      }
      // leaves: one out from each side of the hand, two sprouts on its back
      const leaf = (i, base, dir, s) => {
        Y.copy(dir).normalize(); Z.copy(N).addScaledVector(Y, -N.dot(Y)).normalize(); X.crossVectors(Y, Z);
        m4.makeBasis(X, Y, Z).scale(S.setScalar(s)).setPosition(base); leaves.setMatrixAt(i, m4);
        m4.makeBasis(X, Y, Z).scale(S.set(s * 1.25, s * 1.15, s)).setPosition(base); leafInk.setMatrixAt(i, m4);
      };
      const prox = (f, out) => at(`${f}-finger-phalanx-proximal`, out), fwd = (f, out) => at(`${f}-finger-phalanx-intermediate`, out).sub(prox(f, P)).normalize();
      fwd('index', D); leaf(0, prox('index', P).clone(), prox('index', X).sub(prox('middle', Y)).normalize().addScaledVector(D, 0.5), 0.028);
      fwd('pinky', D); leaf(1, prox('pinky', P).clone(), prox('pinky', X).sub(prox('ring', Y)).normalize().addScaledVector(D, 0.5), 0.026);
      for (const [i, f] of [[2, 'middle'], [3, 'ring']]) { // sprouts: up out of the back of the hand, leaning to the fingers (their face then turns side-on)
        fwd(f, D); const base = at(`${f}-finger-metacarpal`, v()).lerp(prox(f, P), 0.6), dir = N.clone().negate().addScaledVector(D, 0.8);
        const n0 = N.clone(); N.copy(U.crossVectors(dir, D).normalize()); leaf(i, base, dir, 0.02); N.copy(n0);
      }
      // the gnome hat on your thumb, a cream brim round it
      at('thumb-tip', P); at('thumb-phalanx-distal', D); D.subVectors(P, D).normalize(); q.setFromUnitVectors(UP, D); P.addScaledVector(D, -0.007);
      hat.position.copy(P); hat.quaternion.copy(q); hat.scale.setScalar(0.0105);
      hatInk.position.copy(P); hatInk.quaternion.copy(q); hatInk.scale.set(0.0105 * 1.25, 0.0105 * 1.12, 0.0105 * 1.25);
      brim.position.copy(P); brim.quaternion.copy(q); brim.scale.set(0.0118, 0.0035, 0.0118);
      // the gnome's sleeve: back from the wrist towards the elbow
      at('wrist', P); at('middle-finger-phalanx-proximal', D); D.subVectors(P, D).normalize(); q.setFromUnitVectors(UP, D);
      sleeve.position.copy(P).addScaledVector(D, 0.022); sleeve.quaternion.copy(q); sleeve.scale.set(0.028, 0.034, 0.028);
      sleeveInk.position.copy(sleeve.position); sleeveInk.quaternion.copy(q); sleeveInk.scale.set(0.031, 0.036, 0.031);
      trim.position.copy(P).addScaledVector(D, 0.004); trim.quaternion.copy(q); trim.scale.set(0.0302, 0.008, 0.0302);
      // the palm leaf, pulled in a little so the stems run on past it like veins
      X.set(0, 0, 0); for (const n of RIM) X.add(at(n, P)); X.divideScalar(RIM.length);
      X.toArray(palmPos, 0); X.toArray(inkPos, 0);
      RIM.forEach((n, i) => { at(n, P); Y.copy(P).sub(X); X.clone().addScaledVector(Y, 0.86).toArray(palmPos, (i + 1) * 3); X.clone().addScaledVector(Y, 0.97).toArray(inkPos, (i + 1) * 3); });
      palmG.attributes.position.needsUpdate = true; inkG.attributes.position.needsUpdate = true;
      for (const m of [stems, stemInk, petals, petalInk, hearts, buds, budInk, budHearts, leaves, leafInk]) m.instanceMatrix.needsUpdate = true;
    },
  };
}
