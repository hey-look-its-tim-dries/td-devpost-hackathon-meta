// src/gnomes/game.js
// Gnomes in the world. They sit, sleep and potter about their mushrooms, ride the animals, wave and shout
// when you fly over, shake their fists when you roar past, and jump onto your whorl when you pass low and
// gently. A gnome on board has a side quest for you; do it and it joins your team (or wavers, or converts
// from another gardener's). The rules are in gnomes.js, the looks in render.js; this wires them to the
// garden, the map, your flight and the other players. main.js calls frame() and act().
import { GNOME, gnomeAt, activity, shout, questFor, advance, questEvents, seedOf, lostGnome, gainedGnome, dangle, dragLift, JOYS, SCREAMS, DRAGS } from './gnomes.js';
import { createDust } from './dust.js';
import { DANCES } from './pose.js';
import { createGnomeRenderer } from './render.js';

const SIZE = 20, RIDER = 129, CAP = 27; // metres per gnome unit at home and on a whorl (a passenger is a big, proud thing to carry: you see it from across a Hand); how high a mushroom's cap sits

export function createGnomes({ scene, bloom, net, say, stamp, groundAt, creature, others, fauna, online, makeLabel, hands, onRiders, ridersOf, quest = null, onMet = null, onRival = null, sfx = () => {}, squeal = () => {}, scream = () => {}, yell = () => {} }) { // yell(n): 'Up, please, sir!' number n, dragged over the sand // squeal(n): a gnome's cry of joy, clip n (assets/voice/joy-n) // quest: a kind to ask for (?quest=, for the film and the checks)
  const draw = createGnomeRenderer();
  scene.add(draw.group);
  const records = new Map(); // gnome id -> { tag, owner, loyalty }: whose team it is on (wild gnomes have none)
  const me = { tag: null, converted: 0, team: 0 };
  const mood = new Map(), away = new Set(), carried = new Set(), riders = []; // away: on your whorl; carried: on another gardener's
  const bubbles = Array.from({ length: 5 }, () => ({ label: null, until: -1, at: [0, 0, 0] }));
  let lastY = 0;
  const dust = createDust(scene); // sand kicked up by a gnome dragged along the ground
  let homes = [], slow = 9, t = 0, told = '', before = { sown: 0, tends: 0, clouds: 0, eaten: 0 };
  const moodOf = (id) => { if (!mood.has(id)) mood.set(id, { angry: -99, greet: -99, buzz: -99, dropped: -99, n: 0 }); return mood.get(id); };
  const whose = (id) => { const r = records.get(id); return !r ? 'a wild gnome' : r.tag === me.tag ? 'one of yours' : `one of ${r.owner}'s`; };
  function speak(text, x, y, z) { // a shout over a gnome's head, for a few seconds
    const b = bubbles.reduce((a, c) => (c.until < a.until ? c : a));
    if (!b.label) { b.label = makeLabel(); scene.add(b.label.sprite); }
    b.label.set(text); b.at = [x, y, z]; b.until = t + 3.5; b.label.sprite.visible = true;
  }
  let top = []; // who converted most gnomes: [{ name, n }], from the map
  const teams = () => net.gnomes().then((r) => { if (!r) return; top = r.top ?? []; for (const [id, tag, owner, loyalty] of r.gnomes) records.set(id, { tag, owner, loyalty }); });
  const who = (tries = 3) => net.gnomeMe().then((r) => { if (r) Object.assign(me, r); else if (tries > 1) setTimeout(() => who(tries - 1), 10000); }); // your tag and counts
  const load = () => { teams(); who(); };
  // a gnome came over to you: said once, whether the map's answer or the room's word brings it first
  const said = new Map();
  function welcome(gn, event) {
    if (said.get(gn.id) === event) return;
    said.set(gn.id, event); sfx('team');
    if (event === 'joined') stamp(`${gn.name} joined your team`, `${me.team} gnome${me.team === 1 ? '' : 's'} on your team · “${shout('joined', gn.seed)}”`, 'GNOME');
    else if (event === 'converted') stamp(`${gn.name} converted to your team`, `${me.converted} converted · “${shout('converted', gn.seed)}”`, 'GNOME');
  }
  const onGnome = (row) => { // the room: a gnome changed teams somewhere
    const [id, tag, owner, loyalty, event] = row, was = records.get(id), lost = lostGnome(was, me.tag, row), won = gainedGnome(was, me.tag, row);
    if (lost) { me.team = Math.max(0, me.team - 1); said.delete(id); say(lost, 6); if (event === 'converted' && owner) onRival?.(owner); } // one of yours went
    if (won) { // one came over, and the map's own answer has not said so (yet): count it
      me.team++; if (won === 'converted') me.converted++;
      const gn = riders.find((r) => r.gn.id === id)?.gn ?? homes.find((h) => h.gn.id === id)?.gn;
      if (gn) welcome(gn, won);
    }
    if (tag) records.set(id, { tag, owner, loyalty }); else records.delete(id);
    if (event === 'converted') teams(); // the board changed
  };
  // the map's answer after a quest or an annoyance: say what became of the gnome
  function settled(gn, r) {
    if (!r || r.error) return;
    if (r.tag && (r.event === 'joined' || r.event === 'converted' || r.event === 'loyal')) me.tag = r.tag; // it is yours: the answer names you
    me.converted = r.converted ?? me.converted; me.team = r.team ?? me.team;
    if (r.tag) records.set(gn.id, { tag: r.tag, owner: r.tag === me.tag ? 'you' : records.get(gn.id)?.owner ?? 'someone', loyalty: r.loyalty }); else records.delete(gn.id);
    if (r.event === 'joined' || r.event === 'converted') welcome(gn, r.event);
    else if (r.event === 'loyal') say(`${gn.name} is more loyal to you than ever`, 4);
    else if (r.event === 'wavering') say(`${gn.name} is wavering: one more quest and it is yours`, 5);
    else if (r.event === 'deserted') say(`${gn.name} deserted its team: “${shout('deserted', gn.seed)}”`, 5);
  }
  // a dropped gnome falls: flung off with the whorl's speed, tumbling and flailing, screaming all the way down; it
  // lands with a bounce and a squash, then stomps off home (its mushroom has it back). Drawn for a few seconds only.
  const fallers = [];
  const drop = (i, line, fall = true) => { sfx('drop'); const [r] = riders.splice(i, 1);
    if (fall && r.at) { const k = (r.gn.seed + fallers.length) % 8; fallers.push({ gn: r.gn, x: r.at[0], y: r.at[1], z: r.at[2], vx: r.at[3] * 0.6, vy: 60, vz: r.at[4] * 0.6, t0: t, landed: 0, spin: (r.gn.seed % 2 ? 1 : -1) * (2.5 + (r.gn.seed % 5) * 0.4) }); scream(k); speak(SCREAMS[k], r.at[0], r.at[1] + RIDER * 0.4, r.at[2]); } away.delete(r.gn.id); moodOf(r.gn.id).dropped = t; if (line) say(`${r.gn.name}: “${shout(line, r.gn.seed, t | 0)}”`, 4); };

  function frame(dt, ctx) {
    t += dt;
    const { pos, yaw, speed, alt, flying, eye } = ctx, now = Date.now(), climbing = dt > 0 ? (pos[1] - lastY) / dt : 0;
    lastY = pos[1];
    if ((slow += dt) >= 2) { // who lives near here
      slow = 0;
      homes = [];
      for (const g of bloom.garden.all()) { if (g.wx === undefined || Math.hypot(g.wx - pos[0], g.wz - pos[2]) > 4500) continue; const gn = gnomeAt(g, bloom.species); if (gn) homes.push({ gn, x: g.wx, z: g.wz, y: g.wy + CAP }); }
    }
    draw.begin();
    // ---- gnomes at home ----
    for (const h of homes) {
      const { gn } = h, id = gn.id;
      if (away.has(id) || carried.has(id)) continue; // on your whorl, or on someone else's
      const act = activity(id, now), m = moodOf(id), d = Math.hypot(h.x - pos[0], h.z - pos[2]);
      let x = h.x, y = h.y, z = h.z, face = (gn.seed % 628) / 100, clip = act === 'sleep' ? 'sleep' : 'sit', size = SIZE;
      if (act === 'ride') { // out riding: an animal of the nearest herd, or, for every third gnome, a bird
        const birds = gn.seed % 3 === 0 && fauna.seats.nb > 0, n = birds ? fauna.seats.nb : fauna.seats.na, S = birds ? fauna.seats.birds : fauna.seats.animals, q = n ? (gn.seed % n) * 5 : 0;
        if (n && Math.hypot(S[q] - h.x, S[q + 2] - h.z) < 1800) { x = S[q]; y = S[q + 1]; z = S[q + 2]; face = S[q + 3]; clip = 'ride'; size = Math.min(SIZE, (birds ? 3 : 6) * S[q + 4] + 4); }
      }
      if (act === 'potter' || (act === 'ride' && clip !== 'ride')) { const a = now / 9000 + gn.seed; x = h.x + Math.cos(a) * 55; z = h.z + Math.sin(a) * 55; y = groundAt(x, z); face = -a; clip = 'potter'; }
      const near = flying && d < 380 && alt < 420;
      if (m.angry > t) { clip = 'shout'; face = Math.atan2(pos[0] - x, pos[2] - z); }
      else if (near && act !== 'sleep' && clip !== 'ride') { // it has seen you
        clip = 'wave'; face = Math.atan2(pos[0] - x, pos[2] - z);
        if (d < 300 && t - m.greet > 25) { m.greet = t; speak(`${gn.name}: ${shout('greet', gn.seed, m.n++)}`, x, y + size * 1.5, z); }
      } else if (near && clip === 'ride' && t - m.greet > 25) { m.greet = t; speak(`${gn.name}: ${shout('ride', gn.seed, m.n++)}`, x, y + size * 1.5, z); }
      if (flying && alt < 260 && d < GNOME.buzz.r && speed >= GNOME.buzz.speed && t - m.buzz > 20) { // you roared past: it is cross
        m.buzz = t; m.angry = t + 5; sfx('cross');
        speak(`${gn.name}: ${shout('buzz', gn.seed, m.n++)}`, x, y + size * 1.5, z);
        if (online()) net.gnomeDo(id, 'annoy').then((r) => settled(gn, r));
      } else if (flying && alt < GNOME.pickup.alt && d < GNOME.pickup.r && speed < GNOME.pickup.speed && riders.length < GNOME.max && m.angry <= t && t - m.dropped > 15) { // low and gentle: it jumps and grabs on
        const day = Math.floor(now / 86400000), world = { from: { x: h.x, z: h.z }, hands: hands(), homes: homes.map((q) => ({ id: q.gn.id, name: q.gn.name, x: q.x, z: q.z })), kind: quest };
        riders.push({ gn, quest: questFor(gn, day, world), since: now, doneAt: 0, grabbed: t });
        away.add(id);
        onMet?.(gn.name); sfx('grab');
        ctx.burst?.();
        say(`${gn.name} (${whose(id)}) grabbed on: “${shout('grab', gn.seed, m.n++)}” ${riders.at(-1).quest.text}`, 9);
        continue;
      }
      draw.add({ x, y, z, yaw: face, s: size, clip, t: t + gn.seed % 7, hat: gn.hat, seed: gn.seed });
    }
    // ---- gnomes on your whorl, and their quests ----
    const c = bloom.counts, ev = riders.length ? questEvents(before, c, { x: pos[0], z: pos[2], speed, alt, wet: ctx.wet, dt }) : [];
    before = { sown: c.sown, tends: c.tends, clouds: c.clouds, eaten: c.eaten };
    for (let i = riders.length - 1; i >= 0; i--) {
      const r = riders[i], l = creature.strand((i * 5 + 2) % creature.active), j = Math.min(l.count - 1, Math.max(1, Math.round(l.count * (0.22 + 0.2 * i)))) * 3;
      if (!r.doneAt) {
        if (r.grabbed < t) for (const e of ev) r.quest = advance(r.quest, e); // (not what happened in the very frame it grabbed on)
        if (r.quest.done) { // done: cheers, a gift, and the map hears of it
          r.doneAt = t; sfx('quest');
          const gift = bloom.gift();
          say(`${r.gn.name}: “${shout('done', r.gn.seed, t | 0)}” It gives you three ${gift.name} seeds`, 6);
          ctx.burst?.();
          if (online()) net.gnomeDo(r.gn.id, 'quest').then((q) => settled(r.gn, q)); else { me.team++; stamp(`${r.gn.name} joined your team`, 'the map will hear of it when it is back', 'GNOME'); }
        } else if (now - r.since > GNOME.questMs) { drop(i, 'bored'); continue; }
      } else if (t - r.doneAt > 4 && alt < 320 && homes.some((h) => Math.hypot(h.x - pos[0], h.z - pos[2]) < 160)) { drop(i, 'home', false); continue; } // set down at a mushroom (gently: no fall)
      // it dangles: thrown out by your turns, streaming behind at speed, and it squeals when the flying gets wild
      const dg = dangle(r.d ?? { swing: 0, vel: 0, joy: 0, quiet: 2 }, { turn: ctx.turn ?? 0, speed, climb: climbing }, Math.min(dt, 0.05));
      r.d = dg.state;
      r.at = [l.xyz[j], l.xyz[j + 1] - RIDER * 1.1, l.xyz[j + 2], (l.xyz[j] - (r.at?.[0] ?? l.xyz[j])) / Math.max(dt, 1e-3), (l.xyz[j + 2] - (r.at?.[2] ?? l.xyz[j + 2])) / Math.max(dt, 1e-3)]; /* where its body is, and how fast it goes (it keeps that when it falls) */
      // flown too low, it never goes into the sand: it is dragged over it, facing back, heels ploughing, begging to go up
      const lift = t - r.grabbed < 0.5 ? null : dragLift(l.xyz[j + 1], groundAt(l.xyz[j], l.xyz[j + 2]), RIDER, 1.55);
      if (lift !== null) {
        if (!r.dragging) { r.dragging = true; r.yellAt = Math.max(r.yellAt ?? 0, t + 0.35); }
        const fx = Math.sin(yaw), fz = Math.cos(yaw), back = 1.55 * RIDER * 0.8, hx = l.xyz[j] - fx * back, hz = l.xyz[j + 2] - fz * back;
        if (speed > 20) dust.puff(hx, groundAt(hx, hz) + 4, hz, 0.25 * RIDER, fx, fz, speed > 200 ? 3 : 1);
        if (t >= r.yellAt) { const k = (r.gn.seed + (r.yells = (r.yells ?? 0) + 1)) % DRAGS.length; speak(DRAGS[k], l.xyz[j], lift + RIDER * 0.5, l.xyz[j + 2]); yell(k); r.yellAt = t + 2.4 + 1.6 * ((r.gn.seed * 7 + r.yells * 13) % 10) / 10; }
      } else r.dragging = false;
      if (dg.squeal && lift === null) { const k = (r.gn.seed + (r.n = (r.n ?? 0) + 1)) % JOYS.length; speak(JOYS[k], l.xyz[j], l.xyz[j + 1] + RIDER * 0.6, l.xyz[j + 2]); squeal(k); }
      if (lift !== null) draw.add({ x: l.xyz[j], y: lift, z: l.xyz[j + 2], yaw: yaw + Math.PI, s: RIDER, grip: 1.55, clip: 'drag', t: t + i, hat: r.gn.hat, seed: r.gn.seed });
      else draw.add({ x: l.xyz[j], y: l.xyz[j + 1], z: l.xyz[j + 2], yaw, s: RIDER, grip: 1.55, /* it hangs wholly under the whorl, hat and all, on two lines: a parachutist steering */ clip: t - r.grabbed < 0.5 ? 'jump' : 'hang', t: r.doneAt ? t : t - r.grabbed < 0.5 ? (t - r.grabbed) * 2 : t + i, hat: r.gn.hat, seed: r.gn.seed, motion: { swing: r.d.swing, lift: Math.min(1, speed / 700), joy: r.d.joy } });
    }
    // ---- gnomes other gardeners carry ----
    carried.clear(); // found again every frame: whoever leaves the room lets its gnomes go home
    others.each((oc, id) => {
      const on = ridersOf(id);
      for (let i = 0; i < on.length; i++) {
        if (on[i].id) carried.add(on[i].id);
        const l = oc.strand((i * 2 + 1) % oc.strands), j = Math.min(l.count - 1, Math.max(1, Math.round(l.count * (0.25 + 0.2 * i)))) * 3;
        const lift = dragLift(l.xyz[j + 1], groundAt(l.xyz[j], l.xyz[j + 2]), RIDER * 0.7, 1.55); // theirs are dragged too when they fly low
        draw.add({ x: l.xyz[j], y: lift ?? l.xyz[j + 1], z: l.xyz[j + 2], yaw: lift === null ? 0 : Math.PI, s: RIDER * 0.7, grip: 1.55, clip: lift === null ? 'hang' : 'drag', t: t + i * 1.7, hat: on[i].hat, seed: on[i].id ? seedOf(on[i].id) : id * 31 + i });
      }
    });
    // The foxfire shows what is to come: giants of the gnome folk standing all over the desert, turning to look up
    // at you as you fly over, cheering when you pass right above. (They are a vision: gone when the glow is.)
    if ((ctx.fox ?? 0) > 0.05 && ctx.groundAt) {
      const C = 520, cx = Math.round(pos[0] / C), cz = Math.round(pos[2] / C), hash = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
      for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
        const gx = cx + i, gz = cz + j, h = hash(gx, gz);
        if (h > 0.3) continue;
        const x = (gx + (hash(gz, gx) - 0.5) * 0.7) * C, z = (gz + (hash(gx + 7, gz - 3) - 0.5) * 0.7) * C, y = ctx.groundAt(x, z), d = Math.hypot(x - pos[0], z - pos[2]), seed = Math.floor(h * 1e5);
        draw.add({ x, y, z, yaw: Math.atan2(pos[0] - x, pos[2] - z), s: (140 + 1500 * h) * ctx.fox * Math.max(0.22, Math.min(1, (d - 200) / 700)), /* giants from afar, smaller as you come near: never in your way */ clip: d < 300 ? 'cheer' : seed % 5 < 2 ? 'gaze' : DANCES[seed % DANCES.length], t: seed % 5 < 2 ? t + seed % 9 : t, /* two in five watch and wave; the rest dance, all on one beat */ hat: seed, seed, motion: { up: Math.atan2(pos[1] - y, Math.max(1, d)) } });
      }
    }
    for (let n = fallers.length - 1; n >= 0; n--) { // the falling: gravity, a tumble, the ground, a bounce, a squash, gone
      const f = fallers[n], ft = t - f.t0, ground = groundAt(f.x, f.z);
      if (!f.landed) { f.vy -= 260 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; f.vx *= 1 - 0.3 * dt; f.vz *= 1 - 0.3 * dt; if (f.y <= ground) { f.y = ground; f.landed = t; f.vx *= 0.2; f.vz *= 0.2; sfx('drop'); } }
      const lt = f.landed ? t - f.landed : 0;
      if ((f.landed && lt > 1.6) || ft > 12) { fallers.splice(n, 1); continue; }
      const bounce = f.landed ? Math.max(0, Math.sin(lt * 7) * Math.exp(-lt * 4)) * 90 : 0, squash = f.landed ? 1 - 0.35 * Math.exp(-lt * 6) : 1;
      draw.add({ x: f.x, y: f.y + bounce, z: f.z, yaw: f.landed ? 0 : ft * f.spin, s: RIDER * 0.8 * squash, clip: f.landed ? (lt < 0.5 ? 'sulk' : 'potter') : 'fall', t: ft, hat: f.gn.hat, seed: f.gn.seed, motion: { tumble: f.landed ? 0 : ft * f.spin * 0.8 } });
    }
    draw.end();
    dust.update(dt);
    const on = riders.map((r) => ({ hat: r.gn.hat, id: r.gn.id })), key = on.map((r) => r.id).join(',');
    if (key !== told) { told = key; onRiders(on); } // the room hears who is on board, so others see them
    for (const b of bubbles) if (b.label) { if (b.until > t) b.label.update(b.at, eye); else b.label.sprite.visible = false; }
  }

  return {
    frame, load, onGnome,
    // G: set down the gnome that grabbed on last. Over water it gets a ducking, and is cross with you
    act(what, ctx) {
      if (what !== 'drop' || !riders.length) return;
      const r = riders.at(-1), wet = ctx.place && !ctx.place.handbit && ctx.alt < 240;
      drop(riders.length - 1, wet ? 'dunk' : r.doneAt ? 'home' : 'bored');
      if (wet) { moodOf(r.gn.id).angry = t + 12; if (online()) net.gnomeDo(r.gn.id, 'annoy').then((q) => settled(r.gn, q)); }
    },
    hud() {
      const r = riders.find((q) => !q.doneAt) ?? riders[0];
      return { riders: riders.length, team: me.team, converted: me.converted, top, quest: r ? { name: r.gn.name, kind: r.quest.kind, x: r.quest.x, z: r.quest.z, text: r.quest.text, have: Math.floor(r.quest.have), need: r.quest.need, done: !!r.doneAt, left: Math.max(0, Math.ceil((GNOME.questMs - (Date.now() - r.since)) / 1000)) } : null };
    },
    get count() { return draw.count; },
    homes: () => homes, riders: () => riders, draw,
    // for the checks: whose team a gnome is on, who is on other whorls, and whether one is at its mushroom now
    teamOf: (id) => records.get(id) ?? null, carried: () => carried, atHome: (id) => homes.some((h) => h.gn.id === id) && !away.has(id) && !carried.has(id),
  };
}
