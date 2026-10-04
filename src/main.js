import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { headSteer } from './steer.js';
import { startAudio, pauseAudio, setWind } from './audio.js';
import { JOINTS, palmFrame, createPalmDown, palmTilt } from './gesture.js';
import { createPanel } from './panel.js';
import { createInk } from './ink.js';
import { createGlide } from './glide.js';
import { createScribble, createKnot } from './scribble.js';
import { unpackPrint } from './hand/dna.js';
import { founders, toHand, toWorld } from './world/founders.js';
import { createWorldScene } from './world/scene.js';
import { createHandMesh } from './world/handmesh.js';

// Palm Whorl Cities, first milestone: the First Ten. Ten founding hands lie in a ring around the
// Source. Their lines are rivers, their fingertips are print lands, and black-ink scribbles knot
// over them. You glide above it all, steering with a tilted palm, your head, or the keyboard.

const params = new URLSearchParams(location.search);
const AUTO = params.has('auto'); // a slow circle, for screenshots and headless checks

// ?emulate: a Meta Quest 3 in a desktop browser (IWER, Meta's WebXR emulator); &device=glasses for
// the Meta VR Glasses profile; &nodevui hides the emulator's controls
if (params.has('emulate')) {
  const { XRDevice, metaQuest3, metaVRGlasses } = await import('https://esm.sh/iwer@2.5.0');
  const device = new XRDevice(params.get('device') === 'glasses' ? metaVRGlasses : metaQuest3);
  device.installRuntime({ forceInstall: true });
  window.__device = device;
  if (!params.has('nodevui')) {
    try {
      const { DevUI } = await import('https://esm.sh/@iwer/devui@2.5.0');
      device.installDevUI(DevUI);
    } catch (e) {
      console.warn('IWER dev UI unavailable', e);
    }
  }
}

// ---------- renderer, you, the world ----------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local');
renderer.xr.setFoveation(1);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const rig = new THREE.Group(); // you: camera and hands, gliding
scene.add(rig);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.5, 40000);
rig.add(camera);
const world = createWorldScene();
scene.add(world.sea);
rig.add(world.sky);
const panel = createPanel();
rig.add(panel.mesh);

// ---------- the First Ten, grown in workers ----------

const FOUNDERS = founders();
const hands = [];
const workers = [0, 1, 2].map(() => new Worker(new URL('./hand/worker.js', import.meta.url), { type: 'module' }));
for (const w of workers) {
  w.onmessage = ({ data }) => {
    const f = FOUNDERS[data.id];
    scene.add(createHandMesh(data, f.pose, world.shared));
    hands.push({ ...f, data });
  };
  w.onerror = (e) => console.error('hand worker failed', e);
}
FOUNDERS.forEach((f, id) => workers[id % workers.length].postMessage({ id, palm: f.palm, prints: f.prints, cell: 0.75 }));

// height of the world at (x, z): the highest hand there, or the sea
function groundAt(x, z) {
  let top = 0;
  for (const { pose, data: d } of hands) {
    const [X, Y] = toHand(pose, x, z);
    const c = (X - d.x0) / d.cell - 0.5, r = (Y - d.y0) / d.cell - 0.5;
    if (c < 0 || r < 0 || c >= d.w - 1 || r >= d.h - 1) continue;
    const c0 = Math.floor(c), r0 = Math.floor(r), fx = c - c0, fy = r - r0, H = d.height, i = r0 * d.w + c0;
    top = Math.max(top, (H[i] * (1 - fx) + H[i + 1] * fx) * (1 - fy) + (H[i + d.w] * (1 - fx) + H[i + d.w + 1] * fx) * fy);
  }
  return top;
}

// ---------- scribbles: founders' knots over their palms, and your own five following you ----------

const LINE = { points: 90, spacing: 0.55 };
const TAPER = (s) => 0.12 + 0.88 * Math.pow(Math.sin(Math.PI * s), 0.6);
const knots = FOUNDERS.flatMap((f) => f.prints.map(unpackPrint).map((p, j) => {
  const [cx, cz] = toWorld(f.pose, 0, 230);
  const knot = createKnot({ cls: p.cls, seed: p.seed, center: [cx, 70 + j * 7, cz], radius: 15 + j * 2, tilt: 0.35 + j * 0.18 });
  return { knot, line: createScribble({ ...LINE, at: knot.step(0, 0), seed: p.seed }) };
}));
const glide = createGlide({ pos: params.get('at')?.split(',').map(Number) ?? [0, 230, 1150] }); // ?at=x,y,z to start elsewhere
const mine = [0, 1, 2, 3, 4].map((j) => createScribble({ ...LINE, at: [glide.pos[0] + (j - 2) * 14, glide.pos[1] - 20, glide.pos[2] - 95], seed: 900 + j }));
const ink = createInk((knots.length + mine.length) * (LINE.points + 1), { width: 0.32, color: '#16100e' });
scene.add(ink.mesh);

// ---------- hands and head (read live for steering, never kept) ----------

const handFactory = new XRHandModelFactory();
const xrHands = [0, 1].map((i) => {
  const hand = renderer.xr.getHand(i);
  hand.add(handFactory.createHandModel(hand, 'mesh'));
  rig.add(hand);
  const h = { hand, handedness: i ? 'right' : 'left', frame: null, palmDown: createPalmDown(), ref: null, store: Object.fromEntries(JOINTS.map((n) => [n, [0, 0, 0]])) };
  hand.addEventListener('connected', (e) => { h.handedness = e.data.handedness || h.handedness; });
  return h;
});
function readHands(dt) {
  for (const h of xrHands) {
    const j = h.hand.joints;
    const ok = renderer.xr.isPresenting && j && j.wrist && j.wrist.visible && JOINTS.every((n) => j[n]);
    if (ok) for (const n of JOINTS) j[n].position.toArray(h.store[n]);
    h.frame = ok ? palmFrame(h.store, h.handedness) : null;
    if (!h.palmDown.update(h.frame, -Infinity, dt)) h.ref = null;
    else if (!h.ref && h.frame) h.ref = JSON.parse(JSON.stringify(h.frame)); // the pose you started steering in
  }
}
const headQuat = new THREE.Quaternion(), headLocal = new THREE.Vector3();
let headNeutral = null;
function readHead() {
  const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  headLocal.copy(cam.position);
  headQuat.copy(cam.quaternion);
}

// ---------- steering ----------

const keys = new Set();
addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
const look = { yaw: 0, pitch: +(params.get('pitch') ?? -0.32), drag: false }; // ?pitch= for screenshots
renderer.domElement.addEventListener('pointerdown', () => (look.drag = true));
addEventListener('pointerup', () => (look.drag = false));
addEventListener('pointermove', (e) => {
  if (!look.drag) return;
  look.yaw -= e.movementX * 0.003;
  look.pitch = Math.max(-1.3, Math.min(0.6, look.pitch - e.movementY * 0.003));
});
const clamp1 = (v) => Math.max(-1, Math.min(1, v));
let started = false;
function steering() {
  if (AUTO || !started) return { turn: 0.12, climb: 0 }; // the title screen is the world, drifting
  if (renderer.xr.isPresenting) {
    const h = xrHands.find((q) => q.ref && q.frame);
    if (h) {
      const { roll, pitch } = palmTilt(h.frame, h.ref);
      return { turn: clamp1(roll / 0.45), climb: clamp1(pitch / 0.45) };
    }
    headNeutral ||= headQuat.toArray();
    return { turn: 0.6 * headSteer(headNeutral, headQuat.toArray()), climb: 0 };
  }
  const k = (a, b) => (keys.has(a) || keys.has(b) ? 1 : 0);
  return { turn: k('d', 'arrowright') - k('a', 'arrowleft'), climb: k('w', 'arrowup') - k('s', 'arrowdown') };
}

// ---------- the loop ----------

const clock = new THREE.Clock();
let t = 0, fps = 60;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  readHead();
  readHands(dt);
  const steer = steering();
  glide.update(dt, steer, groundAt);
  rig.position.fromArray(glide.pos);
  rig.rotation.y = glide.yaw;
  if (!renderer.xr.isPresenting) camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
  setWind(started ? 0.25 + 0.35 * Math.abs(steer.turn) : 0);

  ink.begin();
  for (const k of knots) {
    const target = k.knot.step(dt, 10), p = k.line.pos;
    const d = Math.hypot(target[0] - p[0], target[1] - p[1], target[2] - p[2]);
    k.line.step(dt, target, { speed: 10 * Math.min(2.2, Math.max(0.9, 0.9 + d / 12)), turn: 4, loops: 0.03 });
    const l = k.line.polyline();
    ink.stroke(l.xyz, l.count, TAPER);
  }
  const f = glide.forward();
  mine.forEach((s, j) => {
    const side = (j - 2) * 14, lift = -20 + 5 * Math.sin(t * 0.7 + j); // ahead of you, so you see the lines, not their tails
    const target = [glide.pos[0] + f[0] * 95 - f[2] * side, glide.pos[1] + lift, glide.pos[2] + f[2] * 95 + f[0] * side];
    const d = Math.hypot(target[0] - s.pos[0], target[1] - s.pos[1], target[2] - s.pos[2]);
    s.step(dt, target, { speed: glide.speed * Math.min(1.9, Math.max(0.85, 0.85 + d / 40)), turn: 2.2, loops: 0.25, wander: 0.6 });
    const l = s.polyline();
    ink.stroke(l.xyz, l.count, TAPER);
  });
  ink.end();

  world.shared.uTime.value = t;
  panel.update(dt, headLocal, headQuat);
  renderer.render(scene, camera);
}

// ---------- start / stop ----------

const banner = document.getElementById('banner');
function start() {
  started = true;
  startAudio();
  banner.classList.add('hidden');
  panel.say('Palm Whorl Cities', 4);
  setTimeout(() => panel.say(renderer.xr.isPresenting ? 'Palm down, tilt it to steer' : 'A D turn · W S climb · drag to look', 6), 4200);
}
async function enterHeadset() {
  startAudio();
  const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['hand-tracking'] });
  await renderer.xr.setSession(session);
  headNeutral = null;
  start();
  session.addEventListener('visibilitychange', () => pauseAudio(session.visibilityState === 'hidden'));
  session.addEventListener('end', () => {
    started = false;
    banner.classList.remove('hidden');
  });
}
document.addEventListener('visibilitychange', () => pauseAudio(document.hidden));
const xrButton = document.getElementById('xrButton');
xrButton.addEventListener('click', () => enterHeadset().catch((e) => console.error(e)));
document.getElementById('previewButton').addEventListener('click', start);
navigator.xr?.isSessionSupported('immersive-vr').then((ok) => ok && xrButton.classList.remove('hidden')).catch(() => {});
addEventListener('resize', () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
if (params.has('play')) start();
renderer.setAnimationLoop(frame);

// read-only peek for tests and curious players
window.__pwc = {
  get state() {
    return { hands: hands.length, pos: glide.pos.map(Math.round), yaw: +glide.yaw.toFixed(2), fps: Math.round(fps), scribbles: knots.length + mine.length, started };
  },
};
