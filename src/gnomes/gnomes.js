// src/gnomes/gnomes.js
// Gnomes: the cherry on the garden. They live in mushrooms (wild ones on dead groves, and the ones gardeners
// grow), about four mushrooms in ten. Who lives where, what one is called, the colour of its hat and what
// it is doing right now all come from the mushroom's id and the clock, so every player sees the same gnome
// asleep on the same cap. Fly over one low and gently and it jumps and grabs your whorl (three at most);
// roar past and you annoy it. A gnome on board gives you a side quest. Do it and it joins your team, or
// grows more loyal, or, if it was someone else's, wavers and then converts. Annoy another gardener's gnome
// often enough and it deserts them. Pure: the map's server applies the same team rules.
export const GNOME = { chance: 38, max: 3, pickup: { r: 80, alt: 220, speed: 280 }, buzz: { r: 110, speed: 320 }, questMs: 180000, loyal: 5 };
const mix = (a) => { a = Math.imul(a ^ (a >>> 16), 2246822507); a = Math.imul(a ^ (a >>> 13), 3266489909); return (a ^ (a >>> 16)) >>> 0; };
const pick = (list, h) => list[mix(h) % list.length];

// a mushroom a gnome could live in: a dead grove (wild mushrooms grow on it) or a planted mushroom in fruit
export const isHome = (grove, species) => grove.id > 0 && (grove.dry === 2 || (species[grove.sp]?.kind === 'mushroom' && grove.stage === 3 && !grove.dry));
const A = ['Bim', 'Glo', 'Nub', 'Fen', 'Tod', 'Wim', 'Pip', 'Zog', 'Mur', 'Bod', 'Kip', 'Jub', 'Oom', 'Sno', 'Twi', 'Hob'], B = ['ble', 'bo', 'kin', 'wick', 'nip', 'dle', 'but', 'gle', 'mo', 'sy', 'pot', 'zle', 'rum', 'tuft'];
export const HATS = ['#d8342c', '#2f6fd6', '#3f9a3a', '#e8b21e', '#8a4fd0', '#e0702a']; // red, blue, green, yellow, purple, orange
// the gnome of a home, or null when nobody lives there: { id, name, hat (index into HATS), seed }
export function gnomeAt(grove, species) {
  if (!isHome(grove, species) || mix(grove.id * 7 + 3) % 100 >= GNOME.chance) return null;
  const seed = mix(grove.id);
  return { id: grove.id, name: pick(A, seed) + pick(B, seed + 1), hat: mix(seed + 2) % HATS.length, seed };
}
// what a gnome at home is doing now (the same for everyone): mostly sitting about, sometimes asleep, pottering, or out riding
export function activity(id, now) {
  const h = mix(id * 31 + Math.floor(now / 20000)) % 10;
  return h < 3 ? 'sit' : h < 5 ? 'sleep' : h < 8 ? 'potter' : 'ride';
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
// world: { hands: [{ name, x, z }], homes: [{ id, name, x, z }] } (other gnomes' mushrooms). Returns { kind, text, need, have, x?, z?, r? }
export function questFor(gnome, day, world = {}) {
  const h = mix(gnome.seed + day * 977), hands = world.hands ?? [], cousins = (world.homes ?? []).filter((q) => q.id !== gnome.id);
  const kinds = ['source', 'foxfire', 'sow', 'water', 'speed', 'high', 'cloud', 'river', ...(hands.length ? ['hand', 'hand'] : []), ...(cousins.length ? ['cousin', 'cousin'] : [])];
  const kind = kinds[h % kinds.length], q = (text, need, extra = {}) => ({ kind, text, need, have: 0, ...extra });
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

// ---- gnomes on board, told to the room inside the bouquet's signature: [4095, hat] per rider, after the species ----
export function withRiders(sig, hats) { return [...sig.slice(0, 48 - 2 * Math.min(GNOME.max, hats.length)), ...hats.slice(0, GNOME.max).flatMap((h) => [4095, h])]; }
export function splitRiders(sig) {
  const s = [], hats = [];
  if (Array.isArray(sig)) for (let i = 0; i + 1 < sig.length; i += 2) { if (sig[i] === 4095) hats.push(sig[i + 1] % HATS.length); else s.push(sig[i], sig[i + 1]); }
  return { sig: s, hats: hats.slice(0, GNOME.max) };
}
