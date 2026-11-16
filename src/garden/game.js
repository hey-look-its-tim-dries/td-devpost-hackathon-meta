// src/garden/game.js
// Bloom, the gardening game on top of the flying: gather seeds from clouds on the wind, plant groves
// on the Hands' sand, skim a river for water and pour it over groves so they grow, clear what died,
// race everyone to the golden seed. What you plant is on the shared map for all to see, water and
// build on; plots bloom, and wildlife moves in. This file wires the pure rules (garden, pouch, drift)
// to the map, the renderers and the flight; main.js calls frame() and act().
import { SPECIES, FLORA, STARTERS } from './species.js';
import { createGarden, habitatOf, vigour, CAP, LEVELS } from './garden.js';
import { createPouch } from './pouch.js';
import { clouds, golden } from './drift.js';
import { createFlora, TILE } from './flora.js';
import { toWorld, toHand } from '../world/founders.js';
import { WORLD } from '../world/units.js';
import { whereAt } from '../world/where.js';

const PLANT_ALT = 320, WATER_ALT = 140, REACH = 120 / WORLD; // how low you plant and fill; how near a grove you tend (Hand units)
const GRID = TILE / WORLD; // pixel species snap to this grid (Hand units; 90 m), so their tiles join into mosaics
const TIER = (level) => (level >= 6 ? 3 : level >= 3 ? 2 : 1); // the rarity your level lets you gather (legends: the golden seed)
const BLOOM = ['bare sand', 'first bloom', 'meadow', 'garden', 'full bloom'];

export function createBloom({ scene, shared, storage, net, hands, groundAt, say, stamp, online, onDeco }) {
  const garden = createGarden(SPECIES), pouch = createPouch(storage, SPECIES, STARTERS), flora = createFlora(SPECIES, FLORA, shared);
  scene.add(flora.group);
  const handOf = (id) => hands.find((h) => h.id === id && h.data?.cells && (h.rise ?? 1) >= 1);
  const waiting = []; // groves whose Hand has not risen here yet
  const levels = new Map(); // "hand:bit" -> bloom level last seen, to notice a bloom
  const taken = new Set(); // clouds you gathered
  const goldTaken = new Set(); // golden rounds someone has won
  let fauna = null, dirty = true, tick = 0, slow = 0, tempId = -1, top = [], worldPlants = 0, lastPlant = 0, lastTend = 0, lastPollen = 0, drift = [], gold = null, plotsKey = '', wet = false;
  let near = []; // blooming plots near you, for the radar
  let t = 0; // game seconds, for the pop when something grows

  // a grove's place in the world: under its Hand's pose, on the land
  function locate(p) {
    const h = handOf(p.hand);
    if (!h) return false;
    const [wx, wz] = toWorld(h.pose, p.x, p.y);
    p.wx = wx; p.wz = wz; p.wy = groundAt(wx, wz); p.rot = -h.pose.rot;
    const c = Math.cos(p.rot), s = Math.sin(p.rot), half = TILE / 2;
    p.hs = [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([x, z]) => groundAt(wx + (x * c + z * s) * half, wz + (z * c - x * s) * half));
    if (p.hab === 'bank') for (let k = 0; k < 8 && !p.water; k++) { const a = k * Math.PI / 4, x = wx + Math.cos(a) * 60, z = wz + Math.sin(a) * 60, w = whereAt(hands, x, z); if (w && !w.handbit) p.water = [x, z]; }
    p.dry = { fresh: 0, dry: 1, dead: 2 }[vigour(p, Date.now())];
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
    if (stage !== p.stage || p.dry) p.pop = t;
    garden.tend(id, stage, tended); p.dry = 0; dirty = true;
  }
  async function load() {
    const r = await net.plants();
    if (!r) return;
    top = r.top;
    for (const p of r.plants) add(p);
    worldPlants = r.plants.length;
  }

  // ---- what the room says ----
  function onGarden(m) {
    if (m.planted) { if (add(m.planted, true)) worldPlants++; }
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
    if (flora.styleOf(sp) === 'pixel') { x = Math.round(x / GRID) * GRID; y = Math.round(y / GRID) * GRID; }
    const [wx, wz] = toWorld(place.hand.pose, x, y);
    const nearWater = [0, 1, 2, 3].some((k) => { const w = whereAt(hands, wx + Math.cos(k * 1.57) * 55, wz + Math.sin(k * 1.57) * 55); return w && !w.handbit; });
    const p = { id: tempId--, hand: place.hand.id, bit: place.index, x, y, sp, stage: 0, tended: Date.now(), big: braiding ? 1 : 0, hab: habitatOf(place.handbit.code, nearWater) };
    if (!add(p, true)) { pouch.giveBack(sp); return; }
    pouch.planted(sp);
    const up = pouch.credit('plant');
    worldPlants++;
    onDeco?.(pouch.deco());
    if (up) stamp(`Gardener level ${pouch.level}`, TIER(pouch.level) > TIER(pouch.level - 1) ? 'rarer seeds will come to you now' : 'your whorl grows');
    if (!online()) return;
    net.plant(p).then((r) => {
      remove(p.id);
      if (r.id) { if (!garden.get(r.id)) add({ ...p, id: r.id, tended: r.tended }); else worldPlants--; const q = garden.get(r.id); if (q) q.pop = p.pop; }
      else { worldPlants--; pouch.giveBack(sp); if (r.error === 'full') say('That plot is full', 3); }
    });
  }
  function uproot(ctx) {
    const { place, pos } = ctx;
    if (!place) return;
    const [x, y] = toHand(place.hand.pose, pos[0], pos[2]), p = garden.nearest(place.hand.id, x, y, REACH);
    if (!p) return say('Nothing here to clear', 2);
    const dead = vigour(p, Date.now()) === 'dead';
    const done = () => { remove(p.id); worldPlants = Math.max(0, worldPlants - 1); if (dead) { pouch.gather(p.sp, 2); pouch.credit('clear'); say(`Cleared a dead grove: two ${SPECIES[p.sp].name} seeds from the compost`, 3); } else say(`Uprooted ${SPECIES[p.sp].name}`, 2.5); };
    if (p.id < 0 || !online()) return done();
    net.uproot(p.id).then((ok) => (ok ? done() : say('Not yours to clear: only its planter, the owner of this Hand, or anyone once it is dead', 4)));
  }

  // ---- every frame ----
  function frame(dt, ctx) {
    t += dt;
    flora.update(t);
    const { pos, place, flying } = ctx, now = Date.now(), alt = pos[1] - groundAt(pos[0], pos[2]);
    if ((tick += dt) >= 0.25 && flying) {
      tick = 0;
      // water: skim a river
      if (place && !place.handbit && alt < WATER_ALT) { if (pouch.water < 5) { pouch.fill(); say('Water gathered: fly low over groves to pour it', 3); } wet = true; } else wet = false;
      // tend and gather pollen: the grove under you
      if (place && alt < PLANT_ALT) { // over sand or over the water beside it: bank groves are tended from the river too
        const [x, y] = toHand(place.hand.pose, pos[0], pos[2]);
        const thirsty = pouch.water > 0 && now - lastTend > 500 && garden.nearest(place.hand.id, x, y, REACH, (p) => p.id > 0 && (p.stage < 3 || p.dry > 0) && now - p.tended > 1500);
        if (thirsty) {
          lastTend = now; pouch.pour();
          const was = thirsty.dry;
          (online() ? net.tend(thirsty.id) : Promise.resolve({ stage: Math.min(3, thirsty.stage + 1), tended: now })).then((r) => {
            if (r.error) return;
            grown(thirsty.id, r.stage, r.tended);
            pouch.credit('tend');
            say(was ? `Revived ${SPECIES[thirsty.sp].name}` : r.stage === 3 ? `${SPECIES[thirsty.sp].name} is in flower` : `Watered ${SPECIES[thirsty.sp].name}`, 2);
          });
        } else if (now - lastPollen > 2500) {
          const ripe = garden.nearest(place.hand.id, x, y, REACH, (p) => p.stage === 3 && !p.dry);
          if (ripe && SPECIES[ripe.sp].rarity <= TIER(pouch.level)) { lastPollen = now; if (pouch.gather(ripe.sp, 1)) discovered(ripe.sp); }
        }
      }
      // the seed clouds and the golden seed
      for (const c of drift) if (!taken.has(c.id) && Math.hypot(c.x - pos[0], c.y - pos[1], c.z - pos[2]) < 130) {
        taken.add(c.id);
        const s = SPECIES[c.sp];
        if (s.rarity > TIER(pouch.level)) { say(`${s.name} is too rare for you yet: garden to level ${s.rarity === 2 ? 3 : 6}`, 4); continue; }
        const fresh = pouch.gather(c.sp, c.n); pouch.credit('gather'); ctx.burst?.();
        if (fresh) discovered(c.sp); else say(`${c.n} ${s.name} seeds`, 2.5);
      }
      if (gold && !goldTaken.has(gold.epoch) && Math.hypot(gold.x - pos[0], gold.y - pos[1], gold.z - pos[2]) < 170) {
        const g = gold;
        goldTaken.add(g.epoch);
        (online() ? net.claimGolden(g.epoch) : Promise.resolve({ won: true })).then((r) => {
          if (r && !r.won) return say(`${r.name} reached the golden seed first`, 4);
          pouch.gather(g.sp, g.n); pouch.credit('golden'); ctx.burst?.();
          stamp('The golden seed', `${g.n} seeds of ${SPECIES[g.sp].name}, a legend`);
        });
      }
    }
    if ((slow += dt) >= 2) {
      slow = 0;
      for (let i = waiting.length - 1; i >= 0; i--) if (handOf(waiting[i].hand)) add(waiting.splice(i, 1)[0]); // Hands that have risen since
      const anchors = hands.filter((h) => h.pose).map((h) => { const [x, z] = toWorld(h.pose, 0, 230); return { id: h.id, x, z }; });
      const lift = (c) => ({ ...c, y: groundAt(c.x, c.z) + c.up });
      drift = clouds(now, anchors, SPECIES, FLORA).filter((c) => Math.hypot(c.x - pos[0], c.z - pos[2]) < 5000).map(lift);
      const g = golden(now, anchors, SPECIES, FLORA);
      gold = g && lift(g);
      for (const p of garden.all()) { const d = { fresh: 0, dry: 1, dead: 2 }[vigour(p, now)]; if (d !== p.dry) { p.dry = d; dirty = true; } }
      blooms(ctx);
    }
    if (dirty || flora.moved(pos)) { dirty = false; flora.rebuild(garden.all(), pos, groundAt); }
  }
  function discovered(sp) { pouch.credit('discover'); stamp(`New in your herbarium: ${SPECIES[sp].name}`, `${SPECIES[sp].latin} · ${pouch.found.size} of ${SPECIES.length} found`); }

  // plots near you: notice blooms, and tell the wildlife where to live
  function blooms(ctx) {
    const now = Date.now(), plots = [];
    for (const { hand, bit } of garden.plotKeys()) {
      const h = handOf(hand), hb = h?.data.handbits[bit];
      if (!hb) continue;
      const pl = garden.plot(hand, bit, now), k = `${hand}:${bit}`, before = levels.get(k);
      levels.set(k, pl.level);
      if (before !== undefined && pl.level > before) { if (pl.level === 4) stamp(`${hb.name} is in full bloom`, `${h.name} · ${pl.kinds.size} kinds`); else say(`${hb.name} of ${h.name}: ${BLOOM[pl.level]}`, 3.5); pouch.credit('bloom'); }
      if (!pl.level) continue;
      const [x, z] = toWorld(h.pose, hb.cx, hb.cy);
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
    garden, pouch, flora, species: SPECIES, onGarden, load, plots: () => near,
    setFauna(f) { fauna = f; plotsKey = ''; },
    setTop(list) { top = list; },
    removeHand(id) { if (garden.removeHand(id)) dirty = true; },
    frame,
    // 'plant' | 'next' | 'prev' | 'uproot'
    act(what, ctx) {
      if (what === 'plant') { const now = performance.now(); if (now - lastPlant < 450) return; lastPlant = now; plant(ctx); }
      else if (what === 'next' || what === 'prev') { const id = pouch.next(what === 'next' ? 1 : -1); if (id !== null) say(`${SPECIES[id].name} · ${pouch.has(id)} seeds`, 2); }
      else if (what === 'uproot') uproot(ctx);
    },
    clouds: () => drift,
    gold: () => (gold && !goldTaken.has(gold.epoch) ? gold : null),
    taken: (id) => taken.has(id),
    refreshTop: () => online() && net.plants().then((r) => { if (r) { top = r.top; worldPlants = r.plants.length; } }),
    // what the HUD shows of the garden
    hud(place) {
      const sel = SPECIES[pouch.selected], out = { seeds: pouch.total, water: pouch.water, wet, level: pouch.level, xp: pouch.xp, found: pouch.found.size, of: SPECIES.length, planted: pouch.plantedTotal, plants: worldPlants, top,
        selected: pouch.total ? { id: sel.id, name: sel.name, n: pouch.has(sel.id), style: flora.styleOf(sel.id), icon: flora.icon(sel.id) } : null, plot: null };
      if (place?.handbit) {
        const pl = garden.plot(place.hand.id, place.index, Date.now()), next = LEVELS[pl.level];
        const counts = new Map();
        for (const p of garden.groves(place.hand.id, place.index)) counts.set(p.sp, (counts.get(p.sp) ?? 0) + 1);
        const [most, n] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
        out.plot = { n: pl.n, cap: CAP, level: pl.level, label: BLOOM[pl.level], progress: next ? Math.min(1, pl.score / next) : 1,
          title: !pl.n ? null : n * 10 >= pl.n * 7 ? `${SPECIES[most].name} field` : pl.kinds.size >= 5 ? 'wild meadow' : 'mixed garden',
          hint: !pl.n ? 'bare sand: plant here' : pl.level === 4 ? 'in full bloom' : pl.kinds.size < 3 ? 'plant more kinds' : 'water it to grow' };
      }
      return out;
    },
  };
}
