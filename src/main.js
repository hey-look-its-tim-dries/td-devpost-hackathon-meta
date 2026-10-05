import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { headSteer } from './steer.js';
import { startAudio, pauseAudio, setWind } from './audio.js';
import { JOINTS, palmFrame, OneEuro, createSteer, steerChecks, pointSteer } from './gesture.js';
import { createGestureCard } from './gesturecard.js';
import { createPanel } from './panel.js';
import { createInk } from './ink.js';
import { createGlide } from './glide.js';
import { createCreature } from './creature.js';
import { createScribble, createKnot } from './scribble.js';
import { unpackPrint } from './hand/dna.js';
import { founders, toHand, toWorld } from './world/founders.js';
import { createWorldScene } from './world/scene.js';
import { createSurface } from './world/surface.js';
import { groundAt as groundAtWorld } from './world/ground.js';
import { loadHorizon } from './world/horizon.js';
import { startWebcamHands } from './webcam-hands.js';
import { NEAR, FAR } from './view.js';

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
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, NEAR, FAR);
rig.add(camera);
const world = createWorldScene();
const surface = createSurface(world.shared); // the Hands and the endless wilderness, one level-of-detail terrain
surface.meshes.forEach((m) => scene.add(m));
// ?horizon=<url of a .spz>: an AI-generated splat world as a distant backdrop (a test)
if (params.get('horizon')) loadHorizon(scene, renderer, params.get('horizon'), { scale: +(params.get('horizonScale') ?? 500) });
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
    surface.addHand(data.id, data, f.pose);
    hands.push({ ...f, data });
  };
  w.onerror = (e) => console.error('hand worker failed', e);
}
FOUNDERS.forEach((f, id) => workers[id % workers.length].postMessage({ id, palm: f.palm, prints: f.prints, cell: 0.75 }));

// height of the world at (x, z), for flight clearance (the GPU surface follows the same rule)
const groundAt = (x, z) => groundAtWorld(hands, x, z);

// ---------- scribbles: founders' knots over their palms, and your own five following you ----------

const LINE = { points: 90, spacing: 3 }; // lines about 270 m long, at world scale
const TAPER = (s) => 0.12 + 0.88 * Math.pow(Math.sin(Math.PI * s), 0.6);
const knots = FOUNDERS.flatMap((f) => f.prints.map(unpackPrint).map((p, j) => {
  const [cx, cz] = toWorld(f.pose, 0, 230);
  const knot = createKnot({ cls: p.cls, seed: p.seed, center: [cx, 480 + j * 35, cz], radius: 110 + j * 20, tilt: 0.35 + j * 0.18 }); // above the palms
  return { knot, line: createScribble({ ...LINE, at: knot.step(0, 0), seed: p.seed }) };
}));
// faster the higher you fly (30 m/s skimming the ridges, 220 m/s high over the wilderness), and diving adds half again
const glide = createGlide({ pos: params.get('at')?.split(',').map(Number) ?? [0, 1100, 15000], turnRate: 0.9, clearance: 25, ceiling: 1500 }); // ?at=x,y,z to start elsewhere
// you: the Whorl, ink strands winding round your own flight path; the camera chases it
const creature = createCreature({ strands: 9, points: 70, spacing: 2, radius: 13 });
const CHASE = { back: 190, up: 40 }; // further back than the creature is long, so all of it is in front of you
const chase = { pos: new THREE.Vector3(glide.pos[0], glide.pos[1] + CHASE.up, glide.pos[2] + CHASE.back), yaw: glide.yaw };
const ink = createInk((knots.length * (LINE.points + 1)) + creature.strands * 71, { width: 1.1, color: '#16100e' });
// speed lines: ink streaks hanging in the air that rush past when you are fast
const streaks = Array.from({ length: 60 }, () => new THREE.Vector3(Infinity, 0, 0));
const streakInk = createInk(streaks.length, { width: 0.5, color: '#16100e' });
scene.add(streakInk.mesh);
scene.add(ink.mesh);

// ---------- hands and head (read live for steering, never kept) ----------

const handFactory = new XRHandModelFactory();
const xrHands = [0, 1].map((i) => {
  const hand = renderer.xr.getHand(i);
  hand.add(handFactory.createHandModel(hand, 'mesh'));
  rig.add(hand);
  const h = { hand, handedness: i ? 'right' : 'left', frame: null, hold: createSteer(), engaged: false, store: Object.fromEntries(JOINTS.map((n) => [n, [0, 0, 0]])) };
  hand.addEventListener('connected', (e) => { h.handedness = e.data.handedness || h.handedness; });
  return h;
});
// ?webcam or the banner button: your laptop camera stands in for headset hand tracking
let webcam = null;
const card = createGestureCard(); // what your hand is commanding, fixed at the bottom of your view
camera.add(card.mesh);
xrHands.forEach((h) => (h.smooth = new OneEuro({ minCutoff: 1.5, beta: 0.5 })));
async function useWebcam() {
  if (webcam) return;
  try {
    webcam = await startWebcamHands();
    panel.say('Raise a hand and point where you want to fly', 6);
  } catch (e) {
    console.error('webcam hands unavailable', e);
    panel.say('No webcam: steer with A D and W S', 5);
  }
}
// hands lower than this don't steer (a hand resting on your lap): 60 cm below your eyes, in the
// frame the joints are in (the rig for headset hands, your eyes for webcam hands)
const handFloor = () => (!renderer.xr.isPresenting && webcam ? -0.6 : headLocal.y - 0.6);
function readHands(dt) {
  const cams = !renderer.xr.isPresenting && webcam ? webcam.update() : null;
  for (const h of xrHands) {
    let ok = false;
    if (cams) {
      const c = cams.find((q) => q.handedness === h.handedness);
      if (c) {
        // the laptop camera stays put when you look around, so gestures read the joints in your eye
        // frame, smoothed (a webcam is noisier than a headset)
        const flat = h.smooth.filter(JOINTS.flatMap((n) => c.joints[n]), dt);
        JOINTS.forEach((n, k) => { h.store[n][0] = flat[k * 3]; h.store[n][1] = flat[k * 3 + 1]; h.store[n][2] = flat[k * 3 + 2]; });
        ok = true;
      } else h.smooth.reset();
    } else {
      const j = h.hand.joints;
      ok = renderer.xr.isPresenting && j && j.wrist && j.wrist.visible && JOINTS.every((n) => j[n]);
      if (ok) for (const n of JOINTS) j[n].position.toArray(h.store[n]);
    }
    h.frame = ok ? palmFrame(h.store, h.handedness) : null;
    h.engaged = h.hold.update(h.frame, handFloor(), dt) && !!h.frame; // a raised open hand, held a moment
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
const look = { yaw: 0, pitch: +(params.get('pitch') ?? -0.22), drag: false }; // ?pitch= for screenshots
renderer.domElement.addEventListener('pointerdown', () => (look.drag = true));
addEventListener('pointerup', () => (look.drag = false));
addEventListener('pointermove', (e) => {
  if (!look.drag) return;
  look.yaw -= e.movementX * 0.003;
  look.pitch = Math.max(-1.3, Math.min(0.6, look.pitch - e.movementY * 0.003));
});
let started = false;
function steering() {
  // the title screen is the world, drifting; ?auto=dive dives, for screenshots
  if (AUTO || !started) return { turn: 0.12, climb: params.get('auto') === 'dive' ? -0.8 : 0 };
  if (renderer.xr.isPresenting || webcam) {
    const h = xrHands.find((q) => q.engaged); // your fingers are the arrow
    if (h) return pointSteer(h.frame.forward);
    if (renderer.xr.isPresenting) {
      headNeutral ||= headQuat.toArray();
      return { turn: 0.6 * headSteer(headNeutral, headQuat.toArray()), climb: 0 };
    }
  }
  const k = (a, b) => (keys.has(a) || keys.has(b) ? 1 : 0);
  return { turn: k('d', 'arrowright') - k('a', 'arrowleft'), climb: k('w', 'arrowup') - k('s', 'arrowdown') };
}

// ---------- the loop ----------

const clock = new THREE.Clock();
let t = 0, fps = 60;
const tmpChase = new THREE.Vector3();
const camPos = new THREE.Vector3();
// what you can see, for skipping terrain patches outside it (in the headset: both eyes, in the rig)
const frustum = new THREE.Frustum(), viewM = new THREE.Matrix4(), projView = new THREE.Matrix4();
function viewFrustum() {
  if (renderer.xr.isPresenting) {
    const c = renderer.xr.getCamera();
    viewM.multiplyMatrices(rig.matrixWorld, c.matrix).invert();
    return frustum.setFromProjectionMatrix(projView.multiplyMatrices(c.projectionMatrix, viewM));
  }
  camera.updateMatrixWorld();
  return frustum.setFromProjectionMatrix(projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
}
const steer = { turn: 0, climb: 0 }; // eased, so a jittery hand still flies smoothly
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  t += dt;
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
  readHead();
  readHands(dt);
  const want = steering(), ease = 1 - Math.exp(-dt * 6);
  steer.turn += (want.turn - steer.turn) * ease;
  steer.climb += (want.climb - steer.climb) * ease;
  // the gesture card shows the hand that steers, or else the one closest to the steering gesture;
  const seen = xrHands.filter((q) => q.frame).map((q) => ({ q, c: steerChecks(q.frame, handFloor()) }));
  const best = seen.find((x) => x.q.engaged) ?? seen.sort((a, b) => ['open', 'raised'].filter((k) => b.c[k].ok).length - ['open', 'raised'].filter((k) => a.c[k].ok).length)[0];
  const steeringNow = !!best?.q.engaged;
  // shown while hands can steer (webcam or headset), even before a hand is seen
  card.update(dt, started && (webcam || renderer.xr.isPresenting) ? { checks: best?.c ?? null, progress: best?.q.hold.progress ?? 0, steering: steeringNow, turn: steer.turn, climb: steer.climb } : null);
  glide.update(dt, steer, groundAt);
  creature.update(dt, glide.pos, { speed: glide.speed, pitch: glide.pitch, turn: steer.turn });
  // the camera chases the creature: behind and above it, easing after its turns (never rolling)
  const f = glide.forward(), follow = 1 - Math.exp(-dt * 3);
  const cx = glide.pos[0] - f[0] * CHASE.back, cz = glide.pos[2] - f[2] * CHASE.back;
  chase.pos.lerp(tmpChase.set(cx, Math.max(glide.pos[1] + CHASE.up, groundAt(cx, cz) + 20), cz), follow);
  chase.yaw += Math.atan2(Math.sin(glide.yaw - chase.yaw), Math.cos(glide.yaw - chase.yaw)) * follow;
  rig.position.copy(chase.pos);
  rig.rotation.y = chase.yaw;
  if (!renderer.xr.isPresenting) {
    camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
    // on a screen the view widens a little with speed, so you feel it (never in the headset: comfort)
    const fov = 65 + 14 * Math.min(1, Math.max(0, (glide.speed - 70) / 230));
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 2));
      camera.updateProjectionMatrix();
    }
  }
  setWind(started ? Math.min(1, 0.15 + glide.speed / 320) : 0); // the wind rises with speed

  ink.begin();
  for (const k of knots) {
    const target = k.knot.step(dt, 45), p = k.line.pos;
    const d = Math.hypot(target[0] - p[0], target[1] - p[1], target[2] - p[2]);
    k.line.step(dt, target, { speed: 45 * Math.min(2.2, Math.max(0.9, 0.9 + d / 50)), turn: 4, loops: 0.03 });
    const l = k.line.polyline();
    ink.stroke(l.xyz, l.count, TAPER);
  }
  for (let k = 0; k < creature.strands; k++) {
    const l = creature.strand(k), w = creature.weight(k);
    ink.stroke(l.xyz, l.count, (s) => TAPER(s) * w); // a few bold strands, many fine ones
  }
  ink.end();
  // speed lines: streaks fixed in the air round you, drawn along your motion, longer the faster you go
  const fast = Math.max(0, Math.min(1, (glide.speed - 90) / 180)), vel = tmpChase.set(f[0] * Math.cos(glide.pitch), Math.sin(glide.pitch), f[2] * Math.cos(glide.pitch)).multiplyScalar(glide.speed);
  streakInk.begin();
  for (const p of streaks) {
    const rel = p.clone().sub(chase.pos);
    if (!Number.isFinite(p.x) || rel.dot(vel) < -40 * glide.speed || rel.length() > 900) { // behind you or lost: put it ahead again
      const a = Math.random() * Math.PI * 2, r = 25 + Math.random() * 90, ahead = 150 + Math.random() * 600;
      p.set(chase.pos.x + f[0] * ahead + Math.cos(a) * r * f[2], chase.pos.y + Math.sin(a) * r * 0.6 - 20, chase.pos.z + f[2] * ahead - Math.cos(a) * r * f[0]);
    }
    if (fast > 0) streakInk.segment(p, p.clone().addScaledVector(vel, -0.06 * fast), fast, 0);
  }
  streakInk.end();

  world.shared.uTime.value = t;
  // the terrain's detail centres on your eyes; the headset camera's pose is in the rig's space
  rig.updateMatrixWorld();
  surface.update(renderer.xr.isPresenting ? rig.localToWorld(camPos.copy(renderer.xr.getCamera().position)) : camera.getWorldPosition(camPos), viewFrustum());
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
  setTimeout(() => panel.say(renderer.xr.isPresenting ? 'Raise a hand, point where you want to fly' : 'A D turn · W S climb · drag to look', 6), 4200);
}
async function enterHeadset() {
  startAudio();
  const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['hand-tracking'] });
  await renderer.xr.setSession(session);
  webcam?.stop(); // the headset tracks your hands now: the laptop camera goes off
  webcam = null;
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
document.getElementById('webcamButton').addEventListener('click', () => { start(); useWebcam(); });
navigator.xr?.isSessionSupported('immersive-vr').then((ok) => ok && xrButton.classList.remove('hidden')).catch(() => {});
addEventListener('resize', () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
if (params.has('play')) start();
if (params.has('webcam')) { start(); useWebcam(); }
renderer.setAnimationLoop(frame);

// read-only peek for tests and curious players
window.__pwc = {
  get state() {
    return { hands: hands.length, pos: glide.pos.map(Math.round), yaw: +glide.yaw.toFixed(2), fps: Math.round(fps), scribbles: knots.length + creature.strands, started, webcam: webcam ? webcam.update().map((q) => q.handedness) : null, steering: xrHands.some((q) => q.engaged), palm: xrHands.map((q) => q.frame && q.frame.normal.map((v) => +v.toFixed(2))), hand: xrHands.map((q) => q.frame && { point: q.frame.forward.map((v) => +v.toFixed(2)), open: +q.frame.extension.toFixed(2), height: +q.frame.center[1].toFixed(2) }), speed: Math.round(glide.speed), calls: renderer.info.render.calls, xr: renderer.xr.isPresenting, lod: surface.centre.map(Math.round), patches: surface.patches };
  },
};
