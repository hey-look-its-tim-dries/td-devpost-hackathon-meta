import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { headSteer } from './steer.js';
import { extent, isTable, landSpot } from './room.js';
import { startAudio, pauseAudio, setWind, setSand, tone, chirp, swell } from './audio.js';
import { createTerrain, LAND } from './terrain.js';
import { createWalker, nearby, route, houseSpot } from './walk.js';
import { createFlock, wingShape } from './birds.js';
import { createCity } from './city.js';
import { createChooser, PLATES } from './chooser.js';
import { createFlight, SHRINK } from './flight.js';
import { SKIN } from './desert.js';
import { createHandGuide } from './guide.js';
import { createPanel } from './panel.js';
import { createInk } from './ink.js';
import { SPOTS, neighbours, loadSave, storeSave } from './atlas.js';
import { JOINTS, palmFrame, createPalmDown, createTouch, palmTilt, createShadowBird, OneEuro } from './gesture.js';

// Palm Whorl Cities. You read your own fingertip, a land grows on your table in that pattern, you
// walk its white paths with your finger, its ridges peel off as wire birds, and you fly out as a bird
// yourself to other people's lands.

const params = new URLSearchParams(location.search);
const AUTO = params.has('auto'); // autopilot for demos and headless tests
const FILM = params.has('film'); // with ?emulate: a director plays the emulated head and hands (director.js)
const STEP = params.has('step'); // frame by frame, for capturing the film: the page waits for each frame
const film = { budget: 0, t: 0, done: false };
const newSeed = () => +(params.get('seed') ?? Math.floor(Math.random() * 1e9));

// ?emulate: a Meta Quest 3 in a desktop browser (IWER, Meta's WebXR emulator), a scanned room so
// plane detection finds a real table, and the emulator's dev UI
if (params.has('emulate')) {
  const { XRDevice, metaQuest3, metaVRGlasses } = await import('https://esm.sh/iwer@2.5.0');
  // &device=glasses: the Meta VR Glasses profile (narrower view) to check nothing essential is cut off
  const device = new XRDevice(params.get('device') === 'glasses' ? metaVRGlasses : metaQuest3);
  device.installRuntime({ forceInstall: true });
  window.__device = device;
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

// ---------- renderer, rig (you), anchor (the table) ----------

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local'); // seated: the origin is where your head starts
renderer.xr.setFoveation(1);
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xfff1e6, 0x6b4a3a, 2.2));
const lamp = new THREE.DirectionalLight(0xffe2c4, 1.6);
lamp.position.set(-1, 2, 0.5);
scene.add(lamp);

// The rig is you: camera, hands and controllers. Flying shrinks it (see flight.js).
const rig = new THREE.Group();
scene.add(rig);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.02, 2000);
rig.add(camera);

// The anchor is the spot on your table where the land lies, turned to face you.
const anchor = new THREE.Group();
scene.add(anchor);
const worldRoot = new THREE.Group(); // lands and the desert; moves when you land somewhere new
anchor.add(worldRoot);

// A plain room for the browser preview and for headsets without passthrough.
const room = new THREE.Group();
{
  const wood = new THREE.MeshStandardMaterial({ color: '#5d3f2c', roughness: 0.75 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 0.85), wood);
  top.position.set(0, 0.73, 0.05);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#2b211c' }));
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 3), new THREE.MeshStandardMaterial({ color: '#3a2c25' }));
  wall.position.set(0, 1.5, -1.6);
  room.add(top, floor, wall);
}
scene.add(room);

// ---------- the pieces ----------

const home = { id: 'home', terrain: createTerrain({ size: 256 }), land: null, cls: null, seed: 0, woken: new Set() };
home.city = createCity(home.terrain);
worldRoot.add(home.terrain.mesh);
scene.add(home.city.mesh);
let lands = [home];
let current = home;

const flock = createFlock();
scene.add(flock.mesh);
const rings = createInk(600, { width: 0.0025, color: '#16100e' });
scene.add(rings.mesh);
const flight = createFlight({ rig, worldRoot });
const guide = createHandGuide();
guide.mesh.visible = false;
anchor.add(guide.mesh);
const panel = createPanel();
rig.add(panel.mesh);
const chooser = createChooser();
rig.add(chooser.group);

// ---------- the land grower (a worker, so the headset never drops a frame) ----------

const worker = new Worker(new URL('./print/worker.js', import.meta.url), { type: 'module' });
const jobs = new Map();
let jobId = 0;
worker.onmessage = ({ data }) => {
  const job = jobs.get(data.id);
  if (!job) return;
  if (data.type === 'progress') job.progress?.(data.ridge);
  else if (data.type === 'done') {
    jobs.delete(data.id);
    job.resolve(data.land);
  }
};
worker.onerror = (e) => console.error('land worker failed', e);
function growLand(cls, seed, size, progress = null) {
  return new Promise((resolve) => {
    const id = ++jobId;
    jobs.set(id, { resolve, progress });
    worker.postMessage({ id, cls, seed, size, ridges: 22 });
  });
}

// the six plates show real grown prints, one fixed seed per class
PLATES.forEach(([cls], i) => growLand(cls, 101 + i * 37, 96).then((l) => chooser.thumb(cls, l.ridge, l.mask, 96)));

// ---------- memory ----------

const save = (!params.has('fresh') && loadSave()) || { v: 1, fingers: {}, birds: [], visited: [] };
save.cities ||= {};
const remember = () => {
  save.birds = flock.birds.map(flock.memory);
  storeSave(save);
};

// ---------- hands ----------

const handFactory = new XRHandModelFactory();
const hands = [0, 1].map((i) => {
  const hand = renderer.xr.getHand(i);
  hand.add(handFactory.createHandModel(hand, 'mesh'));
  rig.add(hand);
  const ctrl = renderer.xr.getController(i);
  rig.add(ctrl);
  const h = {
    hand, ctrl, handedness: i ? 'right' : 'left', joints: null, frame: null, seen: 0,
    palmDown: createPalmDown({ minHeight: 0.14 }), touch: createTouch(), state: 'none',
    tip: new THREE.Vector3(), tipFilter: new OneEuro({ minCutoff: 1.2, beta: 0.35 }), still: 0, last: new THREE.Vector3(),
  };
  hand.addEventListener('connected', (e) => { h.handedness = e.data.handedness || h.handedness; });
  ctrl.addEventListener('connected', (e) => { h.controller = !e.data.hand; });
  ctrl.addEventListener('disconnected', () => { h.controller = false; });
  ctrl.addEventListener('selectstart', () => (h.pressing = true));
  ctrl.addEventListener('selectend', () => (h.pressing = false));
  hand.addEventListener('disconnected', () => { h.joints = h.frame = null; });
  ctrl.addEventListener('selectstart', () => onSelect(h));
  ctrl.addEventListener('squeezestart', () => mode === 'walk' && takeOff(null));
  return h;
});
const shadowBird = createShadowBird();
const jointStore = hands.map(() => Object.fromEntries(JOINTS.map((n) => [n, [0, 0, 0]])));

// hand joints in rig space (what the hand really did), the fingertip also in world space
function readHands(dt) {
  hands.forEach((h, i) => {
    const j = h.hand.joints;
    const ok = renderer.xr.isPresenting && j && j.wrist && j.wrist.visible && JOINTS.every((n) => j[n]);
    if (!ok) { h.joints = h.frame = null; h.seen = 0; return; }
    const store = jointStore[i];
    for (const n of JOINTS) j[n].position.toArray(store[n]);
    h.joints = store;
    h.frame = palmFrame(store, h.handedness);
    h.seen += dt;
    const tip = h.tipFilter.filter(store['index-finger-tip'], dt);
    rig.localToWorld(h.tip.set(tip[0], tip[1], tip[2]));
  });
}

// ---------- head ----------

const headLocal = new THREE.Vector3(), headQuat = new THREE.Quaternion(), headWorld = new THREE.Vector3();
function readHead() {
  const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  headLocal.copy(cam.position);
  headQuat.copy(cam.quaternion);
  rig.localToWorld(headWorld.copy(headLocal));
}

// ---------- desktop pointer and keys ----------

const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2(-9, -9);
const pointer = { down: false, point: new THREE.Vector3(), onTable: false };
const tablePlane = new THREE.Plane();
const keys = new Set();
renderer.domElement.addEventListener('pointermove', (e) => ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1));
renderer.domElement.addEventListener('pointerdown', (e) => {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  pointer.down = true;
  onClick();
});
addEventListener('pointerup', () => (pointer.down = false));
addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());
  if (e.key.toLowerCase() === 'f' && mode === 'walk') takeOff(null);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('resize', () => {
  if (renderer.xr.isPresenting) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function aimPointer() {
  raycaster.setFromCamera(ndc, camera);
  tablePlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), anchor.getWorldPosition(new THREE.Vector3()));
  pointer.onTable = !!raycaster.ray.intersectPlane(tablePlane, pointer.point);
}

// ---------- the story, one mode at a time ----------

// title → hand (lay your hand on the outline) → choose (which pattern is yours?) → press
// (fingertip on the table) → grow → walk ⇄ fly
let mode = 'title', modeT = 0, walker = null, woken = home.woken, pickedCls = null, passthrough = false;
let tookOffWith = null, steerRef = null, headNeutral = null, autoRoute = [], autoTarget = null, landingGoal = null;
const setMode = (m) => { mode = m; modeT = 0; };

function start() {
  startAudio();
  document.getElementById('banner').classList.add('hidden');
  room.visible = !passthrough;
  scene.background = passthrough ? null : new THREE.Color('#231a16');
  guide.mesh.visible = true;
  guide.filled = 0;
  setMode('hand');
}

function acceptTable() {
  if (mode !== 'hand') return;
  setMode('wait');
  guide.filled = 1;
  tone(4, 0, 0.1);
  setTimeout(() => {
    guide.mesh.visible = false;
    const saved = save.fingers.index;
    const forced = params.get('cls');
    if (forced || (saved && !params.has('fresh'))) {
      pickedCls = forced || saved.cls;
      const seed = +(params.get('seed') ?? (forced ? Math.floor(Math.random() * 1e9) : saved.seed));
      if (!forced) panel.say('Welcome back', 3);
      beginGrowth(128, 200, pickedCls, seed, forced ? 0.16 : 0.5);
    } else {
      chooser.show(headLocal, headQuat);
      panel.say('Which one is yours?', 1e9);
      setMode('choose');
    }
  }, 700);
}

function pickClass(cls) {
  pickedCls = cls;
  chooser.hide();
  tone(7, 0, 0.12);
  panel.say('Press that fingertip here', 1e9);
  setMode('press');
}

function beginGrowth(px, py, cls, seed, speed = 0.16) {
  panel.hide();
  home.cls = cls;
  home.seed = seed;
  home.terrain.begin(px, py, speed);
  swell(speed > 0.3 ? 3 : 8);
  setMode('grow');
  growLand(cls, seed, 256, (ridge) => home.terrain.grow(ridge)).then((land) => {
    home.land = land;
    home.terrain.set(land);
    const same = save.fingers.index?.cls === cls && save.fingers.index?.seed === seed;
    home.city.load(same ? save.cities.home : []);
    save.fingers.index = { cls, seed };
    if (!flock.birds.length) for (const b of save.birds) flock.revive(b, anchor.getWorldPosition(new THREE.Vector3()));
    remember();
    growNeighbours();
  });
}

function growNeighbours() {
  neighbours({ cls: home.cls, seed: home.seed }).forEach((l, k) => {
    const t = createTerrain({ size: 192, ink: l.ink, sand: SKIN[l.tone ?? 1] }); // every land is someone's skin
    t.mesh.position.set(SPOTS[k][0], 0, SPOTS[k][1]);
    t.mesh.visible = false;
    worldRoot.add(t.mesh);
    const land = { id: l.id, terrain: t, land: null, cls: l.cls, seed: l.seed, woken: new Set(), city: createCity(t) };
    scene.add(land.city.mesh);
    land.city.load(save.cities[l.id]);
    lands.push(land);
    growLand(l.cls, l.seed, 192).then((r) => {
      land.land = r;
      t.set(r, { instant: true });
    });
  });
}

// a ridge at landmark i of the current land lifts off and becomes a bird
function wake(i) {
  const m = current.land.landmarks[i];
  current.woken.add(i);
  const ridge = (m.ridge.length > 1 ? m.ridge : [[m.x - 6, m.y], [m.x + 6, m.y]]).map(([x, y]) => current.terrain.worldOf(x, y));
  const bird = flock.add({ ridge, origin: current.id, rare: current !== home || m.kind === 'delta' || m.kind === 'core' });
  current.terrain.carve(m.ridge);
  chirp(bird.song, 0);
  remember();
  if (current.woken.size === 3) setTimeout(() => mode === 'walk' && panel.say('Lift your hand, palm down', 6), 2500);
}

function takeOff(h) {
  if (mode !== 'walk' || !current.land) return;
  const ground = new THREE.Vector3();
  const at = h?.frame ? rig.localToWorld(new THREE.Vector3(...h.frame.center)) : null;
  const px = at ? current.terrain.pixelOf(at) : null;
  const inside = px && px[0] > 0 && px[1] > 0 && px[0] < current.terrain.size && px[1] < current.terrain.size;
  current.terrain.worldOf(inside ? px[0] : current.terrain.size / 2, inside ? px[1] : current.terrain.size * 0.7, ground);
  tookOffWith = h;
  avatar = null;
  steerRef = h?.frame ? JSON.parse(JSON.stringify(h.frame)) : null; // the pose you took off in
  headNeutral = headQuat.toArray();
  walker?.lift();
  setSand(0);
  panel.hide();
  flight.takeOff(headWorld, ground);
  tone(9, 0, 0.12);
  setMode('fly');
}

function steering(dt) {
  if (AUTO || FILM) return autoSteer();
  if (!renderer.xr.isPresenting) {
    const turn = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0);
    const climb = (keys.has('arrowup') || keys.has('w') ? 1 : 0) - (keys.has('arrowdown') || keys.has('s') ? 1 : 0);
    return { turn: turn || (pointer.down ? THREE.MathUtils.clamp(ndc.x * 1.4, -1, 1) : 0), climb };
  }
  const h = tookOffWith?.frame ? tookOffWith : hands.find((q) => q.frame);
  if (h?.frame && steerRef) {
    const { roll, pitch } = palmTilt(h.frame, steerRef);
    return { turn: THREE.MathUtils.clamp(roll / 0.45, -1, 1), climb: THREE.MathUtils.clamp(pitch / 0.45, -1, 1) };
  }
  // no hand in view: the head steers (turn or tilt it), as in Upwards
  return { turn: headSteer(headNeutral, headQuat.toArray()), climb: 0 };
}

// every land but the one you took off from gets a ring over its summit: fly into it to land there
const ringAt = (l) => {
  const c = l.land?.cores?.[0] ?? [l.terrain.size / 2, l.terrain.size / 2];
  return l.terrain.worldOf(c[0], c[1], new THREE.Vector3(), 0.03);
};
function autoSteer() {
  const goal = lands.filter((l) => l !== current && l.land).map(ringAt)[0];
  if (!goal) return { turn: 0, climb: 0 };
  const fwd = flight.forward(new THREE.Vector3());
  const to = goal.clone().sub(flight.head).setY(0).normalize();
  const cross = fwd.x * to.z - fwd.z * to.x;
  return { turn: THREE.MathUtils.clamp(cross * 3, -1, 1), climb: 0 };
}

function groundAt(p) {
  let y = anchor.getWorldPosition(new THREE.Vector3()).y - 0.003;
  for (const l of lands) {
    if (!l.land || !l.terrain.mesh.visible) continue;
    const [px, py] = l.terrain.pixelOf(p);
    if (px < 0 || py < 0 || px >= l.terrain.size || py >= l.terrain.size) continue;
    y = Math.max(y, l.terrain.worldOf(px, py, new THREE.Vector3()).y);
  }
  return y;
}

function landOn(target) {
  // re-root: move the world so the target land sits on your table, and move you and the birds with
  // it, so nothing you see changes; then grow back to your real size over it
  const before = target.terrain.mesh.getWorldPosition(new THREE.Vector3());
  worldRoot.position.copy(target.terrain.mesh.position).negate();
  worldRoot.updateMatrixWorld(true);
  const delta = target.terrain.mesh.getWorldPosition(new THREE.Vector3()).sub(before);
  flight.shift(delta);
  flock.shift(delta);
  current = target;
  landingGoal = target;
  flight.land();
  save.visited = [...new Set([...save.visited, target.id])];
  remember();
}

// pinch or trigger: a universal "yes" in every step, for anyone who cannot do the gesture
function onSelect(h) {
  startAudio();
  if (mode === 'hand') acceptTable();
  else if (mode === 'choose') {
    const gaze = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuat);
    raycaster.set(headWorld, gaze);
    const cls = chooser.pickRay(raycaster) || chooser.nearest(headWorld, gaze);
    if (cls) pickClass(cls);
  } else if (mode === 'press') {
    const px = h?.tip ? current.terrain.pixelOf(h.tip) : null;
    const inside = px && px[0] > 8 && px[1] > 8 && px[0] < 248 && px[1] < 248;
    beginGrowth(inside ? px[0] : 128, inside ? px[1] : 190, pickedCls, newSeed());
  }
}

function onClick() {
  if (renderer.xr.isPresenting) return;
  startAudio();
  aimPointer();
  if (mode === 'hand') acceptTable();
  else if (mode === 'choose') {
    const cls = chooser.pickRay(raycaster);
    if (cls) pickClass(cls);
  } else if (mode === 'press' && pointer.onTable) {
    const [px, py] = current.terrain.pixelOf(pointer.point);
    beginGrowth(THREE.MathUtils.clamp(px, 8, 248), THREE.MathUtils.clamp(py, 8, 248), pickedCls, newSeed());
  }
}

// ---------- the table: a detected plane, then your flat hand refines it ----------

let tableLocked = false;
function findTable(xrFrame) {
  const planes = xrFrame?.detectedPlanes, ref = renderer.xr.getReferenceSpace();
  if (!planes || !ref) return null;
  let best = null;
  for (const plane of planes) {
    const pose = xrFrame.getPose(plane.planeSpace, ref);
    if (!pose) continue;
    const m = new THREE.Matrix4().fromArray(pose.transform.matrix);
    const at = new THREE.Vector3().setFromMatrixPosition(m);
    if (!isTable(plane.semanticLabel, plane.orientation, headLocal.y - at.y)) continue;
    const inv = m.clone().invert();
    const h = headLocal.clone().applyMatrix4(inv);
    const spot = landSpot(extent(plane.polygon), [h.x, h.z], LAND);
    const world = new THREE.Vector3(spot.x, 0, spot.z).applyMatrix4(m);
    const d = Math.hypot(world.x - headLocal.x, world.z - headLocal.z);
    if (d < 1.2 && (!best || d < best.d)) best = { world, size: spot.size, d };
  }
  return best;
}

function placeAnchor(point, size = LAND) {
  const dir = point.clone().sub(headWorld).setY(0);
  anchor.position.copy(point);
  if (dir.lengthSq() > 1e-4) anchor.rotation.set(0, Math.atan2(-dir.x, -dir.z), 0);
  anchor.scale.setScalar(Math.max(0.55, size / LAND));
}

function defaultAnchor() {
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(headQuat).setY(0).normalize();
  placeAnchor(headWorld.clone().addScaledVector(fwd, 0.42).add(new THREE.Vector3(0, -0.48, 0)));
}

// ---------- the loop ----------

const clock = new THREE.Clock();
const tmpV = new THREE.Vector3(), anchorWorld = new THREE.Vector3(), headVel = new THREE.Vector3(), lastHead = new THREE.Vector3();
let lastLevel = -1;

function frame(time, xrFrame) {
  let dt = Math.min(clock.getDelta(), 0.05);
  if (STEP) {
    // capturing: only move on when the recorder asks for the next frame, always by 1/30 s
    if (film.budget <= 0) return renderer.render(scene, camera);
    film.budget--;
    dt = 1 / 30;
  }
  film.t += dt;
  const t = film.t;
  modeT += dt;
  readHead();
  readHands(dt);
  if (director && renderer.xr.isPresenting) director.update(dt); // its moves land next frame
  if (!renderer.xr.isPresenting) aimPointer();

  // the table
  if (mode === 'hand' && renderer.xr.isPresenting && !tableLocked) {
    const found = findTable(xrFrame);
    if (found) placeAnchor(found.world, found.size);
    else if (modeT < 0.2) defaultAnchor();
    // your flat hand on the outline settles the height and the spot exactly (used live, never kept)
    for (const h of hands) {
      if (!h.frame || h.frame.normal[1] > -0.8 || h.frame.extension < 0.7) { h.still = 0; continue; }
      const c = rig.localToWorld(tmpV.set(...h.frame.center));
      // on the detected table, or at least at desk height below your head: never a hand in mid-air
      const near = found ? Math.abs(c.y - anchor.position.y) < 0.07 : c.y < headWorld.y - 0.3;
      h.still = near && c.distanceTo(h.last) < 0.004 + 0.03 * dt ? h.still + dt : 0; // under ~3 cm/s
      h.last.copy(c);
      guide.filled = Math.min(1, h.still);
      if (h.still > 1) {
        tableLocked = true;
        placeAnchor(c.clone().setY(c.y - 0.012), anchor.scale.x * LAND);
        acceptTable();
      }
    }
  }
  if (mode === 'hand' && AUTO && modeT > 1) acceptTable();
  if (mode === 'choose' && AUTO && modeT > 1.5) pickClass(params.get('cls') || 'loop');
  if (mode === 'press' && AUTO && modeT > 1) beginGrowth(128, 200, pickedCls, +(params.get('seed') ?? 7));

  anchor.getWorldPosition(anchorWorld);
  const tableY = anchorWorld.y;

  // fingertips: touching or hovering the land
  let tipWorld = null, tipState = 'none';
  if (renderer.xr.isPresenting) {
    for (const h of hands) {
      // a controller points at the land: where its ray meets the table is the fingertip
      if (!h.joints && h.controller && current.land) {
        h.ctrl.getWorldPosition(tmpV);
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(h.ctrl.getWorldQuaternion(new THREE.Quaternion()));
        tablePlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), anchorWorld);
        if (new THREE.Ray(tmpV, dir).intersectPlane(tablePlane, h.tip)) {
          h.tip.y += h.pressing ? 0.004 : 0.015;
          h.state = h.pressing ? 'touch' : 'hover';
          if (!tipWorld || h.state === 'touch') { tipWorld = h.tip; tipState = h.state; }
          continue;
        }
      }
      if (!h.joints) { h.state = 'none'; continue; }
      const px = current.terrain.pixelOf(h.tip);
      const surface = current.land ? current.terrain.worldOf(px[0], px[1], tmpV).y : tableY;
      h.state = h.touch.update(h.tip.toArray(), surface, dt);
      if (h.state !== 'none' && (!tipWorld || h.state === 'touch')) { tipWorld = h.tip; tipState = h.state; }
    }
    if (mode === 'choose') for (const h of hands) if (h.joints) { const c = chooser.poke(h.tip); if (c) { pickClass(c); break; } }
    if (mode === 'press') {
      const h = hands.find((q) => q.state === 'touch');
      if (h) {
        const [px, py] = current.terrain.pixelOf(h.tip);
        beginGrowth(THREE.MathUtils.clamp(px, 8, 248), THREE.MathUtils.clamp(py, 8, 248), pickedCls, newSeed());
      }
    }
  } else if (pointer.onTable && mode !== 'fly') {
    tipWorld = pointer.point.clone().setY(pointer.point.y + (pointer.down ? 0.004 : 0.015));
    tipState = pointer.down ? 'touch' : 'hover';
  }

  if (mode === 'grow' && current.terrain.born) setMode('walk');

  // walking
  if (mode === 'walk' && current.land) {
    walker = walker?.land === current.land ? walker : Object.assign(createWalker(current.land), { land: current.land });
    const N = current.terrain.size, scale = N / (LAND * anchor.scale.x);
    let target = null;
    if (AUTO || FILM) target = autoWalk();
    else if (tipWorld) target = current.terrain.pixelOf(tipWorld);
    if (target) {
      if (!walker.placed) walker.place(target[0], target[1], 0.025 * scale);
      const walked = walker.step(target[0], target[1], dt);
      for (const [x, y] of walked) current.terrain.mark(x, y);
      setSand(walked.length / Math.max(1, 110 * dt));
      if (walker.placed && walker.level !== lastLevel) {
        if (lastLevel >= 0) tone(Math.min(11, walker.level), 0, 0.09);
        lastLevel = walker.level;
      }
      for (const i of nearby(current.land.landmarks, walker.x, walker.y, 0.03 * scale, current.woken)) wake(i);
      // the city grows along the paths you walk; the summit gets a tower
      if (walked.length) {
        const spot = houseSpot(current.land, walker.x, walker.y, current.city.houses, 14);
        if (spot && current.city.add(spot[0], spot[1])) { tone(2 + (current.city.count % 5), 0, 0.04); keepCity(); }
        const core = current.land.cores[0];
        if (core && !current.city.houses.some((h) => h[2] === 1) && (core[0] - walker.x) ** 2 + (core[1] - walker.y) ** 2 < 100) {
          current.city.add(Math.round(core[0]), Math.round(core[1]), 1);
          [0, 4, 7, 9].forEach((n, k) => setTimeout(() => tone(n + 5, 0, 0.08), k * 180));
          keepCity();
        }
      }
    } else {
      walker.lift();
      setSand(0);
      lastLevel = -1;
    }
    // take off: one hand LIFTED off the land, palm down, fingers spread (or the two-hand shadow
    // bird). A hand merely resting flat in the air is not a lift: the palm must have been low over
    // the land a moment ago.
    for (const h of hands) {
      const flat = h.palmDown.update(h.frame, tableY, dt);
      if (h.frame) {
        const c = rig.localToWorld(tmpV.set(...h.frame.center));
        // low = within 12 cm of the land; a lift has to rise above 14 cm, so a hand hovering flat at
        // any one height never takes off by itself
        if (Math.hypot(c.x - anchorWorld.x, c.z - anchorWorld.z) < 0.32 * anchor.scale.x && c.y - tableY < 0.12) h.lowAt = t;
      }
      if (flat && h.seen > 0.5 && t - (h.lowAt ?? -9) < 2.5) takeOff(h);
    }
    const [l, r] = [hands.find((h) => h.handedness === 'left'), hands.find((h) => h.handedness === 'right')];
    if (mode === 'walk' && shadowBird.update(l?.frame, r?.frame, l?.joints, r?.joints, tableY, dt)) takeOff(r?.frame ? r : l);
    if (AUTO && current.woken.size >= +(params.get('birds') ?? 3) && modeT > 2) takeOff(null);
  }

  // flying
  if (mode === 'fly') {
    const steer = flight.mode === 'flying' ? steering(dt) : { turn: 0, climb: 0 };
    flight.update(dt, headLocal, steer, groundAt);
    setWind(flight.amount);
    if (flight.mode === 'flying') {
      for (const l of lands) {
        if (l === current || !l.land) continue;
        const ring = ringAt(l);
        if (Math.hypot(ring.x - flight.head.x, ring.z - flight.head.z) < 0.12) { landOn(l); break; }
      }
    }
    if (flight.mode === 'table') {
      for (const l of lands) l.terrain.mesh.visible = l === current;
      setWind(0);
      if (landingGoal?.land) {
        const m = landingGoal.land.landmarks.find((q) => q.kind === 'delta') || landingGoal.land.landmarks[0];
        if (m) wake(landingGoal.land.landmarks.indexOf(m));
      }
      landingGoal = null;
      walker = null;
      setMode('walk');
    }
  }

  // the birds, the rings, the text, the plates
  const inFlight = flight.flying;
  headVel.subVectors(headWorld, lastHead).divideScalar(Math.max(dt, 1e-3));
  if (headVel.length() > 1) headVel.set(0, 0, 0); // a re-root or a jump, not a motion
  lastHead.copy(headWorld);
  const spread = rig.scale.x; // world metres per felt metre
  flock.update(dt, t, {
    fingertip: mode === 'walk' ? tipWorld : null,
    center: anchorWorld,
    follow: inFlight ? { point: headWorld.clone().addScaledVector(flight.forward(tmpV), 1.2 * spread), forward: flight.forward(new THREE.Vector3()), spread, velocity: headVel } : null,
  });
  // Ink widths are felt sizes: a pen line at the table, a rope once you are bird-sized. The headset
  // puts your shrink into its view matrices; three.js keeps scale out of a plain camera's view, so
  // the browser preview converts felt sizes and clip distances itself.
  const amt = inFlight ? flight.amount : 0;
  const view = renderer.xr.isPresenting ? 1 : spread;
  if (!renderer.xr.isPresenting && Math.abs(camera.near - 0.02 * spread) > 1e-6) {
    camera.near = 0.02 * spread;
    camera.far = 2000 * spread;
    camera.updateProjectionMatrix();
  }
  flock.draw(t, inFlight ? THREE.MathUtils.lerp(1, (0.4 * spread) / 0.06, amt) : 1, THREE.MathUtils.lerp(0.0016, 0.012, amt) * view, handBird(t, amt, spread));
  for (const l of lands) {
    if (!l.city) continue;
    l.city.width = THREE.MathUtils.lerp(0.0009, 0.01, amt) * view;
    l.city.update();
  }
  // every other land gets an upright hoop over its summit, turned to face you, with a beacon above
  rings.begin();
  if (flight.mode === 'flying') {
    rings.width = 0.08 * view;
    for (const l of lands) {
      if (l === current || !l.land) continue;
      const c = ringAt(l), r = 0.06 + Math.sin(t * 2) * 0.004;
      const side = new THREE.Vector3(c.z - flight.head.z, 0, flight.head.x - c.x).normalize();
      const at = (a) => ({ x: c.x + side.x * Math.cos(a) * r, y: c.y + r + Math.sin(a) * r, z: c.z + side.z * Math.cos(a) * r });
      for (let k = 0; k < 48; k++) rings.segment(at((k / 48) * Math.PI * 2), at(((k + 1) / 48) * Math.PI * 2));
      rings.segment({ x: c.x, y: c.y + 2 * r, z: c.z }, { x: c.x, y: c.y + 2 * r + 0.25, z: c.z });
    }
  }
  rings.end();

  room.visible = !passthrough && flight.amount < 0.02; // the preview room would tower over a bird
  for (const l of lands) if (l !== current) l.terrain.mesh.visible = flight.amount > 0.05; // only under the sky
  if (!renderer.xr.isPresenting) {
    // the browser view looks down at the table, and up at the horizon while flying
    camera.rotation.set(THREE.MathUtils.lerp(-0.68, -0.12, flight.amount), 0, 0);
  }
  for (const l of lands) {
    l.terrain.uniforms.uLift.value = 1 + 3 * flight.amount; // deeper valleys once you are bird-sized
    l.terrain.update(dt);
  }
  lampCheck(dt, t);
  guide.update(dt);
  chooser.update(dt);
  panel.update(dt, headLocal, headQuat);
  renderer.render(scene, camera);
}

// Your own bird: the ridge at your print's delta, worn on the hand you took off with (or held
// just below your view in the browser), its wings growing as you shrink.
let avatar = null;
const palmWorld = new THREE.Vector3(), palmFwd = new THREE.Vector3(), rigQuat = new THREE.Quaternion();
function handBird(t, amount, spread) {
  if (amount < 0.02) return null;
  if (!avatar) {
    const m = home.land?.landmarks.find((q) => q.kind === 'delta') || home.land?.landmarks[0];
    const shape = wingShape(m ? m.ridge : [[0, 0], [10, 2], [20, 0]]);
    avatar = { curve: shape.curve, pos: new THREE.Vector3(), heading: new THREE.Vector3(), phase: 0, flap: 3.2, span: 0 };
  }
  const h = tookOffWith?.frame ? tookOffWith : null;
  rig.getWorldQuaternion(rigQuat);
  if (h) {
    rig.localToWorld(palmWorld.set(...h.frame.center));
    palmFwd.set(...h.frame.forward).applyQuaternion(rigQuat).setY(0).normalize();
  } else {
    const fwd = flight.forward(palmFwd);
    camera.getWorldPosition(palmWorld).addScaledVector(fwd, 0.7 * spread);
    palmWorld.y -= 0.24 * spread;
  }
  avatar.pos.copy(palmWorld);
  avatar.heading.copy(palmFwd);
  avatar.span = 0.26 * spread * amount;
  return avatar;
}

// hands that vanish for a while in a dark room: ask for light, not more than twice a minute
let handsSeen = false, handGone = 0, lampAsked = -60;
function lampCheck(dt, t) {
  if (!renderer.xr.isPresenting || hands.some((h) => h.controller)) return;
  if (hands.some((h) => h.joints)) { handsSeen = true; handGone = 0; return; }
  handGone += dt;
  if (handsSeen && handGone > 4 && t - lampAsked > 30 && ['hand', 'choose', 'press', 'walk'].includes(mode)) {
    lampAsked = t;
    panel.say('A lamp helps me see your hands', 5);
  }
}

function keepCity() {
  save.cities[current.id] = current.city.houses;
  storeSave(save);
}

// the autopilot walks the real paths to the nearest sleeping landmark
function autoWalk() {
  const land = current.land;
  if (!walker.placed) {
    const c = land.cores[0] ?? [land.size / 2, land.size / 2];
    for (let r = 4; r < land.size && !walker.placed; r += 6) walker.place(c[0], c[1] + r, 6);
  }
  if (!autoRoute.length || autoTarget === null || current.woken.has(autoTarget)) {
    let best = null;
    const close = land.landmarks.map((m, i) => [i, (m.x - walker.x) ** 2 + (m.y - walker.y) ** 2])
      .filter(([i]) => !current.woken.has(i)).sort((a, b) => a[1] - b[1]).slice(0, 8);
    for (const [i] of close) {
      const m = land.landmarks[i];
      const r = route(land, walker.x, walker.y, m.x, m.y, 30000);
      const end = r[r.length - 1];
      if (r.length && end && (end[0] - m.x) ** 2 + (end[1] - m.y) ** 2 < 100 && (!best || r.length < best.r.length)) best = { r, i };
    }
    autoRoute = best ? best.r : [];
    autoTarget = best ? best.i : null;
    if (!best && close.length) {
      // the paths here do not connect to any sleeping landmark: lift the finger, put it down near one
      const m = land.landmarks[close[0][0]];
      walker.lift();
      for (let r = 2; r < 40 && !walker.placed; r += 3) walker.place(m.x, m.y, r);
      return [walker.x, walker.y];
    }
  }
  // drop the route up to wherever the walker is now (it can step several pixels in one frame)
  const here = autoRoute.findIndex(([x, y]) => (x - walker.x) ** 2 + (y - walker.y) ** 2 < 2);
  if (here >= 0) autoRoute.splice(0, here + 1);
  // a target only two pixels ahead keeps the greedy walker on the route through tight bends
  return autoRoute[Math.min(2, autoRoute.length - 1)] ?? null;
}

// ---------- start / stop ----------

const xrButton = document.getElementById('xrButton');
const previewButton = document.getElementById('previewButton');

async function enterHeadset() {
  startAudio();
  const ar = await navigator.xr.isSessionSupported('immersive-ar');
  const session = await navigator.xr.requestSession(ar ? 'immersive-ar' : 'immersive-vr', {
    optionalFeatures: ['hand-tracking', 'plane-detection'],
  });
  await renderer.xr.setSession(session);
  passthrough = ar && session.environmentBlendMode !== 'opaque';
  tableLocked = false;
  start();
  session.addEventListener('visibilitychange', () => pauseAudio(session.visibilityState === 'hidden'));
  session.addEventListener('end', () => {
    passthrough = false;
    room.visible = true;
    scene.background = new THREE.Color('#231a16');
    camera.position.set(0, 1.18, 0.5);
    camera.lookAt(0, 0.75, -0.02);
    document.getElementById('banner').classList.remove('hidden');
    setMode('title');
  });
}
document.addEventListener('visibilitychange', () => pauseAudio(document.hidden));

function preview() {
  passthrough = false;
  anchor.position.set(0, 0.752, 0);
  anchor.rotation.set(0, 0, 0);
  start();
}

xrButton.addEventListener('click', () => enterHeadset().catch((e) => console.error(e)));
previewButton.addEventListener('click', preview);
if (navigator.xr) {
  Promise.all([navigator.xr.isSessionSupported('immersive-ar'), navigator.xr.isSessionSupported('immersive-vr')])
    .then(([ar, vr]) => (ar || vr) && xrButton.classList.remove('hidden'))
    .catch(() => {});
}

// the browser view: seated at the table, looking down at where the land will be
camera.position.set(0, 1.18, 0.5);
camera.lookAt(0, 0.75, -0.02);
anchor.position.set(0, 0.752, 0);
scene.background = new THREE.Color('#231a16');
if (params.has('play') || AUTO) preview();
// the film director drives the emulated device (only with ?emulate&film)
const director = FILM && window.__device ? (await import('./director.js')).createDirector({
  state: () => window.__pwc.state,
  anchorWorld: () => anchor.getWorldPosition(new THREE.Vector3()),
  walkerWorld: () => (walker?.placed && current.land ? current.terrain.worldOf(walker.x, walker.y) : null),
  plate: (cls) => {
    const p = chooser.group.visible && chooser.plates.find((m) => m.userData.cls === cls);
    return p ? { pos: p.getWorldPosition(new THREE.Vector3()), normal: new THREE.Vector3(0, 0, 1).applyQuaternion(p.getWorldQuaternion(new THREE.Quaternion())) } : null;
  },
  flightForward: () => flight.forward(new THREE.Vector3()),
  headLocal, rig, hands,
}) : null;
renderer.setAnimationLoop(frame);

// read-only peek for tests and curious players
window.__pwc = {
  get state() {
    return {
      mode, flight: flight.mode, cls: home.cls, seed: home.seed, birds: flock.birds.length,
      woken: current.woken.size, land: current.id, lands: lands.length, landmarks: current.land?.landmarks.length ?? 0,
      walker: walker?.placed ? [walker.x, walker.y] : null, panel: panel.text, city: current.city?.count ?? 0,
    };
  },
  takeOff: () => takeOff(null),
  film,
  get filmDone() { return director?.done ?? false; },
  get filmPhase() { return director?.phase ?? null; },
  debug: { flock, rings, rig, anchor, flight, hands, terrain: () => current.terrain, auto: () => ({ route: autoRoute.slice(0, 4), left: autoRoute.length, target: autoTarget, walker: walker && [walker.x, walker.y], land: current.land && current.land.landmarks.length }) },
};
