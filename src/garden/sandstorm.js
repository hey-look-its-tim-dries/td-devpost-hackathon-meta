// src/garden/sandstorm.js
// The sandstorm you can see coming: a turning column of dust in three shells that slide past each other,
// streaked along the wind, thick at the foot and fraying at the top, with grains whirling round it. Where
// it goes and what it dries is drift.js; this only draws it. In the foxfire (uTrip) it burns orange to magenta.
import * as THREE from 'three';

const SHELLS = [ // radius as a share of the storm's, height (m), turns (rad/s), opacity
  { r: 1, h: 1000, turn: 0.22, a: 0.8 },
  { r: 0.74, h: 1250, turn: 0.36, a: 0.7 },
  { r: 0.46, h: 1500, turn: 0.55, a: 0.6 },
];
const GRAINS = 700;

const wall = (uTime, uTrip, seed, opacity) => new THREE.ShaderMaterial({
  uniforms: { uTime, uTrip, uSeed: { value: seed }, uOpacity: { value: opacity } },
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  vertexShader: `varying vec2 vUv; varying vec3 vN, vV;
    void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `
    varying vec2 vUv; varying vec3 vN, vV; uniform float uTime, uTrip, uSeed, uOpacity;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p, float wrap) { // value noise that joins up round the column
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      float x0 = mod(i.x, wrap), x1 = mod(i.x + 1.0, wrap);
      return mix(mix(hash(vec2(x0, i.y)), hash(vec2(x1, i.y)), f.x), mix(hash(vec2(x0, i.y + 1.0)), hash(vec2(x1, i.y + 1.0)), f.x), f.y);
    }
    void main() {
      float y = vUv.y * 4.0 - uTime * 0.1 + uSeed; // the dust climbs
      // streaks lying along the wind, three sizes of them
      float n = noise(vec2(vUv.x * 12.0, y * 3.0), 12.0) * 0.5 + noise(vec2(vUv.x * 36.0, y * 9.0 + 3.0), 36.0) * 0.3 + noise(vec2(vUv.x * 96.0, y * 22.0 + 7.0), 96.0) * 0.2;
      float lump = noise(vec2(vUv.x * 7.0, uSeed + uTime * 0.05), 7.0); // the top billows: higher here, lower there
      float foot = smoothstep(0.0, 0.05, vUv.y), top = 1.0 - smoothstep(-0.1, 0.16, vUv.y - (0.42 + 0.5 * lump) + (n - 0.5) * 0.3);
      vec3 sand = mix(vec3(0.47, 0.34, 0.20), vec3(0.88, 0.74, 0.54), clamp(n * 0.9 + vUv.y * 0.45, 0.0, 1.0)); // dark at the foot, pale where the light gets in
      vec3 glow = mix(vec3(1.0, 0.27, 0.0), vec3(1.0, 0.0, 1.0), vUv.y) * (0.3 + 0.8 * n); // (the screen's bloom adds to it)
      float face = smoothstep(0.0, 0.5, abs(dot(normalize(vN), normalize(vV)))); // a shell seen edge-on thins away: no hard sides
      gl_FragColor = vec4(mix(sand, glow, uTrip), uOpacity * foot * top * face * (0.25 + 0.75 * smoothstep(0.38, 0.62, n)));
    }`,
});

export function createSandstorm(uTrip, radius) {
  const group = new THREE.Group(), uTime = { value: 0 };
  group.visible = false;
  const shells = SHELLS.map((s, i) => {
    const g = new THREE.CylinderGeometry(radius * s.r * 1.18, radius * s.r, s.h, 48, 1, true); // a little wider at the top
    g.translate(0, s.h / 2 - 60, 0); // its foot a little under the ground, so it meets uneven land
    const m = new THREE.Mesh(g, wall(uTime, uTrip, i * 7.3, s.a));
    m.renderOrder = 6;
    group.add(m);
    return { m, turn: s.turn };
  });
  // grains: each on its own circle round the column, the low ones fast
  const at = new Float32Array(GRAINS * 3), ring = new Float32Array(GRAINS * 3);
  for (let i = 0; i < GRAINS; i++) { const h = Math.random() ** 1.6; ring.set([Math.random() * Math.PI * 2, radius * (0.2 + 0.95 * Math.random()), (0.25 + 0.6 * Math.random()) * (1.3 - h)], i * 3); at.set([0, 30 + h * 900, 0], i * 3); }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(at, 3));
  pg.setAttribute('ring', new THREE.BufferAttribute(ring, 3));
  pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 500, 0), radius * 1.6);
  const grains = new THREE.Points(pg, new THREE.ShaderMaterial({
    uniforms: { uTime, uTrip }, transparent: true, depthWrite: false,
    vertexShader: `
      attribute vec3 ring; uniform float uTime; varying float vH;
      void main() {
        float a = ring.x + uTime * ring.z;
        vec4 mv = modelViewMatrix * vec4(cos(a) * ring.y, position.y + sin(uTime * 0.7 + ring.x * 9.0) * 25.0, sin(a) * ring.y, 1.0);
        vH = position.y / 930.0;
        gl_PointSize = clamp(5200.0 / -mv.z, 1.0, 9.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTrip; varying float vH;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(mix(vec3(0.42, 0.30, 0.18), mix(vec3(1.0, 0.45, 0.1), vec3(1.0, 0.2, 1.0), vH), uTrip), (1.0 - d * 2.0) * 0.8);
      }`,
  }));
  grains.renderOrder = 7;
  group.add(grains);
  return {
    group,
    // storm: { x, z } from drift.js, or null when none blows
    update(t, storm, groundAt) {
      group.visible = !!storm;
      if (!storm) return;
      uTime.value = t;
      group.position.set(storm.x, groundAt(storm.x, storm.z), storm.z);
      for (const s of shells) s.m.rotation.y = -t * s.turn;
    },
  };
}
