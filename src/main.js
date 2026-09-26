import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { headSteer, handSteer, angleBetween } from './steer.js';
import { extent, rayOnPlane, isCeiling } from './room.js';
import { startAudio, pauseAudio, setAltitude, chime } from './audio.js';

const params = new URLSearchParams(location.search);

// ?emulate: a Meta Quest 3 in a desktop browser (IWER, Meta's WebXR emulator) plus its dev UI
if (params.has('emulate')) {
  const { XRDevice, metaQuest3 } = await import('https://esm.sh/iwer@2.5.0');
  const device = new XRDevice(metaQuest3);
  device.installRuntime({ forceInstall: true });
  window.__device = device;
  // a scanned room (walls, ceiling, passthrough video) so plane detection has something to find
  try {
    const { SyntheticEnvironmentModule } = await import('https://esm.sh/@iwer/sem@2.5.0');
    device.installSEM(SyntheticEnvironmentModule);
    const room = params.get('room') || 'living_room';
    fetch(`https://unpkg.com/@iwer/sem@2.5.0/captures/${room}.json`)
      .then((r) => r.json())
      .then((json) => device.sem.loadEnvironment(json))
      .catch((e) => console.warn('IWER room unavailable', e));
  } catch (e) {
    console.warn('IWER synthetic environment unavailable', e);
  }
  if (!params.has('nodevui')) {
    try {
      const { DevUI } = await import('https://esm.sh/@iwer/devui@2.5.0');
      device.installDevUI(DevUI);
    } catch (e) {
      console.warn('IWER dev UI unavailable', e);
    }
  }
}

const SPEED = 4; // m/s upward: slow enough to stay calm lying down
const SIDE = 3; // m/s sideways at full steer
const CATCH = 6; // metres ahead where lights are caught (the ring)
const JOURNEY = 720; // seconds from noon to space if you never catch a light
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = THREE.MathUtils.clamp;

// Sky palette by altitude: [altitude, zenith, horizon, cloud lit, cloud shade]
const SKY = [
  [0.0, '#1a78dc', '#c4e6ff', '#ffffff', '#a3b9d8'],
  [0.35, '#3a78c8', '#ffd2a1', '#fff1de', '#c49aa0'],
  [0.6, '#29307a', '#ff9db3', '#ffd3de', '#6d5a92'],
  [0.8, '#090e2c', '#3a2b6c', '#8f8ab9', '#2b2952'],
  [1.0, '#010208', '#0b1236', '#8f8ab9', '#2b2952'],
];

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local'); // no floor needed: you may be lying in bed
renderer.xr.setFoveation(1);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x6a88b0, 2.2)); // only the hand models are lit
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 2000);
scene.add(camera);

// The stage is the sky's frame, captured from your head at calibration: -Z is "up", wherever that
// is for your body. The world inside it scrolls past as you rise.
const stage = new THREE.Group();
const world = new THREE.Group();
stage.add(world);
scene.add(stage);
const stageTarget = { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() };

const U = {
  uTime: { value: 0 },
  uPlaneInv: { value: new THREE.Matrix4() }, // world → the plane the skylight is cut into
  uHole: { value: new THREE.Vector3() }, // skylight centre (x, z on the plane) and radius, metres
  uBox: { value: new THREE.Vector4(-1e4, -1e4, 1e4, 1e4) }, // the plane's extent
  uOpen: { value: 1 }, // 1 = no room left, the sky is everywhere
  uZenith: { value: new THREE.Color() },
  uHorizon: { value: new THREE.Color() },
  uLit: { value: new THREE.Color() },
  uShade: { value: new THREE.Color() },
  uSun: { value: 1 },
  uClouds: { value: 1 },
  uStars: { value: 0 },
  uTex: { value: cloudTexture() },
};

// In passthrough the sky only shows through a skylight cut into your ceiling (or a virtual one along
// your gaze); the room stays outside it. Each pixel's ray from the eye is tested against the plane,
// so the hole stays put on the real ceiling as your head moves. Same maths as rayOnPlane in room.js.
const PORTAL = /* glsl */ `
  uniform mat4 uPlaneInv;
  uniform vec3 uHole;
  uniform vec4 uBox;
  uniform float uOpen;
  // metres from the skylight's edge on the plane, negative inside; large if the ray misses the plane
  float holeDist(vec3 world) {
    vec3 o = (uPlaneInv * vec4(cameraPosition, 1.0)).xyz;
    vec3 d = (uPlaneInv * vec4(world, 1.0)).xyz - o;
    if (o.y * d.y >= 0.0) return 1e3;
    vec2 h = o.xz - d.xz * (o.y / d.y);
    vec2 q = max(uBox.xy - h, h - uBox.zw);
    return max(length(h - uHole.xy) - uHole.z, max(q.x, q.y));
  }
  float portal(vec3 world) { return uOpen >= 1.0 ? 1.0 : max(uOpen, 1.0 - smoothstep(-0.02, 0.02, holeDist(world))); }`;

const BILLBOARD = /* glsl */ `
  attribute vec4 aSeed;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vDist;
  vec4 billboard(float rot) {
    vec4 center = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float size = length(instanceMatrix[0].xyz);
    vec4 mv = viewMatrix * center;
    float c = cos(rot), s = sin(rot);
    vec2 off = mat2(c, s, -s, c) * position.xy * size;
    mv.xy += off;
    vWorld = center.xyz + (vec4(off, 0.0, 0.0) * viewMatrix).xyz; // view → world (transpose)
    vDist = length(mv.xyz);
    return projectionMatrix * mv;
  }`;

// ---------- sky dome, stars, catch ring ----------

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1000, 64, 32),
  new THREE.ShaderMaterial({
    uniforms: U,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir, vWorld;
      void main() {
        vDir = position;
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${PORTAL}
      uniform vec3 uZenith, uHorizon;
      uniform float uSun, uStars;
      varying vec3 vDir, vWorld;
      void main() {
        vec3 n = normalize(vDir);
        float up = -n.z;
        vec3 col = mix(uHorizon, uZenith, smoothstep(-0.15, 0.95, up));
        float s = max(dot(n, normalize(vec3(0.25, 0.55, -0.8))), 0.0);
        col += uSun * (pow(s, 900.0) * 3.0 + pow(s, 20.0) * 0.22) * mix(vec3(1.0), uHorizon, 0.5);
        float band = dot(n, normalize(vec3(0.8, 0.3, 0.25)));
        col += uStars * 0.07 * exp(-band * band * 40.0) * vec3(0.55, 0.5, 0.95);
        float a = portal(vWorld);
        float rim = uOpen >= 1.0 ? 0.0 : (1.0 - uOpen) * exp(-abs(holeDist(vWorld)) * 40.0);
        gl_FragColor = vec4(col + rim * 0.5, max(a, rim * 0.7));
        #include <colorspace_fragment>
      }`,
  }),
);
sky.renderOrder = -2;
stage.add(sky);

const STARS = 3500;
const starPos = new Float32Array(STARS * 3);
const starSeed = new Float32Array(STARS * 2);
for (let i = 0; i < STARS; i++) {
  const v = new THREE.Vector3().randomDirection().multiplyScalar(900);
  starPos.set([v.x, v.y, v.z], i * 3);
  starSeed.set([rand(1.2, 3.4) * (Math.random() < 0.05 ? 1.8 : 1), rand(0, 6.28)], i * 2);
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
starGeo.setAttribute('aSeed', new THREE.BufferAttribute(starSeed, 2));
const stars = new THREE.Points(
  starGeo,
  new THREE.ShaderMaterial({
    uniforms: U,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute vec2 aSeed;
      varying vec3 vWorld;
      varying float vTwinkle;
      void main() {
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        vTwinkle = 0.65 + 0.35 * sin(uTime * 1.3 + aSeed.y);
        gl_PointSize = aSeed.x;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${PORTAL}
      uniform float uStars;
      varying vec3 vWorld;
      varying float vTwinkle;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.2, 1.0, r)) * uStars * vTwinkle * portal(vWorld);
        gl_FragColor = vec4(vec3(1.0, 0.97, 0.92), a);
        #include <colorspace_fragment>
      }`,
  }),
);
stars.renderOrder = -1;
stage.add(stars);

// Where lights are caught. It banks with your steering, so you can feel the controls working.
const ring = new THREE.Mesh(
  new THREE.RingGeometry(1.1, 1.135, 96),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, depthWrite: false }),
);
ring.position.z = -CATCH;
stage.add(ring);

// ---------- clouds: clusters of soft billboards, one draw call ----------

function cloudTexture() {
  // Four hand-rolled fBm puffs in a 2x2 atlas. Generated at load, so there is nothing to download.
  const S = 256, W = S * 2, data = new Uint8Array(W * W * 4);
  const hash = (x, y, s) => {
    const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
    return h - Math.floor(h);
  };
  const noise = (x, y, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y, s) => {
    let v = 0, amp = 0.5;
    for (let o = 0; o < 5; o++, x *= 2.03, y *= 2.03, amp *= 0.5) v += amp * noise(x, y, s + o * 13);
    return v;
  };
  const smooth = THREE.MathUtils.smoothstep;
  for (let cell = 0; cell < 4; cell++) {
    const ox = (cell % 2) * S, oy = Math.floor(cell / 2) * S;
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const x = (i / S) * 2 - 1, y = (j / S) * 2 - 1;
        const r = Math.hypot(x, y * 1.2);
        const lumpy = r + (fbm(x * 2.2 + cell * 5, y * 2.2, cell) - 0.5) * 0.8;
        const shape = (1 - smooth(lumpy, 0.3, 1)) * (1 - smooth(r, 0.82, 1));
        const v = clamp(shape * (0.55 + 0.6 * fbm(x * 3.5 + 40, y * 3.5, cell + 9)) * 1.2 - 0.06, 0, 1);
        const k = ((oy + j) * W + ox + i) * 4;
        data[k] = data[k + 1] = data[k + 2] = v * 255;
        data[k + 3] = 255;
      }
    }
  }
  const tex = new THREE.DataTexture(data, W, W);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

const CLUSTERS = 34, PUFFS = 10;
const cloudGeo = new THREE.PlaneGeometry(1, 1);
const cloudSeed = new THREE.InstancedBufferAttribute(new Float32Array(CLUSTERS * PUFFS * 4), 4);
cloudGeo.setAttribute('aSeed', cloudSeed);
const clouds = new THREE.InstancedMesh(
  cloudGeo,
  new THREE.ShaderMaterial({
    uniforms: U,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      ${BILLBOARD}
      varying float vShade, vAlpha;
      varying vec2 vLight;
      void main() {
        gl_Position = billboard(aSeed.y);
        vUv = (uv + vec2(mod(aSeed.x, 2.0), floor(aSeed.x / 2.0))) * 0.5;
        vLight = vec2(sin(aSeed.y), cos(aSeed.y)) * 0.022; // towards the top of your view
        vShade = aSeed.z;
        // appear out of the distance, dissolve before a puff fills your face
        vAlpha = aSeed.w * smoothstep(9.0, 32.0, vDist) * (1.0 - smoothstep(170.0, 235.0, vDist));
      }`,
    fragmentShader: /* glsl */ `
      ${PORTAL}
      uniform sampler2D uTex;
      uniform vec3 uLit, uShade, uZenith, uHorizon;
      uniform float uClouds;
      varying vec2 vUv, vLight;
      varying vec3 vWorld;
      varying float vDist, vShade, vAlpha;
      void main() {
        float d = texture2D(uTex, vUv).r;
        float toward = texture2D(uTex, vUv + vLight).r;
        float light = clamp(0.62 + (d - toward) * 4.0, 0.0, 1.0) * mix(0.55, 1.0, vShade);
        vec3 col = mix(uShade, uLit, light);
        col = mix(col, mix(uHorizon, uZenith, 0.5), smoothstep(40.0, 230.0, vDist) * 0.45);
        gl_FragColor = vec4(col, d * vAlpha * uClouds * portal(vWorld));
        #include <colorspace_fragment>
      }`,
  }),
  CLUSTERS * PUFFS,
);
clouds.frustumCulled = false;
clouds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
world.add(clouds);

const P = { x: 0, z: 0, vx: 0 }; // you, in sky coordinates
const clusters = [];

function placeCluster(c, z) {
  const cx = P.x + rand(-48, 48);
  let cy = rand(-32, 32);
  if (Math.abs(cx - P.x) < 12 && Math.abs(cy) < 9) cy = Math.sign(cy || 1) * rand(9, 32); // keep the flight line open
  const w = rand(9, 20);
  c.z = z;
  c.puffs = Array.from({ length: PUFFS }, () => {
    const ox = rand(-1, 1) * w, oy = rand(-0.35, 0.6) * w * 0.5;
    return {
      x: cx + ox, y: cy + oy, z: z + rand(-1, 1) * w * 0.5,
      size: rand(7, 15) * (1 - (Math.abs(ox) / w) * 0.45),
      seed: [Math.floor(Math.random() * 4), rand(0, 6.283), clamp(oy / (w * 0.3) * 0.5 + 0.5, 0, 1), rand(0.55, 0.95)],
    };
  });
}

const m4 = new THREE.Matrix4();
function writeClouds() {
  // Instances draw in buffer order, so write them far to near once per respawn (cheap, and it
  // keeps the soft edges blending the right way round).
  let k = 0;
  for (const c of [...clusters].sort((a, b) => a.z - b.z)) {
    for (const p of [...c.puffs].sort((a, b) => a.z - b.z)) {
      clouds.setMatrixAt(k, m4.makeScale(p.size, p.size, p.size).setPosition(p.x, p.y, p.z));
      cloudSeed.array.set(p.seed, k * 4);
      k++;
    }
  }
  clouds.instanceMatrix.needsUpdate = true;
  cloudSeed.needsUpdate = true;
}

for (let i = 0; i < CLUSTERS; i++) {
  const c = {};
  placeCluster(c, P.z - rand(0, 235));
  clusters.push(c);
}
writeClouds();

// ---------- lights: trails you follow, each catch is a note ----------

const MOTES = 40;
const moteGeo = new THREE.PlaneGeometry(1, 1);
const moteSeed = new THREE.InstancedBufferAttribute(new Float32Array(MOTES * 4), 4);
moteGeo.setAttribute('aSeed', moteSeed);
const motesMesh = new THREE.InstancedMesh(
  moteGeo,
  new THREE.ShaderMaterial({
    uniforms: U,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      ${BILLBOARD}
      varying float vFade;
      void main() { gl_Position = billboard(0.0); vUv = uv; vFade = aSeed.x; }`,
    fragmentShader: /* glsl */ `
      ${PORTAL}
      varying vec2 vUv;
      varying vec3 vWorld;
      varying float vFade;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float a = (exp(-r * r * 22.0) + exp(-r * r * 2.5) * 0.5) * (1.0 - smoothstep(0.8, 1.0, r)) * vFade * portal(vWorld);
        gl_FragColor = vec4(mix(vec3(1.0, 0.78, 0.38), vec3(1.0), exp(-r * r * 40.0)), a); // gold, white-hot core
        #include <colorspace_fragment>
      }`,
  }),
  MOTES,
);
motesMesh.frustumCulled = false;
motesMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
world.add(motesMesh);
const motes = Array.from({ length: MOTES }, () => ({ on: false }));
let trailTimer = 1;
let firstTrail = true;

function spawnTrail() {
  const dist = firstTrail ? 36 : 70; // the first lights arrive within seconds
  firstTrail = false;
  const n = 5 + Math.floor(Math.random() * 4), x0 = P.x + rand(-3.5, 3.5);
  const amp = rand(0.8, 2.6), phase = rand(0, 6.28), y = rand(-0.4, 0.4);
  for (let k = 0; k < n; k++) {
    const m = motes.find((m) => !m.on);
    if (!m) break;
    Object.assign(m, { on: true, passed: false, burst: -1, x: x0 + amp * Math.sin(phase + k * 0.55), y, z: P.z - dist - k * 5 });
  }
  return (n * 5) / SPEED + rand(1.5, 4);
}

function writeMotes() {
  motes.forEach((m, i) => {
    let s = 0, fade = 0;
    if (m.on) {
      const ahead = P.z - m.z;
      s = 0.55 + Math.max(0, ahead - CATCH) * 0.02; // stay visible far away
      fade = clamp((80 - ahead) / 12, 0, 1) * clamp((ahead + 6) / 6, 0, 1);
      if (m.burst >= 0) {
        s *= 1 + m.burst * 5;
        fade = 1 - m.burst;
      } else if (m.passed) fade *= 0.35;
    }
    motesMesh.setMatrixAt(i, m4.makeScale(s, s, s).setPosition(m.x ?? 0, m.y ?? 0, m.z ?? 0));
    moteSeed.array[i * 4] = fade;
  });
  motesMesh.instanceMatrix.needsUpdate = true;
  moteSeed.needsUpdate = true;
}

// ---------- the floating text panel (works in the headset, where the page is invisible) ----------

const panelCanvas = Object.assign(document.createElement('canvas'), { width: 1024, height: 300 });
const panelTex = new THREE.CanvasTexture(panelCanvas);
panelTex.colorSpace = THREE.SRGBColorSpace;
const panel = new THREE.Mesh(
  new THREE.PlaneGeometry(1.1, 0.32),
  new THREE.MeshBasicMaterial({ map: panelTex, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }),
);
panel.renderOrder = 10;
panel.position.set(0, 0.3, -2); // ~30° wide: inside every headset's comfortable field of view
stage.add(panel);
let panelLife = 0;

function say(title, sub, seconds = 8) {
  const g = panelCanvas.getContext('2d');
  g.clearRect(0, 0, 1024, 300);
  g.fillStyle = 'rgba(6, 22, 46, 0.5)';
  g.beginPath();
  g.roundRect(8, 8, 1008, 284, 60);
  g.fill();
  g.textAlign = 'center';
  g.fillStyle = '#ffffff';
  g.font = '600 76px Inter, system-ui, sans-serif';
  g.fillText(title, 512, 128);
  g.fillStyle = 'rgba(235, 247, 255, 0.86)';
  g.font = '40px Inter, system-ui, sans-serif';
  g.fillText(sub, 512, 212);
  panelTex.needsUpdate = true;
  panelLife = seconds;
}

// ---------- input: head, hands (pinch), controllers, and a desktop fallback ----------

const headPos = new THREE.Vector3(), headQuat = new THREE.Quaternion(), lastQuat = new THREE.Quaternion();
const neutral = new THREE.Quaternion();
const tmp = new THREE.Vector3();
let mode = 'idle'; // idle (title) → waiting (in headset, settling) → opening → flying
let passthrough = false, still = 0, opening = 0, alt = clamp(+params.get('alt') || 0, 0, 1);
let caught = 0, steer = 0, grab = null, lastPinch = -1, ringPulse = 0, recentre = false, reachedTop = alt >= 1;
let ceiling = null; // the real ceiling plane the skylight is cut into, when the headset knows the room
const planeWorld = new THREE.Matrix4(), planeInv = new THREE.Matrix4(), holeAt = new THREE.Vector2(), tmp2 = new THREE.Vector2();
const planeQuat = new THREE.Quaternion(), ONE = new THREE.Vector3(1, 1, 1);
const gaze = new THREE.Vector3(), UP_TO_Y = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
const keys = { left: 0, right: 0 };
let pointerSteer = null;

function readHead() {
  const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  headPos.copy(cam.position);
  headQuat.copy(cam.quaternion);
}

function calibrate() {
  readHead();
  neutral.copy(headQuat);
  stageTarget.position.copy(headPos);
  stageTarget.quaternion.copy(headQuat);
  if (mode === 'waiting' || mode === 'idle') {
    mode = 'opening';
    opening = 0;
    say(ceiling ? 'Your ceiling opens' : passthrough ? 'The sky opens' : 'Breathe out', 'Turn or tilt your head to drift. Follow the lights.', 9);
  }
}

const sideways = (obj) => stage.worldToLocal(tmp.copy(obj.position)).x;

function onPinch(ctrl) {
  startAudio();
  const now = clock.elapsedTime;
  if (mode === 'waiting') return calibrate();
  if (now - lastPinch < 0.45) {
    lastPinch = -1;
    grab = null;
    calibrate();
    return say('Recentred', 'The sky is wherever you look now', 3);
  }
  lastPinch = now;
  grab = { ctrl, x0: sideways(ctrl) }; // pinch and pull sideways: steering for hands
}

const handFactory = new XRHandModelFactory();
for (let i = 0; i < 2; i++) {
  const hand = renderer.xr.getHand(i);
  hand.add(handFactory.createHandModel(hand, 'mesh'));
  scene.add(hand);
  const ctrl = renderer.xr.getController(i); // a pinch is a "select" for hands, the trigger for controllers
  ctrl.addEventListener('selectstart', () => onPinch(ctrl));
  ctrl.addEventListener('selectend', () => grab?.ctrl === ctrl && (grab = null));
  scene.add(ctrl);
}

function autopilot() {
  const next = motes.filter((m) => m.on && !m.passed).sort((a, b) => b.z - a.z)[0];
  return next ? clamp((next.x - P.x) * 1.2, -1, 1) : 0;
}

function readSteer() {
  if (grab) return handSteer(sideways(grab.ctrl) - grab.x0);
  if (params.has('auto')) return autopilot();
  if (renderer.xr.isPresenting) return mode === 'waiting' ? 0 : headSteer(neutral.toArray(), headQuat.toArray());
  if (keys.left || keys.right) return keys.right - keys.left;
  return pointerSteer ?? 0;
}

addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = 1;
  if (e.key === 'ArrowRight' || e.key === 'd') keys.right = 1;
});
addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = 0;
  if (e.key === 'ArrowRight' || e.key === 'd') keys.right = 0;
});
addEventListener('pointermove', (e) => {
  if (mode !== 'idle') pointerSteer = clamp((e.clientX / innerWidth - 0.5) * 2.4, -1, 1);
});
addEventListener('resize', () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- start / stop ----------

const banner = document.getElementById('banner');
const xrButton = document.getElementById('xrButton');
const previewButton = document.getElementById('previewButton');
const hint = document.getElementById('hint');

function preview() {
  startAudio();
  banner.classList.add('hidden');
  hint.classList.remove('hidden');
  setTimeout(() => hint.classList.add('hidden'), 9000);
  calibrate();
}

async function enterHeadset() {
  startAudio();
  const ar = await navigator.xr.isSessionSupported('immersive-ar');
  const session = await navigator.xr.requestSession(ar ? 'immersive-ar' : 'immersive-vr', {
    optionalFeatures: ['hand-tracking', 'plane-detection'],
  });
  await renderer.xr.setSession(session);
  passthrough = ar && session.environmentBlendMode !== 'opaque';
  banner.classList.add('hidden');
  mode = 'waiting';
  still = 0;
  say('Settle in', 'Look where you want your sky. Hold still, or pinch.', 1e9);
  // the system recentre (hold the Meta button) moves the origin: take the new pose as neutral
  renderer.xr.getReferenceSpace()?.addEventListener('reset', () => (recentre = true));
  // the Meta menu or a notification hides the session: hush, and pick up where you were after
  session.addEventListener('visibilitychange', () => pauseAudio(session.visibilityState === 'hidden'));
  session.addEventListener('end', () => {
    mode = 'idle';
    passthrough = false;
    ceiling = null;
    grab = null;
    stageTarget.position.set(0, 0, 0);
    stageTarget.quaternion.identity();
    camera.position.set(0, 0, 0); // the headset left its last pose on the page camera
    camera.quaternion.identity();
    banner.classList.remove('hidden');
  });
}

xrButton.addEventListener('click', () => enterHeadset().catch((e) => console.error(e)));
previewButton.addEventListener('click', preview);
if (navigator.xr) {
  Promise.all([navigator.xr.isSessionSupported('immersive-ar'), navigator.xr.isSessionSupported('immersive-vr')])
    .then(([ar, vr]) => (ar || vr) && xrButton.classList.remove('hidden'))
    .catch(() => {});
}
if (params.has('play')) preview();
document.addEventListener('visibilitychange', () => pauseAudio(document.hidden));

// ---------- the loop ----------

const clock = new THREE.Clock();
const colA = new THREE.Color();

function paint(a) {
  let i = 0;
  while (i < SKY.length - 2 && a > SKY[i + 1][0]) i++;
  const t = THREE.MathUtils.smoothstep(a, SKY[i][0], SKY[i + 1][0]);
  [U.uZenith, U.uHorizon, U.uLit, U.uShade].forEach((u, k) => u.value.set(SKY[i][k + 1]).lerp(colA.set(SKY[i + 1][k + 1]), t));
  U.uSun.value = 1 - THREE.MathUtils.smoothstep(a, 0.5, 0.78);
  U.uClouds.value = 1 - THREE.MathUtils.smoothstep(a, 0.55, 0.82);
  U.uStars.value = THREE.MathUtils.smoothstep(a, 0.58, 0.86);
}

// Find the ceiling you are looking at among the planes the headset detected (Quest: Space Setup).
// Returns the plane and where your gaze lands on it, or null: then a virtual plane stands in.
function lookForCeiling(xrFrame) {
  const planes = xrFrame?.detectedPlanes, ref = renderer.xr.getReferenceSpace();
  if (!planes || !ref) return null;
  gaze.set(0, 0, -1).applyQuaternion(headQuat);
  let best = null;
  for (const plane of planes) {
    const pose = xrFrame.getPose(plane.planeSpace, ref);
    if (!pose || !isCeiling(plane.semanticLabel, plane.orientation, pose.transform.position.y - headPos.y)) continue;
    const inv = new THREE.Matrix4().fromArray(pose.transform.matrix).invert();
    const hit = rayOnPlane(inv.elements, headPos.toArray(), gaze.toArray(), extent(plane.polygon));
    if (hit && hit.dist < 8 && (!best || hit.dist < best.hit.dist)) best = { plane, hit };
  }
  return best;
}

// Put the skylight's plane in the shader: the real ceiling (pose refreshed every frame, planes get
// refined as the headset looks around) or a virtual one 2 m out along the sky's "up".
function placePlane(xrFrame) {
  const pose = ceiling && xrFrame?.getPose(ceiling.planeSpace, renderer.xr.getReferenceSpace());
  if (pose) {
    planeWorld.fromArray(pose.transform.matrix);
    U.uBox.value.fromArray(extent(ceiling.polygon));
  } else if (!ceiling) {
    planeWorld.compose(tmp.set(0, 0, -2).applyQuaternion(stage.quaternion).add(stage.position),
      planeQuat.copy(stage.quaternion).multiply(UP_TO_Y), ONE);
    U.uBox.value.set(-1e4, -1e4, 1e4, 1e4);
    holeAt.set(0, 0);
  }
  U.uPlaneInv.value.copy(planeInv.copy(planeWorld).invert());
}

let speed = 2;

function frame(time, xrFrame) {
  const dt = Math.min(clock.getDelta(), 0.05);
  U.uTime.value = clock.elapsedTime;
  readHead();
  if (recentre) {
    recentre = false;
    if (mode !== 'waiting') calibrate();
  }

  if (mode === 'waiting') {
    // the sky follows your gaze until you settle, then stays put
    stageTarget.position.copy(headPos);
    stageTarget.quaternion.copy(headQuat);
    const found = lookForCeiling(xrFrame);
    if (found && found.plane !== ceiling) holeAt.set(found.hit.x, found.hit.z);
    ceiling = found?.plane ?? null;
    if (found) holeAt.lerp(tmp2.set(found.hit.x, found.hit.z), 1 - Math.exp(-dt * 6));
    still = angleBetween(lastQuat.toArray(), headQuat.toArray()) / dt < 0.07 ? still + dt : 0;
    if (still > 3) calibrate();
  }
  lastQuat.copy(headQuat);
  const k = 1 - Math.exp(-dt * (mode === 'waiting' ? 6 : 3));
  stage.position.lerp(stageTarget.position, k);
  stage.quaternion.slerp(stageTarget.quaternion, k);

  const playing = mode === 'opening' || mode === 'flying';
  steer = playing ? readSteer() : 0;
  speed += ((mode === 'idle' ? 2 : mode === 'waiting' ? 1 : SPEED) - speed) * (1 - Math.exp(-dt * 0.6));
  P.vx += (steer * SIDE - P.vx) * (1 - Math.exp(-dt * 3));
  P.x += P.vx * dt;
  P.z -= speed * dt;
  world.position.set(-P.x, 0, -P.z);

  // clouds that slipped behind you are reborn far ahead
  let moved = false;
  for (const c of clusters) {
    if (c.z - P.z > 25) {
      placeCluster(c, P.z - rand(200, 235));
      moved = true;
    }
  }
  if (moved) writeClouds();

  trailTimer -= dt * (speed / SPEED);
  if (trailTimer <= 0) trailTimer = spawnTrail();
  for (const m of motes) {
    if (!m.on) continue;
    const ahead = P.z - m.z;
    if (m.burst >= 0) {
      m.z = P.z - CATCH; // bursts hang in the ring
      m.burst += dt / 0.8;
      if (m.burst >= 1) m.on = false;
    } else if (ahead < CATCH && !m.passed) {
      m.passed = true;
      if (playing && Math.abs(m.x - P.x) < 1.15) {
        m.burst = 0;
        caught++;
        alt += 0.004;
        ringPulse = 1;
        chime((m.x - P.x) / 1.15);
      }
    } else if (ahead < -8) m.on = false;
  }

  if (playing) {
    alt = Math.min(1, alt + dt / JOURNEY);
    if (mode === 'opening' && (opening += dt) > 6) mode = 'flying';
    if (alt >= 1 && !reachedTop) {
      reachedTop = true;
      say('The quiet', `${caught} lights gathered. Stay as long as you like.`, 12);
    }
  }
  paint(alt);
  setAltitude(alt);

  // the skylight: a pinhole while you settle, a window as it opens, then the whole ceiling (the walls
  // stay real), and finally the room fades and the sky is all around you
  let radius = 0, open = 1;
  if (passthrough) {
    if (mode === 'waiting') radius = 0.25;
    else if (mode === 'opening') radius = 0.25 + 2.6 * THREE.MathUtils.smootherstep(opening, 0, 6);
    else radius = 2.85 + 12 * THREE.MathUtils.smoothstep(alt, 0.03, 0.2);
    open = THREE.MathUtils.smoothstep(alt, 0.14, 0.3);
  }
  U.uHole.value.set(holeAt.x, holeAt.y, radius);
  U.uOpen.value = open;

  ringPulse = Math.max(0, ringPulse - dt * 1.5);
  ring.rotation.z = -steer * 0.35;
  ring.scale.setScalar(1 + ringPulse * 0.08);
  ring.material.opacity = mode === 'waiting' ? 0.15 + 0.5 * clamp(still / 3, 0, 1) : mode === 'idle' ? 0 : 0.16 + ringPulse * 0.5;

  panelLife -= dt;
  panel.material.opacity = clamp(panelLife, 0, 1);

  stage.updateMatrixWorld();
  placePlane(xrFrame);
  writeMotes();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);

// read-only peek for tests and curious players: window.__upwards.state
window.__upwards = {
  get state() {
    return { mode, alt, caught, steer, passthrough, ceiling: !!ceiling, hole: U.uHole.value.z, open: U.uOpen.value, x: P.x };
  },
};
