// src/atelier/room.js
// Where you read your hand in the headset: the palm reader's dome. A night sky that runs from deep violet overhead
// to a warm desert dusk at the horizon, with stars and slow bands of foxfire light; a floor drawn like a palm (rings,
// lines, a whorl at its heart) that fades into the dark; a ring of the game's flowers round you; and glowing seeds
// drifting up past the card. It stands round the rig, so it goes wherever you are.
import * as THREE from 'three';

function floorTexture() {
  const S = 1024, c = Object.assign(document.createElement('canvas'), { width: S, height: S }), g = c.getContext('2d'), m = S / 2;
  const bg = g.createRadialGradient(m, m, 0, m, m, m);
  bg.addColorStop(0, '#3a1d4a'); bg.addColorStop(0.55, '#24123a'); bg.addColorStop(1, 'rgba(14,6,28,0)');
  g.fillStyle = bg; g.fillRect(0, 0, S, S);
  g.lineCap = 'round';
  for (let r = 60; r < m; r += 34) { g.strokeStyle = `rgba(255,207,168,${0.16 * (1 - r / m)})`; g.lineWidth = 2; g.beginPath(); g.arc(m, m, r, 0, Math.PI * 2); g.stroke(); } // the ridges of a print
  g.strokeStyle = 'rgba(63,243,255,0.55)'; g.lineWidth = 5; g.shadowColor = '#3ff3ff'; g.shadowBlur = 18;
  for (const [a, b, bend] of [[-2.5, 0.4, 0.5], [-2.0, 1.2, -0.4], [2.6, -0.3, 0.3]]) { // three palm lines, rivers of light
    g.beginPath(); g.moveTo(m + Math.cos(a) * 430, m + Math.sin(a) * 430); g.quadraticCurveTo(m + Math.cos(a + bend) * 120, m + Math.sin(a + bend) * 120, m + Math.cos(b) * 430, m + Math.sin(b) * 430); g.stroke();
  }
  g.strokeStyle = 'rgba(255,79,224,0.75)'; g.shadowColor = '#ff4fe0'; g.lineWidth = 4; g.beginPath(); // a whorl at the heart, where you stand
  for (let i = 0; i <= 200; i++) { const a = i * 0.13, r = 6 + i * 0.55; if (i) g.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r); else g.moveTo(m, m); }
  g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function createAtelierRoom() {
  const group = new THREE.Group(), uTime = { value: 0 };
  group.visible = false;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(40, 48, 24), new THREE.ShaderMaterial({
    uniforms: { uTime }, side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      varying vec3 vD; uniform float uTime;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      void main() {
        float h = vD.y;
        vec3 col = mix(vec3(0.95, 0.52, 0.32), vec3(0.32, 0.12, 0.42), smoothstep(-0.05, 0.35, h)); // dusk at the horizon
        col = mix(col, vec3(0.05, 0.02, 0.12), smoothstep(0.3, 0.95, h));                              // night overhead
        col = mix(col, vec3(0.07, 0.03, 0.12), smoothstep(0.0, -0.4, h));                              // dark below
        vec3 q = floor(vD * 220.0); float s = hash(q);
        float star = step(0.9965, s) * smoothstep(0.05, 0.4, h) * (0.6 + 0.4 * sin(uTime * (1.0 + 3.0 * fract(s * 91.0)) + s * 40.0));
        col += vec3(1.0, 0.95, 0.9) * star;
        float a = atan(vD.z, vD.x);
        float band = smoothstep(0.08, 0.0, abs(h - 0.45 - 0.08 * sin(a * 3.0 + uTime * 0.15))) * (0.5 + 0.5 * sin(a * 5.0 - uTime * 0.3));
        col += mix(vec3(0.25, 0.95, 1.0), vec3(1.0, 0.3, 0.88), 0.5 + 0.5 * sin(a * 2.0 + uTime * 0.1)) * band * 0.35;  // foxfire light, slowly moving
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  dome.renderOrder = -10;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshBasicMaterial({ map: floorTexture(), transparent: true, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.002; floor.renderOrder = -9;
  // a ring of flowers round you, 2.6 m out: simple stems and heads in the game's colours, swaying
  const ring = new THREE.Group(), COLS = ['#ff4fe0', '#ffd34d', '#3ff3ff', '#ff7a3d', '#b07cff', '#ff5a7a', '#ffffff'];
  const stemM = new THREE.MeshBasicMaterial({ color: '#2f8a4a' }), stemG = new THREE.CylinderGeometry(0.008, 0.012, 1, 5), headG = new THREE.IcosahedronGeometry(1, 1), heartG = new THREE.SphereGeometry(1, 8, 6);
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + Math.sin(i * 7.1) * 0.05, r = 2.6 + Math.sin(i * 3.7) * 0.35, h = 0.35 + 0.35 * Math.abs(Math.sin(i * 1.9));
    const f = new THREE.Group(); f.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    const stem = new THREE.Mesh(stemG, stemM); stem.scale.y = h; stem.position.y = h / 2; f.add(stem);
    const head = new THREE.Mesh(headG, new THREE.MeshBasicMaterial({ color: COLS[i % COLS.length] })); head.scale.set(0.07, 0.025, 0.07); head.position.y = h; f.add(head);
    const heart = new THREE.Mesh(heartG, new THREE.MeshBasicMaterial({ color: '#ffe48a' })); heart.scale.setScalar(0.022); heart.position.y = h + 0.015; f.add(heart);
    f.userData.ph = i * 1.3; ring.add(f);
  }
  // glowing seeds drifting up round you
  const N = 240, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2, r = 0.8 + Math.random() * 3.5; pos.set([Math.cos(a) * r, Math.random() * 3, Math.sin(a) * r], i * 3); seed[i] = Math.random(); }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pg.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const motes = new THREE.Points(pg, new THREE.ShaderMaterial({
    uniforms: { uTime, uSize: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float seed; uniform float uTime, uSize; varying float vS;
      void main() { vec3 p = position; p.y = mod(p.y + uTime * (0.08 + 0.12 * seed), 3.2); p.x += 0.15 * sin(uTime * 0.5 + seed * 30.0); p.z += 0.15 * cos(uTime * 0.4 + seed * 20.0);
        vS = seed; vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = clamp(18.0 * uSize / -mv.z, 1.0, 9.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vS; void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; vec3 c = mix(vec3(0.25, 0.95, 1.0), vec3(1.0, 0.45, 0.9), vS); gl_FragColor = vec4(c, (1.0 - d * 2.0) * 0.85); }`,
  }));
  motes.frustumCulled = false;
  group.add(dome, floor, ring, motes);
  return {
    group,
    // headY: your head's height in the rig; the floor goes 1.55 m under it unless the room already knows where its floor is
    // sky: false in passthrough, where your own room is the sky and walls; the palm floor, the flowers and the seeds
    // are then laid into your real room
    // surface: a real table or floor the headset found ({ x, y, z, r }: src/atelier/table.js): the palm is laid on it,
    // sized to it, flowers and seeds and all
    update(dt, on, headY = 1.6, sky = true, surface = null) {
      group.visible = on;
      if (!on) return;
      dome.visible = sky && !surface;
      // on a surface each part is sized to it: the palm fills it, the flowers ring its edge, the seeds rise from it
      const r = surface?.r, k = surface ? r / 2.5 : 1;
      if (surface) group.position.set(surface.x, surface.y + 0.004, surface.z); else group.position.set(0, headY > 1 ? 0 : headY - 1.55, 0);
      floor.scale.setScalar(surface ? r / 9 : 1); ring.scale.setScalar(surface ? (r * 1.1) / 2.6 : 1); motes.scale.setScalar(k); motes.material.uniforms.uSize.value = k;
      uTime.value += dt;
      for (const f of ring.children) f.rotation.z = 0.06 * Math.sin(uTime.value * 1.3 + f.userData.ph);
    },
  };
}
