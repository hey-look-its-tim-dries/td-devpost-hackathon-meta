import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { headSteer } from './steer.js';
import { JOINTS, palmFrame, OneEuro, createSteer, steerChecks, pointSteer } from './gesture.js';
import { createGestureCard } from './gesturecard.js';
import { createPanel } from './panel.js';
import { createInk } from './ink.js';
import { createGlide } from './glide.js';
import { createCreature } from './creature.js';
import { createScribble, createKnot } from './scribble.js';
import { unpackPrint, unpackPalm } from './hand/dna.js';
import { toHand, toWorld } from './world/founders.js';
import { createWorldScene } from './world/scene.js';
import { createSurface } from './world/surface.js';
import { groundAt as groundAtWorld } from './world/ground.js';
import { loadHorizon } from './world/horizon.js';
import { startWebcamHands } from './webcam-hands.js';
import { NEAR, FAR } from './view.js';
import { handShape } from './hand/shape.js';
import { createAtelierPanel } from './atelier/panel.js';
import { createFlow } from './atelier/flow.js';
import { findFits } from './world/fit.js';
import { createGhosts } from './world/ghosts.js';
import { loadHand, saveHand, forgetHand } from './world/mine.js';
import { createNet, settleLay, API } from './net.js';
import { createOthers } from './others.js';

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

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0); // transparent where nothing is drawn: your room, in passthrough
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

// ---------- the Hands, from the shared map (or the bundled founders), grown in workers ----------

let storage = null; // localStorage, or null when the browser refuses it (your Hand then lasts until you close the page)
try { storage = localStorage; } catch {}
const net = createNet({ api: params.get('api') ?? API, storage }); // ?api=http://localhost:8787 for wrangler dev
let mine = loadHand(storage); // your Hand on this device ({ id, palm, prints, pose, name, pending }), or null
let rising = null; // { id, t } while a laid Hand rises
const hands = []; // every Hand in the world: { id, name, palm, prints, pose, founder, layer, data, rise }
const pendingBake = new Map(); // layer -> Hand, until its worker answers
let online = false, roomLink = null, me = -1, roomState = 'closed'; // roomLink: the live room (frame() has its own `room`, your real room)
const MAX_LAYERS = 64; // surface.js MAX_HANDS
const layerOf = (id) => hands.find((h) => h.id === id)?.layer ?? [...pendingBake].find(([, h]) => h.id === id)?.[0] ?? -1;
const freeLayer = () => { for (let i = 0; i < MAX_LAYERS; i++) if (!hands.some((h) => h.layer === i) && !pendingBake.has(i)) return i; return -1; };
const workers = [0, 1, 2].map(() => new Worker(new URL('./hand/worker.js', import.meta.url), { type: 'module' }));
for (const w of workers) {
  w.onmessage = ({ data }) => {
    const f = pendingBake.get(data.id);
    pendingBake.delete(data.id);
    if (!f) return;
    const rise = rising?.id === f.id ? 0 : 1;
    surface.addHand(data.id, data, f.pose, rise);
    const { texA, info, ...kept } = data; // the textures live in the surface now; the ground keeps heights only
    hands.push({ ...f, layer: data.id, data: kept, rise });
    if (rise === 1) knots.push(...hatch(f)); // a rising Hand hatches when it has risen (below)
  };
  w.onerror = (e) => console.error('hand worker failed', e);
}
const bake = (f) => {
  const layer = freeLayer();
  if (layer < 0) return console.warn('the world is full on this device', f.name);
  pendingBake.set(layer, f);
  workers[layer % workers.length].postMessage({ id: layer, palm: f.palm, prints: f.prints, cell: 0.75 });
};
const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
// a Hand laid by anyone, now: it bakes into a free layer and rises like your own (Review Focus 1)
function applyLaid(h) {
  if (layerOf(h.id) >= 0 || mine?.id === h.id) return;
  if ([mine, laying].some((m) => m && sameBytes(h.palm, m.palm))) return; // our own lay, announced to the room before our answer came back
  rising = { id: h.id, t: 0 }; // ponytail: one rise at a time; a Hand laid during another's rise cuts that one short (it ends fully risen below)
  bake(h);
}
function removeHand(id) {
  const i = hands.findIndex((h) => h.id === id);
  if (i < 0) return;
  surface.setRise(hands[i].layer, 0);
  hands.splice(i, 1);
  for (let k = knots.length - 1; k >= 0; k--) if (knots[k].hand === id) knots.splice(k, 1);
}
// a Hand laid while offline (or before the map existed) is sent when the map can be reached: laid, moved to a fresh
// fit when its place was taken meanwhile, adopted when the map already holds this device's Hand, or still pending
async function retryLay() {
  const { hand, note } = await settleLay(net, mine);
  mine = hand;
  try { saveHand(storage, mine); } catch {}
  if (layerOf(mine.id) < 0) bake(mine);
  if (note === 'moved') panel.say(`Someone laid a Hand where ${mine.name} was: it found a new place`, 7);
  else if (note === 'existing') panel.say(`This device's Hand on the map is ${mine.name}`, 6);
  else if (note === 'pending') panel.say(`${mine.name} is here for now: the shared map will get it later`, 6);
}
net.fetchWorld().then(({ hands: list, online: ok }) => {
  online = ok;
  for (const h of list) if (h.id !== mine?.id) bake(h);
  if (mine) { if (ok && (!mine.id || mine.pending)) retryLay(); else bake(mine); }
  if (ok) roomLink = net.openRoom({ onHello: (id) => (me = id), onSnapshot: (s) => others.apply(s, me, glide.pos), onLaid: applyLaid, onLeft: removeHand, onState: (st) => (roomState = st) });
  else panel.say('Playing alone: the map could not be reached', 6);
});
const others = createOthers({ max: 60 }); // the other players in your room, as lighter creatures

// height of the world at (x, z), for flight clearance (the GPU surface follows the same rule)
const groundAt = (x, z) => groundAtWorld(hands, x, z);

// ---------- scribbles: every Hand's knots over its palm, and your own creature following you ----------

const LINE = { points: 90, spacing: 3 }; // lines about 270 m long, at world scale
const TAPER = (s) => 0.12 + 0.88 * Math.pow(Math.sin(Math.PI * s), 0.6);
// a Hand's five scribbles, one knot per print, hatched above its palm
const hatch = (f) => f.prints.map(unpackPrint).map((p, j) => {
  const [cx, cz] = toWorld(f.pose, 0, 230);
  const knot = createKnot({ cls: p.cls, seed: p.seed, center: [cx, 480 + j * 35, cz], radius: 110 + j * 20, tilt: 0.35 + j * 0.18 }); // above the palms
  return { hand: f.id, knot, line: createScribble({ ...LINE, at: knot.step(0, 0), seed: p.seed }) };
});
const knots = []; // filled as Hands bake
// faster the higher you fly (30 m/s skimming the ridges, 220 m/s high over the wilderness), and diving adds half again
const glide = createGlide({ pos: params.get('at')?.split(',').map(Number) ?? [0, 1100, 15000], turnRate: 0.9, clearance: 25, ceiling: 1500 }); // ?at=x,y,z to start elsewhere
// you: the Whorl, ink strands winding round your own flight path; the camera chases it
const creature = createCreature({ strands: 9, points: 70, spacing: 2, radius: 13 });
const CHASE = { back: 190, up: 40 }; // further back than the creature is long, so all of it is in front of you
const chase = { pos: new THREE.Vector3(glide.pos[0], glide.pos[1] + CHASE.up, glide.pos[2] + CHASE.back), yaw: glide.yaw };
const ink = createInk(MAX_LAYERS * 5 * (LINE.points + 1) + creature.strands * 71 + 60 * 5 * 41, { width: 1.1, color: '#16100e' }); // every Hand's five, you, and up to 60 others
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
renderer.domElement.addEventListener('pointerdown', (e) => {
  const ray = mouseRay(e), uv = mode === 'atelier' ? cardUV() : null;
  if (uv) { drawing = true; return act(atelier.down(uv, flow)); }
  if (mode === 'merge') { const i = ghosts.aim(ray.origin, ray.direction); if (i >= 0) return choose(i); }
  look.drag = true;
});
addEventListener('pointerup', () => {
  look.drag = false;
  if (drawing) { drawing = false; act(atelier.up(flow)); }
});
addEventListener('pointermove', (e) => {
  if (drawing) { mouseRay(e); const uv = cardUV(); if (uv) atelier.move(uv, flow); return; }
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

// ---------- your Hand: read it by eye, lay it into the world, keep it ----------

const atelier = createAtelierPanel();
rig.add(atelier.mesh);
const dim = new THREE.Mesh(new THREE.PlaneGeometry(6, 4.5), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false }));
dim.position.z = -0.01;
dim.renderOrder = 24;
atelier.mesh.add(dim); // behind the card: the world dims while you read your hand (unless you are in your room)
let inRoom = false;
const ghosts = createGhosts((x, z) => groundAt(x, z));
scene.add(ghosts.group);
let mode = 'fly', flow = null, laying = null, drawing = false, poking = null;
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(), tipW = new THREE.Vector3();

function openAtelier() {
  if (mode !== 'fly' || mine) return;
  flow = createFlow(Math.floor(Math.random() * 2 ** 32));
  atelier.open(headLocal, headQuat);
  atelier.paint(flow);
  mode = 'atelier';
}
function act(a) {
  if (!a || mode !== 'atelier') return;
  if (a.type === 'pick') flow.pick(a.cls);
  else if (a.type === 'notSure') flow.notSure();
  else if (a.type === 'traced') flow.traced(a.pts);
  else if (a.type === 'guide') flow.useGuide();
  else if (a.type === 'noLine') flow.noLine();
  else if (a.type === 'typical') flow.typicalLines();
  else if (a.type === 'palette') flow.choosePalette(a.i);
  else if (a.type === 'reroll') flow.reroll();
  else if (a.type === 'lay') return merge();
  atelier.paint(flow);
}
// ponytail: runs on the main thread (~0.25 s, one hitch when you press "Lay my Hand"); a worker when the world is big
function merge() {
  flow.done();
  const dna = flow.dna(), land = hands.map((h) => ({ pose: h.pose, shape: handShape(unpackPalm(h.palm)), name: h.name }));
  const fits = findFits(land, handShape(unpackPalm(dna.palm)));
  atelier.close();
  if (!fits.length) { mode = 'fly'; return panel.say('No room on the coast right now', 5); }
  for (const f of fits) f.names = f.next.map((i) => (i < 0 ? 'the Source' : land[i].name));
  laying = { ...dna, name: flow.name };
  ghosts.show(fits);
  mode = 'merge';
  panel.say('Three places fit your Hand: choose one', 8);
}
async function choose(i) { // a ghost chosen once is picked, chosen again is laid
  if (mode !== 'merge' || i < 0 || laying.busy) return;
  if (i !== ghosts.selected) return ghosts.select(i);
  const fit = ghosts.fits[i];
  laying.busy = true;
  const r = online ? await net.layHand({ ...laying, pose: fit.pose }) : { error: 'offline' };
  laying.busy = false;
  if (r.conflict) { // someone laid a Hand there a moment ago: fresh places, no penalty (spec 6.3)
    if (!r.fits?.length) { ghosts.hide(); mode = 'fly'; return panel.say('No room on the coast right now', 5); }
    ghosts.show(r.fits);
    return panel.say('Someone just laid a Hand there: three new places', 7);
  }
  ghosts.hide();
  if (r.existing) { // this device already has a Hand on the map (it was forgotten here): that one is yours
    const { existing, ...h } = r;
    mine = { ...h, pending: false };
    try { saveHand(storage, mine); } catch {}
    if (layerOf(mine.id) < 0) bake(mine);
    mode = 'fly';
    return panel.say(`This device already has a Hand on the map: ${mine.name}`, 7);
  }
  mine = { ...laying, pose: r.pose ?? fit.pose, id: r.id ?? `local-${Date.now()}`, pending: !r.id };
  delete mine.busy;
  try {
    saveHand(storage, mine);
  } catch (e) {
    console.warn('this browser keeps nothing: your Hand lasts until you close the page', e);
  }
  rising = { id: mine.id, t: 0 };
  mode = 'rise';
  bake(mine);
  panel.say(r.error ? `${mine.name} is laid here for now: the shared map will get it later` : fit.rivers ? `${mine.name} joins the world · ${fit.rivers} river${fit.rivers > 1 ? 's' : ''} join` : `${mine.name} joins the world`, 7);
}
// the ray from the mouse, or from your eyes along your gaze (world space)
function mouseRay(e) {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray;
}
function gazeRay() {
  raycaster.ray.origin.copy(headLocal).applyMatrix4(rig.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyQuaternion(headQuat).applyQuaternion(rig.quaternion);
  return raycaster.ray;
}
const cardUV = () => (atelier.isOpen ? raycaster.intersectObject(atelier.mesh, false)[0]?.uv ?? null : null); // after a ray is set; the card only: the dim backdrop behind it is its child
// headset: your index fingertip pressed against the card is a touch, and dragging it draws
function poke() {
  for (const h of xrHands) {
    if (!h.frame) continue;
    const p = atelier.mesh.worldToLocal(rig.localToWorld(tipW.fromArray(h.store['index-finger-tip'])));
    const on = Math.abs(p.x) < 0.3 && Math.abs(p.y) < 0.225, uv = { x: p.x / 0.6 + 0.5, y: p.y / 0.45 + 0.5 };
    if (!poking && on && p.z < 0.01 && p.z > -0.03) { poking = h; act(atelier.down(uv, flow)); }
    else if (poking === h && (p.z > 0.03 || !on)) { poking = null; act(atelier.up(flow)); }
    else if (poking === h) atelier.move(uv, flow);
  }
}
// a pinch: in the atelier it touches the card where you look; on the way to the merge it chooses the ghost you look at
[0, 1].forEach((i) => renderer.xr.getController(i).addEventListener('select', () => {
  gazeRay();
  if (mode === 'atelier') { const uv = cardUV(); if (uv) { act(atelier.down(uv, flow)); act(atelier.up(flow)); } }
  else if (mode === 'merge') choose(ghosts.aim(raycaster.ray.origin, raycaster.ray.direction));
}));
addEventListener('keydown', (e) => {
  if (mode !== 'merge') return;
  if ('123'.includes(e.key)) choose(+e.key - 1);
  else if (e.key === 'Enter') choose(ghosts.selected);
});
document.getElementById('forget').addEventListener('click', async (e) => {
  e.preventDefault();
  if (mine?.id && !mine.pending && !(await net.washHand(mine.id))) return (e.target.textContent = 'The map could not be reached: try again'); // keep it until the map lets go
  forgetHand(storage);
  location.reload();
});
if (mine) document.getElementById('forget').classList.remove('hidden');

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
  card.update(dt, started && mode !== 'atelier' && (webcam || renderer.xr.isPresenting) ? { checks: best?.c ?? null, progress: best?.q.hold.progress ?? 0, steering: steeringNow, turn: steer.turn, climb: steer.climb } : null);
  if (mode !== 'atelier') glide.update(dt, steer, groundAt); // the world waits while you read your hand
  roomLink?.send({ x: glide.pos[0], y: glide.pos[1], z: glide.pos[2], yaw: glide.yaw, pitch: glide.pitch, mode: ['fly', 'atelier', 'merge', 'rise'].indexOf(mode) }); // at most 5 a second
  creature.update(dt, glide.pos, { speed: glide.speed, pitch: glide.pitch, turn: steer.turn });
  others.update(dt);
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
  others.each((c) => { for (let k = 0; k < c.strands; k++) { const l = c.strand(k), w = c.weight(k); ink.stroke(l.xyz, l.count, (s) => TAPER(s) * 0.7 * w); } }); // other players, a little lighter than you
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
  if (mode === 'atelier' && renderer.xr.isPresenting) poke();
  // reading your hand in your own room: only the card and your hands; the world comes back after
  const room = mode === 'atelier' && inRoom;
  world.sky.visible = !room;
  surface.meshes.forEach((m) => (m.visible = !room));
  ink.mesh.visible = streakInk.mesh.visible = !room;
  dim.visible = !inRoom;
  if (mode === 'merge') ghosts.update(camera.getWorldPosition(tmpChase));
  if (rising) { // a laid Hand rises over 8 s once it has baked; the glider's floor rises with it
    const h = hands.find((q) => q.id === rising.id);
    if (h) {
      rising.t = Math.min(1, rising.t + dt / 8);
      h.rise = rising.t * rising.t * (3 - 2 * rising.t);
      surface.setRise(h.layer, h.rise);
      if (rising.t === 1) { rising = null; if (mode === 'rise') mode = 'fly'; knots.push(...hatch(h)); } // risen: its five scribbles hatch (spec 6.3)
    }
    for (const q of hands) if (q.rise < 1 && q.id !== rising?.id) { q.rise = 1; surface.setRise(q.layer, 1); knots.push(...hatch(q)); } // a rise cut short by a newer lay ends risen
  }
  surface.update(renderer.xr.isPresenting ? rig.localToWorld(camPos.copy(renderer.xr.getCamera().position)) : camera.getWorldPosition(camPos), viewFrustum());
  panel.update(dt, headLocal, headQuat);
  renderer.render(scene, camera);
}

// ---------- start / stop ----------

const banner = document.getElementById('banner');
function start() {
  started = true;
  banner.classList.add('hidden');
  panel.say('Palm Whorl Cities', 4);
  setTimeout(() => (mine ? panel.say(renderer.xr.isPresenting ? 'Raise a hand, point where you want to fly' : 'A D turn · W S climb · drag to look', 6) : openAtelier()), 4200);
}
async function enterHeadset() {
  const kind = (await navigator.xr.isSessionSupported('immersive-ar').catch(() => false)) ? 'immersive-ar' : 'immersive-vr';
  const session = await navigator.xr.requestSession(kind, { optionalFeatures: ['hand-tracking'] });
  await renderer.xr.setSession(session);
  inRoom = session.environmentBlendMode !== undefined && session.environmentBlendMode !== 'opaque'; // your real room shows through
  webcam?.stop(); // the headset tracks your hands now: the laptop camera goes off
  webcam = null;
  headNeutral = null;
  start();
  session.addEventListener('end', () => {
    if (mode === 'atelier') { atelier.close(); flow = null; mode = 'fly'; } // so the next start opens the card at the new head pose
    inRoom = false;
    started = false;
    banner.classList.remove('hidden');
  });
}
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
banner.classList.remove('loading'); // the world is drawing: the buttons may show

// read-only peek for tests and curious players
window.__pwc = {
  get state() {
    return { hands: hands.length, pos: glide.pos.map(Math.round), yaw: +glide.yaw.toFixed(2), fps: Math.round(fps), scribbles: knots.length + creature.strands, started, webcam: webcam ? webcam.update().map((q) => q.handedness) : null, steering: xrHands.some((q) => q.engaged), palm: xrHands.map((q) => q.frame && q.frame.normal.map((v) => +v.toFixed(2))), hand: xrHands.map((q) => q.frame && { point: q.frame.forward.map((v) => +v.toFixed(2)), open: +q.frame.extension.toFixed(2), height: +q.frame.center[1].toFixed(2) }), speed: Math.round(glide.speed), calls: renderer.info.render.calls, xr: renderer.xr.isPresenting, lod: surface.centre.map(Math.round), patches: surface.patches, mode, mine: mine?.name ?? null, online, others: others.count, pending: !!mine?.pending, room: roomState };
  },
  atelier: { act: (a) => act(a), get flow() { return flow; }, choose: (i) => choose(i) },
  net,
};
