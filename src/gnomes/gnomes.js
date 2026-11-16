// src/gnomes/gnomes.js
// Gnomes: the cherry on the garden. They live in mushrooms (wild ones on dead groves, and the ones gardeners
// grow), about four mushrooms in ten. Who lives where, what one is called, the colour of its hat and what
// it is doing right now all come from the mushroom's id and the clock, so every player sees the same gnome
// asleep on the same cap. Fly over one low and gently and it jumps and grabs your whorl (three at most);
// roar past and you annoy it. A gnome on board gives you a side quest. Do it and it joins your team, or
// grows more loyal, or, if it was someone else's, wavers and then converts. Annoy another gardener's gnome
// often enough and it deserts them. Pure: the map's server applies the same team rules.
export const GNOME = { chance: 38, max: 3, pickup: { r: 90, alt: 240, speed: 460 }, buzz: { r: 120, speed: 460 }, questMs: 180000, loyal: 5 };
const mix = (a) => { a = Math.imul(a ^ (a >>> 16), 2246822507); a = Math.imul(a ^ (a >>> 13), 3266489909); return (a ^ (a >>> 16)) >>> 0; };
const pick = (list, h) => list[mix(h) % list.length];

// a mushroom a gnome could live in: a dead grove (wild mushrooms grow on it) or a planted mushroom in fruit
export const isHome = (grove, species) => grove.id > 0 && (grove.dry === 2 || (species[grove.sp]?.kind === 'mushroom' && grove.stage === 3 && !grove.dry));
const A = ['Bim', 'Glo', 'Nub', 'Fen', 'Tod', 'Wim', 'Pip', 'Zog', 'Mur', 'Bod', 'Kip', 'Jub', 'Oom', 'Sno', 'Twi', 'Hob'], B = ['ble', 'bo', 'kin', 'wick', 'nip', 'dle', 'but', 'gle', 'mo', 'sy', 'pot', 'zle', 'rum', 'tuft'];
export const HATS = ['#d8342c', '#2f6fd6', '#3f9a3a', '#e8b21e', '#8a4fd0', '#e0702a']; // red, blue, green, yellow, purple, orange
// the gnome of a home, or null when nobody lives there: { id, name, hat (index into HATS), seed }
export function gnomeAt(grove, species) {
  if (!isHome(grove, species) || mix(grove.id * 7 + 3) % 100 >= GNOME.chance) return null;
  const seed = seedOf(grove.id);
  return { id: grove.id, name: pick(A, seed) + pick(B, seed + 1), hat: mix(seed + 2) % HATS.length, seed };
}
// what a gnome at home is doing now (the same for everyone): mostly sitting about, sometimes asleep, pottering, or out riding
export function activity(id, now) {
  const h = mix(id * 31 + Math.floor(now / 20000)) % 10;
  return h < 3 ? 'sit' : h < 5 ? 'sleep' : h < 8 ? 'potter' : 'ride';
}

// ---- a gnome dangling from your whorl ----
// state: { swing (rad, how far out to the side it hangs), vel, joy 0..1, quiet (s since its last squeal) }
// input: { turn (-1..1, how hard you turn), speed (m/s), climb (m/s up or down) }
// A pendulum on a short string: a turn throws it outward, and it swings back and past. Flying fast, steep or
// suddenly is joy; joy squeals, a few seconds apart. Returns { state, squeal (true the moment it squeals) }
// what a gnome screams when it is dropped (the same words, in the same order, as SCREAM_LINES in src/garden/voice.js)
export const SCREAMS = ['Aaaaaaaaah!', 'Noooooooo!', 'Waaaaaaaah!', 'Eeeeeeeeek!', 'Help meeeee!', 'Not like thiiiis!', 'Yaaaaaargh!', 'Mummyyyyyy!'];
export const JOYS = ['Wheee!', 'Woohoo!', 'Yippee!', 'Again! Again!', 'Hee hee hee!', 'Faster! Faster!', 'Whoa-ho-ho!', 'Eeeee!', 'Best. Day. Ever!', 'Loop it! Loop it!'];
export function dangle(state, input, dt) {
  const want = -Math.max(-1, Math.min(1, input.turn)) * 0.95;
  const vel = (state.vel + ((want - state.swing) * 22 - state.vel * 2.6) * dt), swing = Math.max(-1.4, Math.min(1.4, state.swing + vel * dt));
  const wild = Math.max(Math.min(1, Math.max(0, (input.speed - 480) / 300)), Math.min(1, Math.abs(input.climb) / 180), Math.min(1, Math.abs(vel) / 5));
  const joy = state.joy + (wild - state.joy) * Math.min(1, dt * (wild > state.joy ? 3 : 0.8)), quiet = state.quiet + dt;
  const squeal = joy > 0.6 && quiet > 3.2;
  return { state: { swing, vel, joy, quiet: squeal ? 0 : quiet }, squeal };
}

// ---- what they shout ----
const LINES = {
  greet: ['Oi! Nice bouquet!', 'Coo-ee!', 'Got any spores?', 'Lower! I can\'t see your flowers!', 'Hello up there!', 'Mind the petals!', 'Take me with you!', 'Lovely day for a mushroom.'],
  buzz: ['MY HAT!', 'Slow down, you hooligan!', 'I was NAPPING!', 'That\'s it. I\'m telling the fungus.', 'Rude!', 'You nearly parted my beard!'],
  grab: ['Wheee!', 'Got you!', 'Don\'t drop me!', 'Onward, noble squiggle!', 'I can see my mushroom from here!'],
  done: ['Magnificent!', 'You are my favourite squiggle.', 'I shall tell everyone.', 'Best day since the Great Spore.', 'Hat\'s off to you!'],
  bored: ['Boring! I\'m off.', 'My beard grew an inch waiting.', 'Forget it, I\'ll walk.'],
  dunk: ['GLUB!', 'I CAN\'T SWIM! Oh wait, I can.', 'My beard! It\'s all wet!', 'You\'ll pay for that. In spores.'],
  home: ['Home sweet mushroom.', 'Thanks for the lift!', 'Same time tomorrow?'],
  joined: ['I\'m on your team now.', 'Consider me yours. Mostly.', 'Team squiggle!'],
  converted: ['I never liked them anyway.', 'New team, same hat.', 'Don\'t tell my old boss.'],
  deserted: ['I quit! I\'m a free gnome!', 'Nobody appreciates me here.'],
  ride: ['Giddy up!', 'Faster, noble beast!', 'Yee-haw!'],
  sleep: ['Zzz…', 'Zzz… spores… zzz'],
};
export const shout = (kind, seed, n = 0) => pick(LINES[kind] ?? LINES.greet, seed * 13 + n * 7 + kind.length);

// ---- side quests: one per gnome per day, from what the world has ----
// world: { from: { x, z } (the gnome's own mushroom), hands: [{ name, x, z }], homes: [{ id, name, x, z }] (other gnomes' mushrooms), kind? }. Returns { kind, text, need, have, x?, z?, r? }
export function questFor(gnome, day, world = {}) {
  // somewhere to go must be a real trip: not the Hand it lives on, not the gnome next door, not the Source from the Source
  const from = world.from ?? { x: 1e9, z: 1e9 }, far = (q, d) => Math.hypot(q.x - from.x, q.z - from.z) > d;
  const h = mix(gnome.seed + day * 977), hands = (world.hands ?? []).filter((q) => far(q, 2600)), cousins = (world.homes ?? []).filter((q) => q.id !== gnome.id && far(q, 900));
  const kinds = ['foxfire', 'sow', 'water', 'speed', 'high', 'cloud', 'river', ...(far({ x: 0, z: 0 }, 1500) ? ['source'] : []), ...(hands.length ? ['hand', 'hand'] : []), ...(cousins.length ? ['cousin', 'cousin'] : [])];
  const kind = kinds.includes(world.kind) ? world.kind : kinds[h % kinds.length], q = (text, need, extra = {}) => ({ kind, text, need, have: 0, ...extra }); // world.kind: asked for (the film, the checks)
  if (kind === 'source') return q('Take me to the Source! I want to see the shiny spire.', 1, { x: 0, z: 0, r: 500 });
  if (kind === 'hand') { const t = hands[mix(h + 1) % hands.length]; return q(`Fly me to ${t.name}. My cousin there owes me a button.`, 1, { x: t.x, z: t.z, r: 900 }); }
  if (kind === 'cousin') { const t = cousins[mix(h + 2) % cousins.length]; return q(`Take me to ${t.name}'s mushroom. It's their birthday. Probably.`, 1, { x: t.x, z: t.z, r: 260 }); }
  if (kind === 'foxfire') return q('Eat a mushroom with me on board. I want to see the colours!', 1);
  if (kind === 'sow') return q('Sow five groves. I\'ll supervise.', 5);
  if (kind === 'water') return q('Water three thirsty groves. Chop chop.', 3);
  if (kind === 'speed') return q('FASTER! I want my beard to flap!', 1, { speed: 700 });
  if (kind === 'high') return q('Up! Up! I want to lick a cloud.', 1, { alt: 1200 });
  if (kind === 'cloud') return q('Catch me a seed cloud. I collect smells.', 1);
  return q('Skim the river for a bit. My feet are hot.', 3); // seconds on the water
}
// what happened: { type: 'at', x, z } | 'fox' | 'sow' | 'tend' | 'cloud' | { type: 'speed', v } | { type: 'alt', h } | { type: 'wet', dt }
export function advance(quest, e) {
  const k = quest.kind;
  let have = quest.have;
  if ((k === 'source' || k === 'hand' || k === 'cousin') && e.type === 'at' && Math.hypot(e.x - quest.x, e.z - quest.z) <= quest.r) have = 1;
  else if (k === 'foxfire' && e.type === 'fox') have = 1;
  else if (k === 'sow' && e.type === 'sow') have++;
  else if (k === 'water' && e.type === 'tend') have++;
  else if (k === 'cloud' && e.type === 'cloud') have = 1;
  else if (k === 'speed' && e.type === 'speed' && e.v >= quest.speed) have = 1;
  else if (k === 'high' && e.type === 'alt' && e.h >= quest.alt) have = 1;
  else if (k === 'river' && e.type === 'wet') have += e.dt;
  return have === quest.have ? quest : { ...quest, have: Math.min(quest.need, have), done: have >= quest.need };
}

// what happened since the last look, for the gnomes on board: was and now are the garden's counters ({ sown, tends,
// clouds, eaten }), f is the flight ({ x, z, speed, alt, wet, dt }). Only a mushroom eaten now is a 'fox': the glow
// you were already in when the gnome grabbed on does not count
export function questEvents(was, now, f) {
  const ev = [{ type: 'at', x: f.x, z: f.z }, { type: 'speed', v: f.speed }, { type: 'alt', h: f.alt }];
  if (f.wet) ev.push({ type: 'wet', dt: f.dt });
  for (const [k, type] of [['sown', 'sow'], ['tends', 'tend'], ['clouds', 'cloud'], ['eaten', 'fox']]) for (let i = was[k] ?? 0; i < (now[k] ?? 0); i++) ev.push({ type });
  return ev;
}

// ---- teams: rec is { owner (who, or null for a wild gnome), loyalty 0..5 } ----
// a quest done for it by `me`
export function afterQuest(rec, me) {
  if (!rec?.owner) return { owner: me, loyalty: 2, event: 'joined' };
  if (rec.owner === me) return { owner: me, loyalty: Math.min(GNOME.loyal, rec.loyalty + 1), event: 'loyal' };
  return rec.loyalty <= 2 ? { owner: me, loyalty: 2, event: 'converted' } : { owner: rec.owner, loyalty: rec.loyalty - 2, event: 'wavering' };
}
// annoyed by `me` (buzzed, dunked): a wild gnome only grumbles; an owned one loses heart, and at nothing it deserts
export function afterAnnoy(rec, me) {
  if (!rec?.owner) return { owner: null, loyalty: 0, event: 'grumpy' };
  const loyalty = rec.loyalty - 1;
  return loyalty <= 0 ? { owner: null, loyalty: 0, event: 'deserted' } : { owner: rec.owner, loyalty, event: 'grumpy' };
}

// the room tells of a gnome's change of heart: [id, tag, owner, loyalty, event]. If it was on your team (was: your
// record of it; mine: your tag) and no longer is, the line to tell you; otherwise null
export function lostGnome(was, mine, [, tag, owner, , event]) {
  if (!mine || was?.tag !== mine || tag === mine) return null;
  return event === 'converted' ? `${owner} converted one of your gnomes` : 'One of your gnomes deserted: someone annoyed it once too often';
}

// ... and if it was not on your team and now is, how it came: 'joined' | 'converted'; otherwise null. The map's
// answer to your own quest says the same, but answers get lost; the room's word keeps your count right
export const gainedGnome = (was, mine, [, tag, , , event]) => (mine && tag === mine && was?.tag !== mine ? event : null);

// ---- gnomes on board, told to the room inside the bouquet's signature, after the species ----
// Per rider three pairs: [4095, hat], then the mushroom it left in two 12-bit halves, [4094, low] [4093, high]
// (the room passes whole numbers under 4096 only). Others draw the gnome on your whorl and its cap empty.
export function withRiders(sig, riders) {
  const on = riders.slice(0, GNOME.max);
  return [...sig.slice(0, 48 - 6 * on.length), ...on.flatMap((r) => [4095, r.hat, 4094, r.id & 4095, 4093, (r.id >>> 12) & 4095])];
}
export function splitRiders(sig) {
  const s = [], riders = [];
  if (Array.isArray(sig)) for (let i = 0; i + 1 < sig.length; i += 2) {
    const k = sig[i], v = sig[i + 1], last = riders.at(-1);
    if (k === 4095) riders.push({ hat: v % HATS.length, id: 0 });
    else if (k === 4094) { if (last) last.id |= v & 4095; }
    else if (k === 4093) { if (last) last.id |= (v & 4095) << 12; }
    else s.push(k, v);
  }
  return { sig: s, riders: riders.slice(0, GNOME.max) };
}
// what a gnome looks like, from the mushroom it lives in (the same for whoever draws it)
export const seedOf = (id) => mix(id);
