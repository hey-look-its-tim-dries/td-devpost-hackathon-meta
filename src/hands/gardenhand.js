// src/hands/gardenhand.js
// Your hands in the headset are a gardener's, drawn in the game's ink and cel-shaded so they read as solid things
// in any sky: green stems for bones, a broad veined leaf for a palm, curled leaves and curly vine tendrils, a
// gnome's drooping red hat on your thumb and a knitted gnome's sleeve at your wrist. And it wears your garden: the
// kinds grown most on your laid Hand flower on your fingertips, and blossoms pop open up your fingers as your Hand
// fills (src/hands/bones.js decorOf). The flowers sway; pinch, and the index flower closes into a bud and sheds
// golden pollen. Built every frame from the joint positions; nothing is kept.
import * as THREE from 'three';
import { BONES, openness, decorOf, MAX_BLOSSOMS } from './bones.js';

const INK = 0x16100e, STEM = 0x4f8236, LEAF = 0x7aab45, SPROUT = 0x98c95c, RED = 0xc4472d, CREAM = 0xf5e8d4, HEART = 0xf2c84b;
const FINGERS = ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
const RIM = ['wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'index-finger-phalanx-proximal', 'middle-finger-phalanx-proximal', 'ring-finger-phalanx-proximal', 'pinky-finger-phalanx-proximal', 'pinky-finger-metacarpal'];
// where blossoms grow, from the knuckles up: they climb as your Hand fills
const SLOTS = [...FINGERS.map((f) => `${f}-phalanx-proximal`), 'thumb-phalanx-proximal', ...FINGERS.map((f) => `${f}-phalanx-intermediate`), 'thumb-phalanx-distal', ...FINGERS.map((f) => `${f}-phalanx-distal`)];

// Cel shading on an unlit material: two tones and a soft rim light from a fixed light over your shoulder (the
// scene's lights tint with the foxfire and would turn the hands grey), times the shape's own vertex colours.
const toonVert = (s) => s.replace('#include <common>', '#include <common>\nvarying vec3 vTN;').replace('#include <project_vertex>', `#include <project_vertex>
  vec3 tn = normal;
  #ifdef USE_INSTANCING
    tn = mat3(instanceMatrix) * tn;
  #endif
  vTN = normalize(normalMatrix * tn);`);
const toonFrag = (s) => s.replace('#include <common>', '#include <common>\nvarying vec3 vTN;').replace('#include <opaque_fragment>', `
  vec3 tn = normalize(vTN) * (gl_FrontFacing ? 1.0 : -1.0);
  outgoingLight *= mix(0.66, 1.06, smoothstep(0.02, 0.22, dot(tn, normalize(vec3(-0.35, 0.75, 0.55)))));
  outgoingLight += vec3(0.09) * smoothstep(0.6, 0.95, 1.0 - abs(tn.z));
  #include <opaque_fragment>`);
const toon = (color, vc = true) => Object.assign(new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, vertexColors: vc }), { onBeforeCompile: (sh) => { sh.vertexShader = toonVert(sh.vertexShader); sh.fragmentShader = toonFrag(sh.fragmentShader); } });
const edge = () => new THREE.MeshBasicMaterial({ color: INK, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 3, polygonOffsetUnits: 3 }); // a flat shape's ink line: a larger black copy just behind
const hull = () => new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }); // a solid's ink line: its inside-out shell

// a grid bent into shape, with a grey vertex colour per point: f(u across -1..1, y along 0..1) -> [x, y, z, shade]
function sculpt(cols, rows, f) {
  const g = new THREE.PlaneGeometry(1, 1, cols, rows), p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const [x, y, z, k] = f(p.getX(i) * 2, p.getY(i) + 0.5); p.setXYZ(i, x, y, z); c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.computeVertexNormals();
  return g;
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// a petal: narrow at the heart, round at the tip, cupped, its tip curling back; deeper in colour at the base, a faint vein
const petalG = sculpt(4, 8, (u, y) => { const w = 0.33 * Math.pow(Math.sin(Math.PI * (0.1 + 0.85 * y)), 0.6); return [u * w, y, 0.3 * u * u * w - 0.1 * y * y, (0.55 + 0.45 * smooth(0, 0.55, y) + 0.1 * Math.abs(u) * y) * (u === 0 && y > 0.1 && y < 0.8 ? 0.9 : 1)]; });
// a leaf: pointed at both ends, folded along its midrib, curling up; a darker midrib
const leafG = sculpt(6, 10, (u, y) => { const w = 0.4 * Math.pow(Math.sin(Math.PI * y), 0.75); return [u * w, y, 0.28 * Math.abs(u) * w + 0.16 * y * y, u === 0 ? 0.72 : 0.88 + 0.16 * (1 - y) * (1 - Math.abs(u))]; });
const shade = (g, f) => { const p = g.attributes.position, c = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = f(p.getX(i), p.getY(i), p.getZ(i)); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; };
const stemG = shade(new THREE.CylinderGeometry(0.7, 1, 1, 10, 3, true), (x, y) => 0.86 + 0.2 * (y + 0.5)); // narrower and lighter towards the fingertip
const ballG = shade(new THREE.SphereGeometry(1, 10, 8), (x, y, z) => 0.8 + 0.25 * z); // a heart, lighter on its face
const tubeG = shade(new THREE.CylinderGeometry(1, 1, 1, 16, 1, true), () => 1);
// the gnome hat: a cone that droops at the tip
const hatG = (() => {
  const g = new THREE.ConeGeometry(1, 2.6, 18, 10).translate(0, 1.3, 0), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = p.getY(i) / 2.6; p.setX(i, p.getX(i) + 1.1 * Math.pow(t, 2.4)); p.setY(i, p.getY(i) * (1 - 0.18 * t * t)); }
  g.computeVertexNormals();
  return shade(g, (x, y) => 0.86 + 0.08 * y);
})();
// the sleeve: knitted ribs round a gently puffed tube
const knitG = (() => {
  const g = new THREE.CylinderGeometry(1, 1, 1, 32, 4, true), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 1 + 0.07 * Math.sin(Math.PI * (p.getY(i) + 0.5)); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  g.computeVertexNormals();
  return shade(g, (x, y, z) => 0.82 + 0.18 * (0.5 + 0.5 * Math.cos(Math.atan2(z, x) * 16)));
})();
// a vine tendril: straight out, then a tightening curl; tapering to a hair
function tendril(radius) {
  const pts = [];
  for (let i = 0; i <= 40; i++) { const t = i / 40, a = 10 * Math.pow(t, 1.4), R = 0.013 * (1 - 0.72 * t); pts.push(new THREE.Vector3(R * (1 - Math.cos(a)), 0.018 * t + R * Math.sin(a), 0.004 * a)); }
  const curve = new THREE.CatmullRomCurve3(pts), g = new THREE.TubeGeometry(curve, 64, radius, 6), p = g.attributes.position, c = new THREE.Vector3();
  for (let i = 0; i <= 64; i++) { curve.getPointAt(i / 64, c); const k = 1 - 0.8 * (i / 64); for (let j = 0; j <= 6; j++) { const n = i * 7 + j; p.setXYZ(n, c.x + (p.getX(n) - c.x) * k, c.y + (p.getY(n) - c.y) * k, c.z + (p.getZ(n) - c.z) * k); } }
  g.computeVertexNormals();
  return shade(g, () => 1);
}
const tendG = tendril(0.0017), tendInkG = tendril(0.0029);
const pollenTex = (() => { const c = Object.assign(document.createElement('canvas'), { width: 32, height: 32 }), g = c.getContext('2d'), r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, '#fff'); r.addColorStop(0.4, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();

const inst = (g, m, n) => { const o = new THREE.InstancedMesh(g, m, n); o.frustumCulled = false; o.instanceMatrix.setUsage(THREE.DynamicDrawUsage); return o; };
const v = () => new THREE.Vector3();
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), S = v(), P = v(), D = v(), X = v(), Y = v(), Z = v(), N = v(), U = v(), W = v(), C = v(), UP = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
const pop = (t) => (t >= 1 ? 1 : 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2)); // ease out with a little overshoot
const POLLEN = 64, LIFE = 1.6;

export function createGardenHand() {
  const group = new THREE.Group();
  const stems = inst(stemG, toon(STEM), BONES.length), stemInk = inst(stemG, hull(), BONES.length);
  const petals = inst(petalG, toon(0xffffff), 20), petalInk = inst(petalG, edge(), 20);
  const hearts = inst(ballG, toon(0xffffff), 4), heartInk = inst(ballG, hull(), 4);
  const buds = inst(petalG, toon(0xffffff), MAX_BLOSSOMS * 5), budInk = inst(petalG, edge(), MAX_BLOSSOMS * 5), budHearts = inst(ballG, toon(HEART), MAX_BLOSSOMS);
  const leaves = inst(leafG, toon(SPROUT), 4), leafInk = inst(leafG, edge(), 4);
  const tendrils = inst(tendG, toon(STEM), 2), tendInk = inst(tendInkG, hull(), 2);
  const hat = new THREE.Mesh(hatG, toon(RED)), hatInk = new THREE.Mesh(hatG, hull()), brim = new THREE.Mesh(knitG, toon(CREAM)), brimInk = new THREE.Mesh(knitG, hull());
  const sleeve = new THREE.Mesh(knitG, toon(RED)), sleeveInk = new THREE.Mesh(knitG, hull()), trim = new THREE.Mesh(knitG, toon(CREAM)), trimInk = new THREE.Mesh(knitG, hull());
  // the palm: a leaf fanned out between the wrist and the knuckles (lighter at its heart), its ink line just behind
  const palmPos = new Float32Array((RIM.length + 1) * 3), inkPos = new Float32Array((RIM.length + 1) * 3), fan = [];
  for (let i = 0; i < RIM.length; i++) fan.push(0, i + 1, ((i + 1) % RIM.length) + 1);
  const palmCol = new Float32Array((RIM.length + 1) * 3).fill(0.8); palmCol.fill(1.12, 0, 3);
  const palmG = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(palmPos, 3)).setAttribute('color', new THREE.BufferAttribute(palmCol, 3)).setIndex(fan);
  const inkG = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(inkPos, 3)).setIndex(fan);
  const palm = new THREE.Mesh(palmG, toon(LEAF)), palmInk = new THREE.Mesh(inkG, edge());
  // pollen: golden motes shed from the flowers, drifting up and fading (additive: dimmer is fainter)
  const pPos = new Float32Array(POLLEN * 3), pCol = new Float32Array(POLLEN * 3), pVel = new Float32Array(POLLEN * 3), pAge = new Float32Array(POLLEN).fill(LIFE), pTint = new Float32Array(POLLEN * 3);
  const pollenG = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pPos, 3)).setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pollen = new THREE.Points(pollenG, new THREE.PointsMaterial({ size: 0.007, map: pollenTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  let pNext = 0, shed = 0;
  const emit = (at, tint) => { const j = pNext++ % POLLEN, o = j * 3; at.toArray(pPos, o); pVel[o] = (Math.random() - 0.5) * 0.05; pVel[o + 1] = 0.02 + Math.random() * 0.04; pVel[o + 2] = (Math.random() - 0.5) * 0.05; pAge[j] = 0; col.set(tint).toArray(pTint, o); };
  const all = [stems, stemInk, petals, petalInk, hearts, heartInk, buds, budInk, budHearts, leaves, leafInk, tendrils, tendInk, hat, hatInk, brim, brimInk, sleeve, sleeveInk, trim, trimInk, palm, palmInk, pollen];
  for (const o of all) { o.frustumCulled = false; group.add(o); }
  group.visible = false;
  const inks = all.map((o) => o.material).filter((m) => m.color.getHex() === INK);
  let worn = null, last = performance.now();
  const grow = new Float32Array(MAX_BLOSSOMS); // each blossom pops open on its own when it first appears
  const wear = (d) => { // recolour only when your garden changes
    for (let b = d.blossoms; b < MAX_BLOSSOMS; b++) grow[b] = 0;
    worn = d;
    d.tips.forEach((t, k) => { for (let i = 0; i < 5; i++) petals.setColorAt(k * 5 + i, col.set(t.petal)); hearts.setColorAt(k, col.set(t.heart)); });
    for (let b = 0; b < MAX_BLOSSOMS; b++) for (let i = 0; i < 5; i++) buds.setColorAt(b * 5 + i, col.set(d.colours[b % d.colours.length].petal));
    petals.instanceColor.needsUpdate = hearts.instanceColor.needsUpdate = buds.instanceColor.needsUpdate = true;
    buds.count = budInk.count = d.blossoms * 5; budHearts.count = d.blossoms;
  };
  wear(decorOf([], null, [], null));
  // five petals round a heart at P, facing out along D; s: size, tilt: 0 flat open .. 1.3 a closed bud
  const flower = (mesh, ink, base, s, tilt, sway, t, seed) => {
    U.set(Math.abs(D.y) < 0.9 ? 0 : 1, Math.abs(D.y) < 0.9 ? 1 : 0, 0).cross(D).normalize(); W.crossVectors(D, U);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + seed, tl = tilt + sway * Math.sin(t * 2.3 + seed * 1.7 + i * 1.3);
      X.copy(U).multiplyScalar(Math.cos(a)).addScaledVector(W, Math.sin(a)); // round the heart
      Y.copy(X).multiplyScalar(Math.cos(tl)).addScaledVector(D, Math.sin(tl)); // the petal's length
      Z.copy(D).multiplyScalar(Math.cos(tl)).addScaledVector(X, -Math.sin(tl)); // its face
      X.crossVectors(Y, Z);
      m4.makeBasis(X, Y, Z).scale(S.setScalar(s)).setPosition(P); mesh.setMatrixAt(base + i, m4);
      m4.makeBasis(X, Y, Z).scale(S.set(s * 1.24, s * 1.12, s)).setPosition(P); ink.setMatrixAt(base + i, m4);
    }
  };

  return {
    group,
    tint(c) { for (const m of inks) m.color.copy(c); }, // the ink line: black by day, the foxfire's glow by night
    // j: { joint: [x, y, z] } in the rig's space, normal: out of the palm ([x, y, z]), decor: decorOf(...) or null
    update(j, normal, decor) {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000), t = now / 1000;
      last = now;
      if (decor && decor !== worn) wear(decor);
      // the pollen lives on a moment after the hand is gone
      for (let k = 0; k < POLLEN; k++) {
        const o = k * 3;
        if (pAge[k] >= LIFE) { pCol[o] = pCol[o + 1] = pCol[o + 2] = 0; continue; }
        pAge[k] += dt;
        for (let a = 0; a < 3; a++) { pPos[o + a] += pVel[o + a] * dt; pVel[o + a] *= 1 - dt * 0.8; pCol[o + a] = pTint[o + a] * Math.max(0, 1 - pAge[k] / LIFE) * 1.3; }
      }
      pollenG.attributes.position.needsUpdate = pollenG.attributes.color.needsUpdate = true;
      const on = !!(j && normal);
      for (const o of all) if (o !== pollen) o.visible = on;
      group.visible = true;
      if (!on) return;
      const at = (n, out) => out.fromArray(j[n]);
      N.fromArray(normal);
      // stems, a little thicker at the wrist
      BONES.forEach(([a, b], i) => {
        at(a, P); at(b, D); D.sub(P); const len = D.length() || 1e-4, r = a === 'wrist' ? 0.0066 : 0.0056;
        q.setFromUnitVectors(UP, D.divideScalar(len)); P.addScaledVector(D, len / 2);
        stems.setMatrixAt(i, m4.compose(P, q, S.set(r, len, r))); stemInk.setMatrixAt(i, m4.compose(P, q, S.set(r * 1.5, len * 1.05, r * 1.5)));
      });
      // fingertip flowers, the index one closing as you pinch
      const o = openness(at('thumb-tip', P).distanceTo(at('index-finger-tip', D)));
      FINGERS.forEach((f, k) => {
        at(`${f}-tip`, P); at(`${f}-phalanx-distal`, D); D.subVectors(P, D).normalize();
        const open = k ? 1 : o;
        flower(petals, petalInk, k * 5, 0.022 * (0.75 + 0.25 * open), 1.3 - 1.0 * open, 0.07, t, k * 2.1);
        hearts.setMatrixAt(k, m4.compose(C.copy(P).addScaledVector(D, 0.0025), q.identity(), S.setScalar(0.004)));
        heartInk.setMatrixAt(k, m4.compose(C, q, S.setScalar(0.0052)));
        if (!k && o < 0.35) for (shed += dt * 30; shed >= 1; shed--) emit(C, worn.tips[0].heart); // pinching: pollen
        else if (Math.random() < dt * 0.6) emit(C, worn.tips[k].heart); // now and then, from any flower
      });
      // blossoms on the back of your fingers, popping open as they first appear
      for (let b = 0; b < worn.blossoms; b++) {
        grow[b] = Math.min(1, grow[b] + dt * (1.4 - b * 0.04));
        at(SLOTS[b], P).addScaledVector(N, -0.0065); D.copy(N).negate();
        const g = pop(grow[b]);
        flower(buds, budInk, b * 5, 0.0105 * g + 1e-5, 0.3 + 0.9 * (1 - g), 0.05, t, b * 1.37);
        budHearts.setMatrixAt(b, m4.compose(C.copy(P).addScaledVector(D, 0.0012), q.identity(), S.setScalar(0.0024 * g + 1e-5)));
      }
      // leaves: one out from each side of the hand, two sprouts on its back, rustling a little
      const leaf = (i, base, dir, s, face) => {
        Y.copy(dir).normalize(); Z.copy(face).addScaledVector(Y, -face.dot(Y)).normalize(); X.crossVectors(Y, Z);
        q.setFromAxisAngle(Y, 0.12 * Math.sin(t * 1.9 + i * 2)); X.applyQuaternion(q); Z.applyQuaternion(q);
        m4.makeBasis(X, Y, Z).scale(S.setScalar(s)).setPosition(base); leaves.setMatrixAt(i, m4);
        m4.makeBasis(X, Y, Z).scale(S.set(s * 1.22, s * 1.1, s)).setPosition(base); leafInk.setMatrixAt(i, m4);
      };
      const prox = (f, out) => at(`${f}-finger-phalanx-proximal`, out), fwd = (f, out) => at(`${f}-finger-phalanx-intermediate`, out).sub(prox(f, P)).normalize();
      const outward = (f, g, out) => prox(f, out).sub(prox(g, C)).normalize();
      fwd('index', D); leaf(0, prox('index', v()), outward('index', 'middle', v()).addScaledVector(D, 0.5), 0.03, N);
      fwd('pinky', D); leaf(1, prox('pinky', v()), outward('pinky', 'ring', v()).addScaledVector(D, 0.5), 0.027, N);
      for (const [i, f] of [[2, 'middle'], [3, 'ring']]) { // sprouts up out of the back of the hand, leaning to the fingers
        fwd(f, D); const base = at(`${f}-finger-metacarpal`, v()).lerp(prox(f, P), 0.6), dir = N.clone().negate().addScaledVector(D, 0.8);
        leaf(i, base, dir, 0.021, v().crossVectors(dir, D));
      }
      // tendrils: curling out from the thumb's root and the little finger's, swaying
      for (const [i, root, from, to] of [[0, 'thumb-metacarpal', 'index-finger-metacarpal', 'thumb-metacarpal'], [1, 'pinky-finger-metacarpal', 'ring-finger-metacarpal', 'pinky-finger-metacarpal']]) {
        at(root, P); Y.copy(at(to, C)).sub(at(from, D)).normalize(); at('wrist', D); C.copy(P).sub(D).normalize(); Y.addScaledVector(C, 0.6).normalize();
        Z.copy(N).addScaledVector(Y, -N.dot(Y)).normalize(); X.crossVectors(Y, Z);
        q.setFromAxisAngle(Z, 0.18 * Math.sin(t * 1.6 + i * 2.5) + (i ? -0.3 : 0.3)); X.applyQuaternion(q); Y.applyQuaternion(q);
        if (i) X.negate(); // the little finger's curls the other way
        m4.makeBasis(X, Y, Z).scale(S.setScalar(1.6)).setPosition(P); tendrils.setMatrixAt(i, m4); tendInk.setMatrixAt(i, m4);
      }
      // the gnome hat on your thumb, a knitted brim round it
      at('thumb-tip', P); at('thumb-phalanx-distal', D); D.subVectors(P, D).normalize(); q.setFromUnitVectors(UP, D); P.addScaledVector(D, -0.008);
      const place = (m, s, sx = s, sy = s) => { m.position.copy(P); m.quaternion.copy(q); m.scale.set(sx, sy, sx); };
      place(hat, 0.0108); place(hatInk, 0, 0.0108 * 1.25, 0.0108 * 1.1); place(brim, 0, 0.0122, 0.0045); place(brimInk, 0, 0.0136, 0.005);
      // the gnome's sleeve: back from the wrist towards the elbow
      at('wrist', P); at('middle-finger-phalanx-proximal', D); D.subVectors(P, D).normalize(); q.setFromUnitVectors(UP, D);
      P.addScaledVector(D, 0.022); place(sleeve, 0, 0.028, 0.034); place(sleeveInk, 0, 0.0305, 0.035);
      P.addScaledVector(D, -0.018); place(trim, 0, 0.0305, 0.008); place(trimInk, 0, 0.033, 0.0085);
      // the palm leaf, pulled in a little so the stems run on past it like veins
      X.set(0, 0, 0); for (const n of RIM) X.add(at(n, P)); X.divideScalar(RIM.length);
      X.toArray(palmPos, 0); X.toArray(inkPos, 0);
      RIM.forEach((n, i) => { at(n, P).sub(X); C.copy(X).addScaledVector(P, 0.86).toArray(palmPos, (i + 1) * 3); C.copy(X).addScaledVector(P, 0.97).toArray(inkPos, (i + 1) * 3); });
      palmG.attributes.position.needsUpdate = true; inkG.attributes.position.needsUpdate = true; palmG.computeVertexNormals();
      for (const m of [stems, stemInk, petals, petalInk, hearts, heartInk, buds, budInk, budHearts, leaves, leafInk, tendrils, tendInk]) m.instanceMatrix.needsUpdate = true;
    },
  };
}
