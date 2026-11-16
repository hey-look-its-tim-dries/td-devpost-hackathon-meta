// src/garden/game.js
// Bloom, the gardening game on top of the flying: gather seeds from clouds on the wind, plant groves
// on the Hands' sand, skim a river for water and pour it over groves so they grow, clear what died,
// race everyone to the golden seed. What you plant is on the shared map for all to see, water and
// build on; plots bloom, and wildlife moves in. This file wires the pure rules (garden, pouch, drift)
// to the map, the renderers and the flight; main.js calls frame() and act().
import { SPECIES, FLORA, FUNGI, STARTERS } from './species.js';
import { createFoxfire, wildMushroom } from './foxfire.js';
import { createGarden, habitatOf, vigour, UNITS, LEVELS } from './garden.js';
import { hyperReady } from './hints.js';
import { createPouch } from './pouch.js';
import { clouds, golden, storm, stormDried } from './drift.js';
import { paintHerbarium } from './herbarium.js';
import { bouquet, motes } from './bouquet.js';
import { createFlora, TILE } from './flora.js';
import { toWorld, toHand } from '../world/founders.js';
import { WORLD } from '../world/units.js';
import { whereAt } from '../world/where.js';
import { rng } from '../hand/dna.js';

const PLANT_ALT = 320, WATER_ALT = 140, REACH = 120 / WORLD; // how low you plant and fill; how near a grove you tend (Hand units)
const GRID = TILE / WORLD; // pixel species snap to this grid (Hand units; 90 m), so their tiles join into mosaics
const TIER = (level) => (level >= 6 ? 3 : level >= 3 ? 2 : 1); // the rarity your level lets you gather (legends: the golden seed)
const HYPER = { seconds: 10, tile: 30, spacing: 14 }; // a hyper sow: ten seconds of single plants along your path, 14 m apart (pixel kinds: one a 30 m tile)
const BLOOM = ['bare sand', 'first bloom', 'meadow', 'garden', 'full bloom'];

export function createBloom({ scene, shared, storage, net, hands, groundAt, say, stamp, online, onDeco, byHand = () => false }) { // byHand: playing with hands (the headset), for the wording of hints
  const garden = createGarden(SPECIES), pouch = createPouch(storage, SPECIES, STARTERS), flora = createFlora(SPECIES, FLORA.concat(FUNGI), shared), fox = createFoxfire();
  // while the foxfire lasts everything you earn counts for more (twice, and more as you chain mushrooms)
  const credit = (what) => { let up = false; for (let i = fox.mult(Date.now()); i > 0; i--) up = pouch.credit(what) || up; return up; };
  scene.add(flora.group);
  const handOf = (id) => hands.find((h) => h.id === id && h.data?.cells && (h.rise ?? 1) >= 1);
  const waiting = []; // groves whose Hand has not risen here yet
  const levels = new Map(); // "hand:bit" -> bloom level last seen, to notice a bloom
  const taken = new Set(); // clouds you gathered
  const goldTaken = new Set(); // golden rounds someone has won
  let fauna = null, dirty = true, tick = 0, slow = 0, tempId = -1, top = [], worldPlants = 0, lastPlant = 0, lastTend = 0, lastPollen = 0, drift = [], gold = null, plotsKey = '', wet = false;
  let near = [], every = []; // blooming plots near you (the radar, the wildlife) and all of them (the atlas)
  let sand = null, sandSaid = -1, anchorsNow = []; // the sandstorm now, the last one announced, the Hands' centres
  const herb = { kind: 'flower', page: 0 }; // what the herbarium tab shows
  let moteKey = '', moteList = [];
  const counts = { sown: 0, tends: 0, clouds: 0, eaten: 0 }; // what you did, for whoever is counting (the gnomes' side quests)
  const bq = { total: -1, list: [] };
  const loaded = new Map(); // Hand id -> when its groves were last read from the map
  let charge = 1, hyperUntil = 0, lastSprig = null, flushAt = 0; // the hyper sow: its charge (the first is free), when it ends, where the last sprig fell
  const queue = []; // sprigs sown and not yet sent
  const fill = (k) => { const was = charge; charge = Math.min(1, charge + k); if (was < 1 && charge >= 1) say(hyperReady(byHand()), 5); };
  let t = 0; // game seconds, for the pop when something grows

  // a grove's place in the world: under its Hand's pose, on the land
  function locate(p) {
    const h = handOf(p.hand);
    if (!h) return false;
    const [wx, wz] = toWorld(h.pose, p.x, p.y);
    p.wx = wx; p.wz = wz; p.wy = groundAt(wx, wz); p.rot = -h.pose.rot;
    p.tile = p.big === 2 ? HYPER.tile : TILE;
    const c = Math.cos(p.rot), s = Math.sin(p.rot), half = p.tile / 2;
    p.hs = []; // the land at a 3 by 3 grid over its tile (row by row from -z), so the mosaic bends with it
    for (let iz = -1; iz <= 1; iz++) for (let ix = -1; ix <= 1; ix++) p.hs.push(groundAt(wx + (ix * c + iz * s) * half, wz + (iz * c - ix * s) * half));
    // where its flowers or trees stand, the same for everyone and never in the water: the first is the grove's own spot
    const onSand = (x, z) => !!whereAt(hands, x, z)?.handbit, r = rng((Math.round(p.x * 10) * 73856093) ^ (Math.round(p.y * 10) * 19349663) ^ (p.sp * 83492791)), spread = p.big === 2 ? 0 : SPECIES[p.sp]?.kind === 'tree' ? 75 : 42;
    p.spots = [];
    for (let i = 0; i < 30; i++) { const a = r() * Math.PI * 2, d = i ? Math.sqrt(r()) * spread : 0, x = wx + Math.cos(a) * d, z = wz + Math.sin(a) * d, k = 0.75 + 0.5 * r(), turn = r() * Math.PI; if (!i || onSand(x, z)) p.spots.push([x, groundAt(x, z), z, k, turn]); }
    // the quarters of its mosaic tile that lie on sand (row by row from -z)
    p.dryQ = [];
    for (let qz = 0; qz < 2; qz++) for (let qx = 0; qx < 2; qx++) { const lx = (qx - 0.5) * half, lz = (qz - 0.5) * half; p.dryQ.push(onSand(wx + lx * c + lz * s, wz + lz * c - lx * s)); }
    if (p.hab === 'bank') for (let k = 0; k < 8 && !p.water; k++) { const a = k * Math.PI / 4, x = wx + Math.cos(a) * 60, z = wz + Math.sin(a) * 60, w = whereAt(hands, x, z); if (w && !w.handbit) p.water = [x, z]; }
    p.dry = Math.max({ fresh: 0, dry: 1, dead: 2 }[vigour(p, Date.now())], stormDried(wx, wz, p.tended, Date.now(), anchorsNow) ? 1 : 0);
    return true;
  }
  function add(p, pop = false) {
    if (garden.get(p.id)) return false;
    if (!locate(p)) { waiting.push(p); return false; }
    if (!garden.add(p)) return false;
    p.pop = pop ? t : -99;
    dirty = true;
    return true;
  }
  const remove = (id) => { if (garden.remove(id)) dirty = true; };
  function grown(id, stage, tended) {
    const p = garden.get(id);
    if (!p) return;
    if (stage === p.stage && tended === p.tended) return;
    if (stage !== p.stage || p.dry) p.pop = t;
    garden.tend(id, stage, tended); p.dry = 0; dirty = true;
  }
  // The garden is read Hand by Hand as you come near (and again every five minutes): however many Hands the world
  // has, you only ever hold the groves of the ones around you. What others plant meanwhile arrives through the room.
  let ready = false, topAt = 0;
  // The pouch is kept on the map too (by device, or by account once signed in): it comes back when the map holds
  // more than this device, and goes up every twenty seconds when it has changed.
  let synced = '', syncAt = 0;
  const mark = () => `${pouch.xp}:${pouch.plantedTotal}:${pouch.total}:${pouch.found.size}`;
  const took = (data, words) => { if (pouch.adopt(data)) { bq.total = -1; onDeco?.(pouch.signature()); say(words, 5); } synced = mark(); };
  const load = () => { ready = true; refreshTop(); net.profileGet().then((r) => { if (r) took(r.data, 'Your garden came back from the map'); }); };
  async function signIn(accessToken) {
    const r = await net.loginFacebook(accessToken);
    if (r.error) return say(`Facebook sign-in failed: ${r.error}`, 6);
    took(r.data, 'Signed in: the garden of your account came with you');
    say('Signed in with Facebook: your garden follows you to every device', 6);
    synced = ''; // and what this device holds goes up
  }
  async function readHand(h) {
    const asked = Date.now();
    loaded.set(h.id, asked);
    const r = await net.plants(h.id);
    if (!r) return loaded.delete(h.id);
    const now = new Set(r.plants.map((p) => p.id));
    // cleared while you were away; but never what was planted or watered while this answer was on its way (the room told us)
    for (const p of [...garden.all()]) if (p.hand === h.id && p.id > 0 && !now.has(p.id) && p.tended < asked - 5000) remove(p.id);
    for (const p of r.plants) { const q = garden.get(p.id); if (q) grown(p.id, p.stage, p.tended); else add(p); }
  }
  const refreshTop = () => { if (!online()) return; net.plants().then((r) => { if (r) top = r.top; }); net.stats().then((st) => { if (st?.plants !== undefined) worldPlants = st.plants; }); };

  // ---- what the room says ----
  function onGarden(m) {
    if (m.planted) { if (add(m.planted, true)) worldPlants++; }
    if (m.plantedMany) for (const p of m.plantedMany) if (add(p, true)) worldPlants++;
    if (m.tended) grown(...m.tended);
    if (m.uprooted !== undefined) { remove(m.uprooted); worldPlants = Math.max(0, worldPlants - 1); }
    if (m.golden) { goldTaken.add(m.golden.epoch); say(`${m.golden.name} caught the golden seed`, 5); }
    if (m.bloomed) say(`A plot of ${m.bloomed.hand} came into bloom`, 5);
  }

  // ---- what you do ----
  function plant(ctx) {
    const { place, pos, braiding } = ctx;
    if (!place?.handbit) return say(place ? 'Seeds need sand: plant beside the river, not in it' : 'Plant on a Hand: the wilderness will not hold a seed', 3);
    if (pos[1] - groundAt(pos[0], pos[2]) > PLANT_ALT) return say('Fly lower to plant', 2.5);
    if (garden.full(place.hand.id, place.index)) return say(`${place.handbit.name} is full: water it, or plant the next plot`, 3);
    const sp = pouch.take();
    if (sp === null) return say('Your pouch is empty: fly through a seed cloud', 3);
    let [x, y] = toHand(place.hand.pose, pos[0], pos[2]);
    if (flora.styleOf(sp) === 'pixel') { // onto the mosaic grid, unless that would put it in the water or on another handbit
      const sx = Math.round(x / GRID) * GRID, sy = Math.round(y / GRID) * GRID, w = whereAt(hands, ...toWorld(place.hand.pose, sx, sy));
      if (w?.handbit && w.index === place.index) { x = sx; y = sy; }
    }
    const [wx, wz] = toWorld(place.hand.pose, x, y);
    const nearWater = [0, 1, 2, 3].some((k) => { const w = whereAt(hands, wx + Math.cos(k * 1.57) * 55, wz + Math.sin(k * 1.57) * 55); return w && !w.handbit; });
    const p = { id: tempId--, hand: place.hand.id, bit: place.index, x, y, sp, stage: 0, tended: Date.now(), big: braiding ? 1 : 0, hab: habitatOf(place.handbit.code, nearWater) };
    if (!add(p, true)) { pouch.giveBack(sp); return; }
    pouch.planted(sp);
    const up = credit('plant'); counts.sown++;
    fill(0.03);
    worldPlants++;
    onDeco?.(pouch.signature());
    if (up) stamp(`Gardener level ${pouch.level}`, TIER(pouch.level) > TIER(pouch.level - 1) ? 'rarer seeds will come to you now' : 'your whorl grows', 'GARDENER');
    if (!online()) return;
    net.plant(p).then((r) => {
      remove(p.id);
      if (r.id) { if (!garden.get(r.id)) add({ ...p, id: r.id, tended: r.tended }); else worldPlants--; const q = garden.get(r.id); if (q) q.pop = p.pop; }
      else { worldPlants--; pouch.giveBack(sp); if (r.error === 'full') say('That plot is full', 3); }
    });
  }
  // Scatter: the sowing sweep. Five groves at once, fanned to the side you swept, or cast far ahead when you
  // threw forward. A seed each; they go to the map as one batch.
  function scatter(ctx, dir) {
    const { pos, forward: f } = ctx, side = dir === 'left' ? -1 : 1, sent = [];
    if (pos[1] - groundAt(pos[0], pos[2]) > PLANT_ALT) return say('Fly lower to sow', 2.5);
    for (let i = 0; i < 5; i++) {
      const along = dir === 'forward' ? 160 + i * 110 : 60 + i * 25, across = dir === 'forward' ? (i - 2) * 45 : side * (90 + i * 70);
      const wx = pos[0] + f[0] * along - f[2] * across, wz = pos[2] + f[2] * along + f[0] * across, w = whereAt(hands, wx, wz);
      if (!w?.handbit || garden.full(w.hand.id, w.index)) continue;
      const sp = pouch.take();
      if (sp === null) break;
      const [x, y] = toHand(w.hand.pose, wx, wz), p = { id: tempId--, hand: w.hand.id, bit: w.index, x, y, sp, stage: 0, tended: Date.now(), big: 0, hab: habitatOf(w.handbit.code, false) };
      if (!add(p, true)) { pouch.giveBack(sp); continue; }
      pouch.planted(sp); credit('plant'); counts.sown++; fill(0.03); worldPlants++; sent.push(p);
    }
    if (!sent.length) return say(pouch.total ? 'Nothing but water and wilderness there: scatter over a Hand' : 'Your pouch is empty: fly through a seed cloud', 3);
    ctx.burst?.();
    onDeco?.(pouch.signature());
    if (online()) net.plantMany(sent).then((r) => sent.forEach((p, i) => { remove(p.id); const id = r.ids?.[i]; if (id && !garden.get(id)) { add({ ...p, id, tended: r.tended }); const q = garden.get(id); if (q) q.pop = p.pop; } else { worldPlants--; if (!id) pouch.giveBack(p.sp); } }));
  }
  // Pour: a palm pressed down empties water over the groves around you (up to three), like a watering can
  function pour(ctx) {
    const { pos, place } = ctx, now = Date.now();
    if (!place || !pouch.water) return say(place ? 'No water: skim a river first' : 'Pour over a Hand', 2.5);
    const [x, y] = toHand(place.hand.pose, pos[0], pos[2]), near = [...garden.all()].filter((p) => p.hand === place.hand.id && p.id > 0 && (p.stage < 3 || p.dry > 0) && now - p.tended > 1500 && Math.hypot(p.x - x, p.y - y) < REACH * 2).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y)).slice(0, 3);
    if (!near.length) return say('Nothing thirsty here', 2);
    for (const p of near) { if (!pouch.pour()) break; (online() ? net.tend(p.id) : Promise.resolve({ stage: Math.min(3, p.stage + 1), tended: now })).then((r) => { if (!r.error) { grown(p.id, r.stage, r.tended); credit('tend'); counts.tends++; fill(0.1); } }); }
    say(`Poured over ${near.length} grove${near.length > 1 ? 's' : ''}`, 2);
  }
  function uproot(ctx) {
    const { place, pos } = ctx;
    if (!place) return;
    const [x, y] = toHand(place.hand.pose, pos[0], pos[2]), p = garden.nearest(place.hand.id, x, y, REACH);
    if (!p) return say('Nothing here to clear', 2);
    const dead = vigour(p, Date.now()) === 'dead';
    const done = () => { remove(p.id); worldPlants = Math.max(0, worldPlants - 1); if (dead) { pouch.gather(p.sp, 2); credit('clear'); say(`Cleared a dead grove: two ${SPECIES[p.sp].name} seeds from the compost`, 3); } else say(`Uprooted ${SPECIES[p.sp].name}`, 2.5); };
    if (p.id < 0 || !online()) return done();
    net.uproot(p.id).then((ok) => (ok ? done() : say('Not yours to clear: only its planter, the owner of this Hand, or anyone once it is dead', 4)));
  }

  // ---- every frame ----
  function frame(dt, ctx) {
    t += dt;
    flora.update(t);
    const { pos, place, flying } = ctx, now = Date.now(), alt = pos[1] - groundAt(pos[0], pos[2]);
    // the hyper sow: for ten seconds single plants fall along your path, free, in the kind you chose
    const hyper = performance.now() < hyperUntil;
    if (hyper && flying && place?.handbit && alt < PLANT_ALT && pouch.total) {
      const sp = pouch.has(pouch.selected) ? pouch.selected : pouch.carried()[0], pixel = flora.styleOf(sp) === 'pixel', step = pixel ? HYPER.tile : HYPER.spacing;
      let [x, y] = toHand(place.hand.pose, pos[0], pos[2]);
      if (pixel) { const q = HYPER.tile / WORLD; x = Math.round(x / q) * q; y = Math.round(y / q) * q; }
      const [wx, wz] = toWorld(place.hand.pose, x, y), w = whereAt(hands, wx, wz);
      if (w?.handbit && w.index === place.index && (!lastSprig || Math.hypot(wx - lastSprig[0], wz - lastSprig[1]) >= step * 0.99) && !garden.full(place.hand.id, place.index, 1)) {
        lastSprig = [wx, wz];
        const p = { id: tempId--, hand: place.hand.id, bit: place.index, x, y, sp, stage: 0, tended: now, big: 2, hab: habitatOf(place.handbit.code, false) };
        if (add(p, true)) { pouch.planted(sp); credit('sprig'); worldPlants++; queue.push(p); }
      }
    }
    if (queue.length && (queue.length >= 40 || performance.now() > flushAt)) {
      flushAt = performance.now() + 550;
      const sent = queue.splice(0, 40);
      onDeco?.(pouch.signature());
      if (online()) net.plantMany(sent).then((r) => sent.forEach((p, i) => {
        remove(p.id);
        const id = r.ids?.[i];
        if (id && !garden.get(id)) { add({ ...p, id, tended: r.tended }); const q = garden.get(id); if (q) q.pop = p.pop; } else worldPlants--;
      }));
    }
    if ((tick += dt) >= 0.25 && flying) {
      tick = 0;
      // water: skim a river
      if (place && !place.handbit && alt < WATER_ALT) { if (pouch.water < 5) { pouch.fill(); say('Water gathered: fly low over groves to pour it', 3); } wet = true; } else wet = false;
      // tend and gather pollen: the grove under you
      if (place && alt < PLANT_ALT) { // over sand or over the water beside it: bank groves are tended from the river too
        const [x, y] = toHand(place.hand.pose, pos[0], pos[2]);
        const thirsty = pouch.water > 0 && now - lastTend > 500 && garden.nearest(place.hand.id, x, y, REACH, (p) => p.id > 0 && p.dry !== 2 && (p.stage < 3 || p.dry === 1) && now - p.tended > 1500); // not the dead: they are the mushrooms' and the gnomes' now; a deliberate pour (T) revives them
        if (thirsty) {
          lastTend = now; pouch.pour();
          const was = thirsty.dry;
          (online() ? net.tend(thirsty.id) : Promise.resolve({ stage: Math.min(3, thirsty.stage + 1), tended: now })).then((r) => {
            if (r.error) return;
            grown(thirsty.id, r.stage, r.tended);
            credit('tend'); counts.tends++; fill(0.1);
            say(was ? `Revived ${SPECIES[thirsty.sp].name}` : r.stage === 3 ? `${SPECIES[thirsty.sp].name} is in flower` : `Watered ${SPECIES[thirsty.sp].name}`, 2);
          });
        } else if (now - lastPollen > 2500) {
          const ripe = garden.nearest(place.hand.id, x, y, REACH, (p) => p.stage === 3 && !p.dry);
          if (ripe && SPECIES[ripe.sp].rarity <= TIER(pouch.level)) { lastPollen = now; if (pouch.gather(ripe.sp, 1)) discovered(ripe.sp); }
        }
      }
      // mushrooms: fly low through one and you eat it. Wild ones grow on dead groves; planted ones fruit in flower
      // (stage 3). The foxfire comes over the world, you get two of its spores to plant, and it fruits again in five minutes.
      if (place && alt < PLANT_ALT) {
        const [mx, my] = toHand(place.hand.pose, pos[0], pos[2]);
        const shroom = garden.nearest(place.hand.id, mx, my, REACH, (p) => p.id > 0 && fox.canEat(p.id, now) && (p.dry === 2 || (SPECIES[p.sp]?.kind === 'mushroom' && p.stage === 3 && !p.dry)));
        if (shroom) {
          const kind = wildMushroom(shroom, FUNGI) ?? shroom.sp, k = fox.eat(now);
          counts.eaten++;
          fox.ate(shroom.id, now);
          if (pouch.gather(kind, 2)) discovered(kind);
          ctx.burst?.();
          if (k === 1) stamp('Foxfire', `you ate ${SPECIES[kind].name}: the world glows, and everything counts double`, 'MUSHROOM');
          else say(`${SPECIES[kind].name}: chain x${k + 1}, ${fox.left(now)} s of foxfire`, 3);
        }
      }
      // the seed clouds and the golden seed
      for (const c of drift) if (!taken.has(c.id) && Math.hypot(c.x - pos[0], c.y - pos[1], c.z - pos[2]) < 130) {
        taken.add(c.id);
        const s = SPECIES[c.sp];
        if (s.rarity > TIER(pouch.level)) { say(`${s.name} is too rare for you yet: garden to level ${s.rarity === 2 ? 3 : 6}`, 4); continue; }
        const fresh = pouch.gather(c.sp, c.n * fox.mult(now)); credit('gather'); counts.clouds++; fill(0.25 * fox.mult(now)); ctx.burst?.();
        if (fresh) discovered(c.sp); else say(`${c.n} ${s.name} seeds`, 2.5);
      }
      if (gold && !goldTaken.has(gold.epoch) && Math.hypot(gold.x - pos[0], gold.y - pos[1], gold.z - pos[2]) < 170) {
        const g = gold;
        goldTaken.add(g.epoch);
        (online() ? net.claimGolden(g.epoch) : Promise.resolve({ won: true })).then((r) => {
          if (r && !r.won) return say(`${r.name} reached the golden seed first`, 4);
          pouch.gather(g.sp, g.n); credit('golden'); fill(1); ctx.burst?.();
          stamp('The golden seed', `${g.n} seeds of ${SPECIES[g.sp].name}, a legend`, 'FIRST THERE');
        });
      }
    }
    if ((slow += dt) >= 2) {
      slow = 0;
      for (let i = waiting.length - 1; i >= 0; i--) if (handOf(waiting[i].hand)) add(waiting.splice(i, 1)[0]); // Hands that have risen since
      if (ready && now - topAt > 120000) { topAt = now; refreshTop(); } // the board and the world's count, every two minutes (a crowd asking every 30 s was most of the map's traffic)
      if (ready && online() && now - syncAt > 20000 && mark() !== synced) { syncAt = now; const m = mark(); net.profilePut(pouch.dump()).then((ok) => { if (ok) synced = m; }); }
      if (ready && online()) for (const h of hands) { if (!h.pose || !h.data?.cells || (h.rise ?? 1) < 1) continue; const [hx, hz] = toWorld(h.pose, 0, 230); if (Math.hypot(hx - pos[0], hz - pos[2]) < 9000 && now - (loaded.get(h.id) ?? 0) > 300000) readHand(h); }
      const anchors = hands.filter((h) => h.pose).map((h) => { const [x, z] = toWorld(h.pose, 0, 230); return { id: h.id, x, z }; });
      const lift = (c) => ({ ...c, y: groundAt(c.x, c.z) + c.up });
      drift = clouds(now, anchors, SPECIES, FLORA).filter((c) => Math.hypot(c.x - pos[0], c.z - pos[2]) < 5000).map(lift);
      const g = golden(now, anchors, SPECIES, FLORA);
      gold = g && lift(g);
      anchorsNow = anchors;
      sand = storm(now, anchors);
      if (sand && sand.epoch !== sandSaid) { sandSaid = sand.epoch; if (ctx.flying) say('A sandstorm is crossing the world: water what it parches', 7); }
      for (const p of garden.all()) { const d = Math.max({ fresh: 0, dry: 1, dead: 2 }[vigour(p, now)], stormDried(p.wx, p.wz, p.tended, now, anchors) ? 1 : 0); if (d !== p.dry) { p.dry = d; dirty = true; } }
      blooms(ctx);
    }
    if (dirty || flora.moved(pos)) { dirty = false; flora.rebuild(garden.all(), pos, groundAt); }
  }
  // a new kind for your herbarium: a line on your panel (in a full garden they come every few seconds); the stamp
  // is for the round numbers
  function discovered(sp) {
    credit('discover');
    const n = pouch.found.size;
    if (n === 10 || n % 25 === 0) stamp(`${n} kinds in your herbarium`, `the newest: ${SPECIES[sp].name} · ${n} of ${SPECIES.length} found`, 'HERBARIUM');
    else say(`New in your herbarium: ${SPECIES[sp].name} (${SPECIES[sp].latin}) · ${n} of ${SPECIES.length}`, 3.5);
  }

  // plots near you: notice blooms, and tell the wildlife where to live
  function blooms(ctx) {
    const now = Date.now(), plots = [];
    every = [];
    for (const { hand, bit } of garden.plotKeys()) {
      const h = handOf(hand), hb = h?.data.handbits[bit];
      if (!hb) continue;
      const pl = garden.plot(hand, bit, now), k = `${hand}:${bit}`, before = levels.get(k);
      levels.set(k, pl.level);
      if (before !== undefined && pl.level > before) { if (pl.level === 4) stamp(`${hb.name} is in full bloom`, `${h.name} · ${pl.kinds.size} kinds`, 'FULL BLOOM'); else say(`${hb.name} of ${h.name}: ${BLOOM[pl.level]}`, 3.5); credit('bloom'); }
      if (!pl.level) continue;
      const [x, z] = toWorld(h.pose, hb.cx, hb.cy);
      every.push({ x, z, level: pl.level });
      if (Math.hypot(x - ctx.pos[0], z - ctx.pos[2]) > 6000) continue;
      const hab = /^[TIMRL]1$/.test(hb.code) ? 'ridge' : pl.bank * 3 >= pl.n ? 'bank' : 'dune';
      const water = garden.groves(hand, bit).filter((p) => p.water).slice(0, 6).map((p) => p.water);
      const list = garden.fauna(hand, bit, hab, pl.level);
      for (const id of list) if (ctx.near(x, z, 500) && pouch.see(id)) say(`You met a ${SPECIES[id].name}`, 3);
      plots.push({ x, z, r: 380, level: pl.level, fauna: list, water });
    }
    const key = JSON.stringify(plots.map((p) => [Math.round(p.x), Math.round(p.z), p.level, p.water.length]));
    near = plots;
    if (fauna && key !== plotsKey) { plotsKey = key; fauna.set(plots); }
  }

  return {
    // your bouquet: every kind you sowed, in order, as ornaments for your whorl; made again only when you have sown more
    bouquet() { if (bq.total !== pouch.plantedTotal) { bq.total = pouch.plantedTotal; bq.list = bouquet(pouch.log(), { strands: 24 }); } return bq.list; },
    counts,
    // a gnome's thanks: three seeds of some flower or tree, a boost to the hyper sow, and experience
    gift() { const pool = FLORA.filter((id) => SPECIES[id].rarity <= 3), id = pool[Math.floor(Math.random() * pool.length)]; pouch.gather(id, 3); credit('bloom'); fill(0.5); return { id, name: SPECIES[id].name }; },
    foxfire: fox, // the glowing state mushrooms bring: main.js turns the world by foxfire.level(Date.now())
    garden, pouch, flora, species: SPECIES, onGarden, load, signIn, handsRead: () => loaded.size, plots: () => near, allPlots: () => every, storm: () => sand,
    // the atlas's Garden tab: the herbarium; taps choose a kind, a page, or the seed to sow
    herbarium: { paint: (g, regions, tools) => { const r = paintHerbarium(g, regions, tools, { species: SPECIES, found: pouch.found, has: pouch.has, icon: flora.icon, style: flora.styleOf, selected: pouch.selected, ...herb }); herb.page = r.page; } },
    herbariumDo(a) { if (a.type === 'kind') { herb.kind = a.arg; herb.page = 0; } else if (a.type === 'page') herb.page = Math.max(0, herb.page + (a.arg === 'next' ? 1 : -1)); else if (a.type === 'seed') { pouch.select(+a.arg); say(`Sowing ${SPECIES[+a.arg].name}`, 2); } },
    setFauna(f) { fauna = f; plotsKey = ''; },
    setTop(list) { top = list; },
    removeHand(id) { if (garden.removeHand(id)) dirty = true; },
    frame,
    // 'plant' | 'next' | 'prev' | 'uproot'
    act(what, ctx) {
      if (what === 'plant') { const now = performance.now(); if (now - lastPlant < 450) return; lastPlant = now; plant(ctx); }
      else if (what === 'next' || what === 'prev') { const id = pouch.next(what === 'next' ? 1 : -1); if (id !== null) say(`${SPECIES[id].name} · ${pouch.has(id)} seeds`, 2); }
      else if (what === 'uproot') uproot(ctx);
      else if (what.startsWith('scatter:')) scatter(ctx, what.slice(8));
      else if (what === 'pour') pour(ctx);
      else if (what === 'hyper') {
        if (performance.now() < hyperUntil) return;
        if (charge < 1) return say(`Hyper sow is ${Math.round(charge * 100)}% charged: water groves and catch seed clouds`, 3);
        if (!pouch.total) return say('Your pouch is empty: fly through a seed cloud first', 3);
        charge = 0; hyperUntil = performance.now() + HYPER.seconds * 1000; lastSprig = null;
        stamp('Hyper sow', `${HYPER.seconds} seconds: fly low over a Hand and draw with flowers`, 'BLOOM RUSH');
        ctx.burst?.();
      }
    },
    clouds: () => drift,
    gold: () => (gold && !goldTaken.has(gold.epoch) ? gold : null),
    taken: (id) => taken.has(id),
    refreshTop,
    // flecks for the seeds you carry, on your whorl (made again only when your pouch changes)
    motes(strands) { const key = `${pouch.total}:${pouch.carried().length}:${strands}`; if (key !== moteKey) { moteKey = key; moteList = motes(pouch.dump().seeds, { strands }); } return moteList; },
    // what the HUD shows of the garden
    hud(place) {
      const tNow = Date.now(), sel = SPECIES[pouch.selected], out = { fox: fox.active(tNow) ? { left: fox.left(tNow), mult: fox.mult(tNow) } : null, charge, hyper: Math.max(0, Math.ceil((hyperUntil - performance.now()) / 1000)), seeds: pouch.total, water: pouch.water, wet, level: pouch.level, xp: pouch.xp, found: pouch.found.size, of: SPECIES.length, planted: pouch.plantedTotal, plants: worldPlants, top,
        selected: pouch.total ? { id: sel.id, name: sel.name, n: pouch.has(sel.id), style: flora.styleOf(sel.id), icon: flora.icon(sel.id) } : null, plot: null };
      if (place?.handbit) {
        const pl = garden.plot(place.hand.id, place.index, Date.now()), next = LEVELS[pl.level];
        const counts = new Map();
        for (const p of garden.groves(place.hand.id, place.index)) counts.set(p.sp, (counts.get(p.sp) ?? 0) + 1);
        const [most, n] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
        out.plot = { n: garden.units(place.hand.id, place.index), cap: UNITS, level: pl.level, label: BLOOM[pl.level], progress: next ? Math.min(1, pl.score / next) : 1,
          title: !pl.n ? null : n * 10 >= pl.n * 7 ? `${SPECIES[most].name} field` : pl.kinds.size >= 5 ? 'wild meadow' : 'mixed garden',
          hint: !pl.n ? 'bare sand: plant here' : pl.level === 4 ? 'in full bloom' : pl.kinds.size < 3 ? 'plant more kinds' : 'water it to grow' };
      }
      return out;
    },
  };
}
