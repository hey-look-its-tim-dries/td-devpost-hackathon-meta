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
import { createLabel } from './labels.js';
import { createBraid } from './braid.js';
import { createChart } from './world/chart.js';
import { whereAt } from './world/where.js';
import { createStamp } from './stamp.js';
import { createHud } from './hud.js';
import { createAtlas } from './atlas/card.js';
import { createPalmUp, createPush } from './gesture.js';
import { createPins, address } from './world/pins.js';
import { placeName } from './world/names.js';
import { createCommunityArt } from './community-art.js';
import { slotFor } from './world/community.js';
import { journalText, watersheds, when } from './journal.js';
import { steerTo } from './autopilot.js';
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
  // a scanned sample room stands in for yours, so passthrough shows something (&room=office_small for another)
  try {
    const { SyntheticEnvironmentModule } = await import('https://esm.sh/@iwer/sem@2.5.0');
    device.installSEM(SyntheticEnvironmentModule);
    fetch(`https://unpkg.com/@iwer/sem@2.5.0/captures/${params.get('room') || 'living_room'}.json`)
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
// three bakers; one that dies (a worker that fails to load, or runs out of memory) is replaced and its jobs
// sent again, once each
const retried = new Set();
const workers = [];
const spawnWorker = (k) => {
  const w = new Worker(new URL('./hand/worker.js', import.meta.url), { type: 'module' });
  w.onmessage = onBaked;
  w.onerror = (e) => {
    console.error('hand worker failed', e.message, e.filename, e.lineno);
    e.preventDefault?.();
    workers[k] = spawnWorker(k);
    for (const [layer, f] of pendingBake) if (layer % workers.length === k && !retried.has(layer)) { retried.add(layer); workers[k].postMessage({ id: layer, palm: f.palm, prints: f.prints, cell: 0.75 }); }
  };
  return w;
};
for (let k = 0; k < 3; k++) workers.push(spawnWorker(k));
function onBaked({ data }) {
    if (data.error) { console.error('a Hand could not be built', data.error); pendingBake.delete(data.id); return; }
    const f = pendingBake.get(data.id);
    pendingBake.delete(data.id);
    if (!f) return;
    const rise = rising?.id === f.id ? 0 : 1;
    surface.addHand(data.id, data, f.pose, rise);
    if (mine && f.id === mine.id) chart.fill(f.id, data.handbits.length); // your own Hand you know by heart
    surface.setCharted(data.id, chart.mask(f.id));
    const { texA, info, ...kept } = data; // the textures live in the surface now; the ground keeps heights only
    hands.push({ ...f, layer: data.id, data: kept, rise, palette: unpackPalm(f.palm).palette });
    if (rise === 1) knots.push(...hatch({ ...f, data: kept })); // a rising Hand hatches when it has risen (below)
    const go = params.get('go')?.split('.'); // ?go=<handId>.<code>: an address link opens the game flying there
    if (go && go[0] === f.id) { const hb = kept.handbits.find((b) => b.code === go[1]); const [x, z] = toWorld(f.pose, hb?.cx ?? 0, hb?.cy ?? 230); flyTo = { x, z, label: hb ? `${f.name} ${hb.code}` : f.name }; }
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
  chart.forget(id);
  pins.prune(new Set(hands.map((h) => h.id)));
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
  if (ok) refreshNames();
  if (ok) roomLink = net.openRoom({ name: mine?.name ?? null, onHello: (id) => (me = id), onNames: (m) => others.setNames(m), onSnapshot: (s) => others.apply(s, me, glide.pos), onLaid: applyLaid, onLeft: removeHand, onState: (st) => (roomState = st), onCommunity: (m) => { if (m.donated) community.add(m.donated); if (m.sealed) { stamp(`Community Hand ${m.sealed}`, 'all 22 handbits given · the next one begins'); net.community().then((c) => community.set(c)); } } });
  else panel.say('Playing alone: the map could not be reached', 6);
});
const others = createOthers({ max: 60 }); // the other players in your room, as lighter creatures
// charting (spec 6.4): fly over a handbit lower than 400 m and it is inked into your atlas; chart every
// handbit of a Hand and it is sealed
const chart = createChart(storage), CHART_ALT = 400, seal = createStamp();
const stamp = (title, sub) => seal.show(title, sub);
let place = null; // what lies under you: { hand, handbit, index } or null
function charting() {
  place = whereAt(hands, glide.pos[0], glide.pos[2]);
  if (!place || mode !== 'fly' || !started || glide.pos[1] - groundAt(glide.pos[0], glide.pos[2]) > CHART_ALT) return;
  if (!place.handbit) return; // the water charts nothing
  const { hand, handbit, index } = place, total = hand.data.handbits.length, r = chart.visit(hand.id, index, total);
  if (!r) return;
  surface.setCharted(hand.layer, chart.mask(hand.id));
  surface.reveal(hand.layer, index);
  if (r === 'sealed') stamp(`${hand.name} sealed`, `every handbit charted · ${chart.sealedCount()} sealed`);
  else panel.say(`Charted: ${handbit.name} · ${hand.name} (${chart.count(hand.id)} of ${total})`, 3.5);
}
const braid = createBraid(), braidList = [], CALM = params.has('calm'); // the greeting; ?calm: reduced motion, no braiding
let braiding = null; // { id, k } while two swarms braid
const tags = new Map(); // id -> name tag over that player
const greeted = new Set(); // players you have been told about
const eyeW = new THREE.Vector3();
function updateTags() {
  camera.getWorldPosition(eyeW);
  const seen = new Set();
  others.each((c, id, pos) => {
    seen.add(id);
    let t = tags.get(id);
    if (!t) { t = createLabel(); scene.add(t.sprite); tags.set(id, t); }
    const name = others.nameOf(id);
    t.set(name ?? 'a traveller');
    t.update(pos, eyeW);
    if (started && mode === 'fly' && !greeted.has(id)) { greeted.add(id); panel.say(`${name ?? 'A traveller'} joined your sky`, 4); }
  });
  for (const [id, t] of tags) if (!seen.has(id)) { scene.remove(t.sprite); t.dispose(); tags.delete(id); greeted.delete(id); }
}

// height of the world at (x, z), for flight clearance (the GPU surface follows the same rule)
const groundAt = (x, z) => groundAtWorld(hands, x, z);

// ---------- scribbles: every Hand's knots over its palm, and your own creature following you ----------

const LINE = { points: 90, spacing: 3 }; // lines about 270 m long, at world scale
const TAPER = (s) => 0.12 + 0.88 * Math.pow(Math.sin(Math.PI * s), 0.6);
// a Hand's five scribbles, one knot per print, above its palm. Each hatches out of its own print land
// (spec 9): its head lifts off the fingertip and the line peels up after it, then it knots
const hatch = (f) => f.prints.map(unpackPrint).map((p, j) => {
  const [cx, cz] = toWorld(f.pose, 0, 230);
  const knot = createKnot({ cls: p.cls, seed: p.seed, center: [cx, 480 + j * 35, cz], radius: 110 + j * 20, tilt: 0.35 + j * 0.18 }); // above the palms
  const tip = f.data?.handbits?.find((b) => b.code === `${'TIMRL'[j]}1`);
  const at = tip ? (([x, z]) => [x, groundAt(x, z) + 4, z])(toWorld(f.pose, tip.cx, tip.cy)) : knot.step(0, 0);
  return { hand: f.id, knot, line: createScribble({ ...LINE, at, dir: [0, 1, 0], seed: p.seed }) };
});
const knots = []; // filled as Hands bake
// faster the higher you fly (30 m/s skimming the ridges, 220 m/s high over the wilderness), and diving adds half again
// fast, and faster the lower you dare: 170 m/s level, 560 m/s out of a full dive, and skimming the land keeps you well above cruise
const CRUISE = 170, TERMINAL = 560;
const glide = createGlide({ pos: params.get('at')?.split(',').map(Number) ?? [0, 650, 15000], speed: CRUISE, cruise: CRUISE, terminal: TERMINAL, minSpeed: 70, gravity: 55, groundBoost: 30, groundBand: 150, turnRate: 0.9, clearance: 25, ceiling: 1500 });
const rush = () => Math.max(0, Math.min(1, (glide.speed - CRUISE) / (TERMINAL - CRUISE))); // 0 level .. 1 flat out // ?at=x,y,z to start elsewhere
// you: the Whorl, ink strands winding round your own flight path; the camera chases it
const creature = createCreature({ strands: 9, points: 70, spacing: 2, radius: 13 });
const CHASE = { back: 190, up: 40 }; // further back than the creature is long, so all of it is in front of you
const chase = { pos: new THREE.Vector3(glide.pos[0], glide.pos[1] + CHASE.up, glide.pos[2] + CHASE.back), yaw: glide.yaw };
const ink = createInk(MAX_LAYERS * 5 * (LINE.points + 1) + creature.strands * 71 + 60 * 5 * 41, { width: 1.1, color: '#16100e' }); // every Hand's five, you, and up to 60 others
// speed lines: ink streaks hanging in the air that rush past when you are fast
const streaks = Array.from({ length: 160 }, () => new THREE.Vector3(Infinity, 0, 0));
const streakInk = createInk(streaks.length, { width: 0.7, color: '#16100e' });
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
camera.add(seal.mesh);
const hud = createHud();
camera.add(hud.group);
const pins = createPins(storage); // up to five pinned places, on the compass
let flyTo = null; // { x, z, label } while Fly here steers you
const community = createCommunityArt(); // lies on the Source lake
scene.add(community.mesh);
let communityOn = false; // the map answered: donations possible
let placeNames = {}, pickName = null; // handId -> { feature: name } from the map; the name being chosen { handId, feature, seed, name }
const nameOf = (h, hb) => (hb ? placeNames[h.id]?.[hb.code] ?? hb.name : null);
const summitOf = (h, hb) => (hb?.kind === 'tip' ? placeNames[h.id]?.[`summit:${hb.finger}`] ?? null : null);
let events = null, sheds = {}, timelineAt = Infinity; // the journal, watershed systems, the timeline's moment
async function refreshNames() { if (online) { placeNames = await net.names(); const c = await net.community(); if (c) { community.set(c); communityOn = true; } events = await net.events(); sheds = watersheds(await net.watersheds()); } setTimeout(refreshNames, 60000); }
// ---------- the palm atlas: left palm up (or M) ----------
const atlas = createAtlas();
rig.add(atlas.mesh);
const palmUp = createPalmUp(), push = createPush();
let atlasPress = false, atlasByPalm = false, atlasPaint = 0, selected = null, inspectAt = null;
const atlasUV = () => (atlas.isOpen ? raycaster.intersectObject(atlas.mesh, false)[0]?.uv ?? null : null);
function openAtlas(byPalm) {
  if (mode !== 'fly' || !started) return;
  mode = 'atlas';
  atlasByPalm = byPalm;
  atlas.fit(hands);
  atlas.open(headLocal, headQuat, !renderer.xr.isPresenting);
  atlasPaint = 0;
}
function closeAtlas() { if (mode !== 'atlas') return; atlas.close(); mode = 'fly'; selected = null; }
// what the atlas shows right now
function atlasState() {
  const list = [];
  others.each((c, id, pos) => list.push({ pos, name: others.nameOf(id) }));
  const mineHand = mine && hands.find((h) => h.id === mine.id);
  return { hands, chart, me: { pos: glide.pos, yaw: glide.yaw }, others: list, pins: pins.list(), selected: selected?.id ?? null, inspect: selected && inspectOf(selected), mine: mine && { name: mine.name, handbits: mineHand?.data.handbits ?? [] }, names: mine ? placeNames[mine.id] ?? {} : {}, pickName,
    journal: events && events.map((e) => ({ when: when(e.at), text: journalText(e) })).filter((e) => e.text),
    timeline: timelineOf(), until: timelineAt,
    waters: atlas.layers.watersheds ? Object.fromEntries(Object.entries(sheds).map(([id, n]) => [id, SHED_COLOURS[n % SHED_COLOURS.length]])) : null, community: communityOn ? { paint: (g, regions, tools) => community.paintTab(g, regions, tools) } : null };
}
function inspectOf(h) { // the inspector for a Hand (Task 7 adds its buttons' actions)
  const hb = inspectAt?.handbit;
  return {
    kicker: h.founder ? 'FOUNDER' : h.id === mine?.id ? 'YOUR HAND' : 'A PLAYER\'S HAND',
    title: h.name,
    lines: [hb ? `${hb.code} · ${nameOf(h, hb)}${summitOf(h, hb) ? ` · summit ${summitOf(h, hb)}` : ''}` : 'its rivers', `${chart.count(h.id)} of ${h.data.handbits.length} handbits charted${chart.sealed(h.id) ? ' · sealed' : ''}`, ...wrapText(address({ hand: h.name, handbit: hb?.name, code: hb?.code, ...placeOf(h, hb) }), 34)],
    buttons: [...(h.id === mine?.id && hb && slotFor(hb.code) && communityOn && !community.state.slots.some((q) => q.slot === hb.code) ? [{ id: 'donate', label: 'Give to the Community Hand' }] : []), ...(hb?.kind === 'tip' && !summitOf(h, hb) && h.id !== mine?.id && online && mine?.id ? [{ id: 'name:summit', label: 'Name this summit' }] : []), { id: 'pin', label: pins.list().some((q) => q.handId === h.id && q.code === (hb?.code ?? null)) ? 'Pinned' : 'Pin it' }, { id: 'fly', label: 'Fly here', primary: true }],
  };
}
// where a Hand's handbit (or its palm) lies in the world
function placeOf(h, hb) { const [x, z] = toWorld(h.pose, hb?.cx ?? 0, hb?.cy ?? 230); return { x, z }; }
const wrapText = (t, n) => { const out = [''], words = t.split(' '); for (const w of words) { if ((out.at(-1) + ' ' + w).trim().length > n) out.push(w); else out[out.length - 1] = (out.at(-1) + ' ' + w).trim(); } return out; };
const SHED_COLOURS = ['#2f5d7c', '#1f7a6d', '#6b4c9a', '#9a5b2f', '#3d6e2f', '#7a2f4f']; // one ink per river system
function timelineOf() { // the world's history on a slider: from the first Hand to now
  const at = hands.map((h) => h.placed_at).filter(Number.isFinite);
  if (at.length < 2) return null;
  const from = Math.min(...at), to = Date.now(), t = Math.min(timelineAt, to);
  return { from, to, at: t, label: t >= to ? 'now · drag to replay the world' : new Date(t).toISOString().slice(0, 10) };
}
function atlasDo(a) {
  if (!a) return;
  if (a.type === 'close') return closeAtlas();
  if (a.type === 'tab') atlas.setTab(a.tab);
  else if (a.type === 'layer') atlas.toggle(a.layer);
  else if (a.type === 'timeline') { const tl = timelineOf(); if (tl) timelineAt = a.k >= 0.999 ? Infinity : tl.from + Math.max(0, a.k) * (tl.to - tl.from); }
  else if (a.type === 'pick') { inspectAt = whereAt(hands, a.x, a.z); selected = inspectAt?.hand ?? null; }
  else if (a.type === 'handbit' && mine?.id && online) { const hb = hands.find((h) => h.id === mine.id)?.data.handbits[a.index]; if (hb) { const seed = (Math.random() * 2 ** 31) | 0; pickName = { handId: mine.id, feature: hb.code, code: hb.code, seed, name: placeName(seed, hb.code) }; } }
  else if (a.type === 'name' && a.arg === 'summit' && selected && inspectAt?.handbit) { const seed = (Math.random() * 2 ** 31) | 0, feature = `summit:${inspectAt.handbit.finger}`; pickName = { handId: selected.id, feature, code: `${selected.name} summit`, seed, name: placeName(seed, feature) }; }
  else if (a.type === 'name' && a.arg === 'another' && pickName) { pickName.seed++; pickName.name = placeName(pickName.seed, pickName.feature); }
  else if (a.type === 'name' && a.arg === 'keep' && pickName) {
    const p = pickName;
    pickName = null;
    net.nameIt({ handId: p.handId, feature: p.feature, name: p.name }).then((r) => {
      if (r.ok) { (placeNames[p.handId] ??= {})[p.feature] = p.name; panel.say(`Named: ${p.name}`, 4); } else panel.say(r.error === 'already named' ? 'Someone named it first' : `Not named: ${r.error}`, 4);
      atlasPaint = 0;
    });
  }
  else if (a.type === 'donate' && selected?.id === mine?.id && inspectAt?.handbit) {
    const code = inspectAt.handbit.code;
    net.donate(code).then((r) => {
      if (r.error) return panel.say(r.error === 'you have given to this one' ? 'You have given to this Community Hand already' : `Not given: ${r.error}`, 4);
      community.add({ no: r.no, slot: code, palette: unpackPalm(mine.palm).palette });
      panel.say(`${code} given to Community Hand ${r.no}`, 4);
      atlasPaint = 0;
    });
  }
  else if (a.type === 'pin' && selected) { const hb = inspectAt?.handbit; pins.add({ handId: selected.id, code: hb?.code ?? null, ...placeOf(selected, hb), label: hb ? `${selected.name} ${hb.code}` : selected.name }); }
  else if (a.type === 'fly' && selected) { const hb = inspectAt?.handbit; flyTo = { ...placeOf(selected, hb), label: hb ? `${selected.name} ${hb.code}` : selected.name }; closeAtlas(); panel.say(`Flying to ${flyTo.label}: steer to take over`, 4); return; }
  atlasPaint = 0;
}
function atlasFrame(dt) {
  if (!atlas.isOpen) {
    if (renderer.xr.isPresenting && started && mode === 'fly') { const l = xrHands.find((q) => q.handedness === 'left'); if (palmUp.update(l?.frame ?? null, handFloor(), dt)) openAtlas(true); }
    return;
  }
  if (atlasByPalm) {
    const l = xrHands.find((q) => q.handedness === 'left');
    if (!palmUp.update(l?.frame ?? null, handFloor(), dt)) return closeAtlas(); // palm down: closed
    if (l?.frame) atlas.follow(l.frame.center, headLocal, dt);
  }
  if (renderer.xr.isPresenting) poke(atlas.mesh, (uv) => atlasDo(atlas.down(uv)), (uv) => atlasDo(atlas.move(uv)), () => atlasDo(atlas.up()));
  if ((atlasPaint -= dt) <= 0) { atlasPaint = 0.2; atlas.paint(atlasState()); } // five times a second, and at once after a tap
}
addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') mode === 'atlas' ? closeAtlas() : openAtlas(false);
  else if (e.key === 'Escape') closeAtlas();
});
renderer.domElement.addEventListener('wheel', (e) => { if (mode === 'atlas') { atlas.zoom(Math.exp(-e.deltaY * 0.0015)); atlasPaint = 0; e.preventDefault(); } }, { passive: false });
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
  if (mode === 'atlas') { const u = atlasUV(); if (u) { atlasPress = true; return atlasDo(atlas.down(u)); } }
  if (uv) { drawing = true; return act(atelier.down(uv, flow)); }
  if (mode === 'merge') { const i = ghosts.aim(ray.origin, ray.direction); if (i >= 0) return choose(i); }
  look.drag = true;
});
addEventListener('pointerup', () => {
  look.drag = false;
  if (atlasPress) { atlasPress = false; atlasDo(atlas.up()); }
  if (drawing) { drawing = false; act(atelier.up(flow)); }
});
addEventListener('pointermove', (e) => {
  if (drawing) { mouseRay(e); const uv = cardUV(); if (uv) atelier.move(uv, flow); return; }
  if (atlasPress) { mouseRay(e); const u = atlasUV(); if (u) atlasDo(atlas.move(u)); return; }
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
  if (flyTo) { // Fly here, until you arrive or steer yourself
    if (keys.size || xrHands.some((q) => q.engaged)) flyTo = null;
    else if (Math.hypot(flyTo.x - glide.pos[0], flyTo.z - glide.pos[2]) < 400) { panel.say(`Over ${flyTo.label}`, 4); flyTo = null; }
    else return steerTo(glide, [flyTo.x, 0, flyTo.z], groundAt);
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
  roomLink?.rename(mine.name); // others now see your Hand's name over you
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
function poke(mesh = atelier.mesh, down = (uv) => act(atelier.down(uv, flow)), move = (uv) => atelier.move(uv, flow), up = () => act(atelier.up(flow))) {
  for (const h of xrHands) {
    if (!h.frame) continue;
    const p = mesh.worldToLocal(rig.localToWorld(tipW.fromArray(h.store['index-finger-tip'])));
    const on = Math.abs(p.x) < 0.3 && Math.abs(p.y) < 0.225, uv = { x: p.x / 0.6 + 0.5, y: p.y / 0.45 + 0.5 };
    if (!poking && on && p.z < 0.01 && p.z > -0.03) { poking = h; down(uv); }
    else if (poking === h && (p.z > 0.03 || !on)) { poking = null; up(); }
    else if (poking === h) move(uv);
  }
}
// a pinch: in the atelier it touches the card where you look; on the way to the merge it chooses the ghost you look at
[0, 1].forEach((i) => renderer.xr.getController(i).addEventListener('select', () => {
  gazeRay();
  if (mode === 'atelier') { const uv = cardUV(); if (uv) { act(atelier.down(uv, flow)); act(atelier.up(flow)); } }
  else if (mode === 'atlas') { const uv = atlasUV(); if (uv) { atlasDo(atlas.down(uv)); atlasDo(atlas.up()); } }
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
  card.update(dt, started && mode !== 'atelier' && mode !== 'atlas' && (webcam || renderer.xr.isPresenting) ? { checks: best?.c ?? null, progress: best?.q.hold.progress ?? 0, steering: steeringNow, turn: steer.turn, climb: steer.climb } : null);
  if (mode !== 'atelier' && mode !== 'atlas') glide.update(dt, steer, groundAt); // the world waits while you read your hand or your atlas
  roomLink?.send({ x: glide.pos[0], y: glide.pos[1], z: glide.pos[2], yaw: glide.yaw, pitch: glide.pitch, mode: Math.max(0, ['fly', 'atelier', 'merge', 'rise'].indexOf(mode)) }); // at most 5 a second
  creature.update(dt, glide.pos, { speed: 70 + 200 * rush(), pitch: glide.pitch, turn: steer.turn }); // the creature's own scale: 70 calm .. 270 a spear
  others.update(dt);
  updateTags();
  charting();
  seal.update(dt);
  // the HUD: where you are, and which way things lie
  const marks = [{ label: 'Source', x: 0, z: 0, color: '#2f5d7c' }];
  if (mine?.pose) { const [mx, mz] = toWorld(mine.pose, 0, 230); marks.push({ label: mine.name, x: mx, z: mz }); }
  for (const pin of pins.list()) marks.push({ ...pin, color: '#c9a35a' });
  if (flyTo) marks.push({ label: flyTo.label, x: flyTo.x, z: flyTo.z, color: '#b8442e' });
  let near = null, nd = Infinity;
  others.each((c, id, pos) => { const d = Math.hypot(pos[0] - glide.pos[0], pos[2] - glide.pos[2]); if (d < nd) { nd = d; near = { label: others.nameOf(id) ?? 'traveller', x: pos[0], z: pos[2], color: '#16100e' }; } });
  if (near) marks.push(near);
  const pl = place && !place.handbit ? { code: 'WATER', name: 'on the rivers', hand: place.hand.name, owner: !place.hand.founder, charted: true, count: chart.count(place.hand.id), total: place.hand.data.handbits.length } : place && { code: place.handbit.code, name: summitOf(place.hand, place.handbit) ?? nameOf(place.hand, place.handbit), hand: place.hand.name, owner: !place.hand.founder, charted: chart.has(place.hand.id, place.index), count: chart.count(place.hand.id), total: place.hand.data.handbits.length };
  hud.update(dt, { show: started && mode === 'fly', yaw: glide.yaw, pos: glide.pos, altitude: glide.pos[1] - groundAt(glide.pos[0], glide.pos[2]), place: pl, markers: marks, active: Math.abs(want.turn) + Math.abs(want.climb) > 0.1 || !!braiding });
  // the greeting: near another player your swarms braid for a few seconds
  braidList.length = 0;
  others.each((c, id, pos) => braidList.push({ id, pos, c }));
  const b = started && mode === 'fly' ? braid.update(dt, glide.pos, braidList) : null;
  if (b && b.id !== braiding?.id) panel.say(`You met ${others.nameOf(b.id) ?? 'a traveller'}`, 4);
  braiding = b;
  const other = b && braidList.find((o) => o.id === b.id);
  creature.pull(other && !CALM ? other.pos : null, b ? b.k * 0.6 : 0);
  for (const o of braidList) o.c.pull(other === o && !CALM ? glide.pos : null, other === o ? b.k * 0.6 : 0);
  // the camera chases the creature: behind and above it, easing after its turns (never rolling)
  const f = glide.forward(), follow = 1 - Math.exp(-dt * 3);
  const cx = glide.pos[0] - f[0] * CHASE.back, cz = glide.pos[2] - f[2] * CHASE.back;
  chase.pos.lerp(tmpChase.set(cx, Math.max(glide.pos[1] + CHASE.up, groundAt(cx, cz) + 20), cz), follow);
  chase.yaw += Math.atan2(Math.sin(glide.yaw - chase.yaw), Math.cos(glide.yaw - chase.yaw)) * follow;
  rig.position.copy(chase.pos);
  rig.rotation.y = chase.yaw;
  if (!renderer.xr.isPresenting) {
    // on a screen you feel the speed: the view widens, banks into your turns and trembles when you are
    // flat out (never in the headset: comfort; there the land and the streaks rushing past do it)
    const r = rush(), shake = 0.004 * r * r;
    camera.rotation.set(look.pitch + shake * Math.sin(t * 71), look.yaw + shake * Math.sin(t * 53 + 1), -0.14 * steer.turn * (0.5 + 0.5 * r), 'YXZ');
    const fov = 65 + 30 * r;
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 2.5));
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
  // speed lines: streaks fixed in the air round you, drawn along your motion; there from cruise on, and
  // longer and bolder the faster you go, so the air itself rushes past (this is what a headset shows of speed)
  const fast = 0.3 + 0.7 * rush(), vel = tmpChase.set(f[0] * Math.cos(glide.pitch), Math.sin(glide.pitch), f[2] * Math.cos(glide.pitch)).multiplyScalar(glide.speed);
  streakInk.begin();
  for (const p of streaks) {
    const rel = p.clone().sub(chase.pos);
    if (!Number.isFinite(p.x) || rel.dot(vel) < -40 * glide.speed || rel.length() > Math.max(900, glide.speed * 3.5)) { // behind you or lost: put it ahead again
      const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 130, ahead = glide.speed * (0.8 + Math.random() * 2.2);
      const sx = chase.pos.x + f[0] * ahead + Math.cos(a) * r * f[2], sz = chase.pos.z + f[2] * ahead - Math.cos(a) * r * f[0];
      p.set(sx, Math.max(chase.pos.y + Math.sin(a) * r * 0.6 - 20, groundAt(sx, sz) + 4), sz); // in the air, never under the land
    }
    streakInk.segment(p, p.clone().addScaledVector(vel, -0.04 - 0.11 * rush()), fast, 0);
  }
  streakInk.end();

  world.shared.uTime.value = t;
  // the terrain's detail centres on your eyes; the headset camera's pose is in the rig's space
  rig.updateMatrixWorld();
  if (mode === 'atelier' && renderer.xr.isPresenting) poke();
  atlasFrame(dt);
  // reading your hand in your own room: only the card and your hands; the world comes back after
  const room = mode === 'atelier' && inRoom;
  world.sky.visible = !room;
  surface.meshes.forEach((m) => (m.visible = !room));
  ink.mesh.visible = streakInk.mesh.visible = !room;
  dim.visible = !inRoom;
  if (mode === 'merge') {
    ghosts.update(camera.getWorldPosition(tmpChase));
    // by hand: a palm held down holds the ghost it points at; push it 8 cm lower to lay your Hand there
    const h = xrHands.find((q) => q.handedness === 'right' && q.frame) ?? xrHands.find((q) => q.frame);
    if (renderer.xr.isPresenting && h) {
      const r = push.update(h.frame, dt);
      if (push.holding) {
        raycaster.ray.origin.fromArray(h.frame.center).applyMatrix4(rig.matrixWorld);
        raycaster.ray.direction.fromArray(h.frame.forward).applyQuaternion(rig.quaternion).normalize();
        const i = ghosts.aim(raycaster.ray.origin, raycaster.ray.direction);
        if (i >= 0 && i !== ghosts.selected) ghosts.select(i);
      }
      if (r === 'push') choose(ghosts.selected);
    }
  }
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
// the front door's live counts, refreshed while it shows
const live = document.getElementById('live');
const fmt = (n) => n.toLocaleString('en');
async function showStats() {
  if (!banner.classList.contains('hidden')) {
    const st = await net.stats();
    live.textContent = st ? `${fmt(st.hands)} Hands · ${fmt(st.flying)} flying now` : '';
  }
  setTimeout(showStats, 15000);
}
showStats();

// read-only peek for tests and curious players
window.__pwc = {
  get state() {
    return { hands: hands.length, pos: glide.pos.map(Math.round), yaw: +glide.yaw.toFixed(2), fps: Math.round(fps), scribbles: knots.length + creature.strands, started, webcam: webcam ? webcam.update().map((q) => q.handedness) : null, steering: xrHands.some((q) => q.engaged), palm: xrHands.map((q) => q.frame && q.frame.normal.map((v) => +v.toFixed(2))), hand: xrHands.map((q) => q.frame && { point: q.frame.forward.map((v) => +v.toFixed(2)), open: +q.frame.extension.toFixed(2), height: +q.frame.center[1].toFixed(2) }), speed: Math.round(glide.speed), calls: renderer.info.render.calls, xr: renderer.xr.isPresenting, lod: surface.centre.map(Math.round), patches: surface.patches, mode, mine: mine?.name ?? null, braid: braiding, atlas: { tab: atlas.tab, selected: selected?.name ?? null }, online, others: others.count, pending: !!mine?.pending, room: roomState };
  },
  atelier: { act: (a) => act(a), get flow() { return flow; }, choose: (i) => choose(i) },
  // where things are in your own space (the rig's), for the film script (tools/film.mjs)
  space: {
    head: () => headLocal.toArray(),
    tip: (i) => (xrHands[i].frame ? xrHands[i].store['index-finger-tip'].slice() : null),
    card: () => (atelier.isOpen ? { pos: atelier.mesh.position.toArray(), quat: atelier.mesh.quaternion.toArray() } : null),
    toRig: (x, y, z) => rig.worldToLocal(new THREE.Vector3(x, y, z)).toArray(),
    fits: () => ghosts.fits.map((f) => [f.centre[0], groundAt(...f.centre), f.centre[1]]),
  },
  net,
};
