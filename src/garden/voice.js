// src/garden/voice.js
// The old gnome who talks you through the game: Grandfather Tuft. Every line he can say, by id (the audio clips in
// assets/voice are made from this list by tools/voice.mjs, one file per id), and the small rules of when: which way
// something lies from where you are flying, and how often a line may come back. Pure.
export const LINES = {
  // arriving
  welcome: 'Ah, there you are. I am Grandfather Tuft. Stay with me, I will show you this old desert.',
  back: 'Welcome back, young whorl. The desert missed you.',
  // the tutorial, step by step
  'tut-turn': 'First, turn. Left, and right. Go on, the sky is wide.',
  'tut-climb': 'Good. Now climb, and then dive. Diving makes you fast.',
  'tut-sow': 'Now the fun. Fly low over the sand of a Hand, and sow.',
  'tut-seed': 'You carry more than one kind. Pick another seed.',
  'tut-scatter': 'Scatter a handful to the side. Five groves at once.',
  'tut-water': 'Seeds are thirsty. Skim low over a river and fill up.',
  'tut-pour': 'Now pour it over the young groves, and watch them grow.',
  'tut-hyper': 'Feel that tingle? Start a hyper sow, and draw with flowers.',
  'tut-atlas': 'Last thing. Open your atlas. The whole world is in it.',
  'tut-done': 'There. You can fly and you can garden. The rest you will find yourself. Mind the mushrooms.',
  'step-done': 'That is it!',
  'step-done-2': 'Splendid.',
  'step-done-3': 'Just so.',
  // what is what
  'what-screen': 'Look around your view. The compass on top, the radar on the right, your seeds below.',
  'what-hand': 'This sand is a Hand. The palm of a player. Here things grow.',
  'what-river': 'A river. Every palm line is one. Skim it for water.',
  'what-wilderness': 'This is the wilderness. Nothing grows here. Follow the compass to a Hand.',
  'what-cloud': 'See that swirl? Seed on the wind. Fly through it.',
  'what-mushroom': 'A mushroom! Fly low through it. You will like what happens.',
  'what-gnome': 'One of my cousins lives there. Fly over gently, and he may come along.',
  'what-player': 'Another whorl. A real person. Fly close and say hello.',
  'what-bloom': 'This plot is in bloom. The animals have noticed.',
  'what-storm': 'A sandstorm. It dries out whatever it crosses. Water after it.',
  'what-gold': 'A golden seed is out. First one there keeps it. Hurry!',
  // what is missing
  'need-hand': 'Not here. You need the sand of a Hand under you.',
  'need-low': 'Lower, lower. You are too high to sow.',
  'need-sand': 'That is the river. Seeds want sand. Move over a little.',
  'need-water': 'You have no water. Skim a river first.',
  'need-seeds': 'Your pouch is empty. Find a seed cloud.',
  // finding your way: a thing, then where it lies
  'nearest-hand': 'The nearest Hand is',
  'the-source': 'The Source is',
  'your-hand': 'Your own Hand is',
  ahead: 'straight ahead.',
  right: 'to your right.',
  behind: 'behind you. Turn around.',
  left: 'to your left.',
  'over-wild': 'You are drifting over the wilderness.',
  // things that happen
  'hyper-ready': 'Your hyper sow is ready.',
  level: 'A new gardener level. Rarer seeds will find you now.',
  foxfire: 'Ha! The foxfire. Everything counts double. Go, go!',
  'foxfire-over': 'And the world is calm again.',
  grab: 'You have a passenger. Do what he asks, and he is yours.',
  quest: 'He is pleased. That gnome will tell everyone.',
  team: 'One more gnome on your team.',
  lost: 'One of your gnomes has changed sides. It happens.',
  cross: 'Oh, now you have made him cross. Slow down near mushrooms.',
  greet: 'A friend. Your whorls know each other now.',
  bloomed: 'A plot came into bloom. Listen, the birds are coming.',
  golden: 'The golden seed is yours. Well flown!',
  storm: 'Sandstorm coming. Remember where you planted.',
  dry: 'Some groves here are thirsty. A little water saves them.',
  'own-hand': 'Your own Hand has risen. Your whorl has taken its shape.',
  idle: 'Still there? The desert will not sow itself.',
  'idle-2': 'Try flying low. Everything interesting is near the ground.',
  'idle-3': 'Have you met a gnome yet? Look for mushrooms.',
};
// where (x, z) lies from a flyer at (px, pz) heading yaw (0 looks along -z, as the glider does): ahead | right | behind | left
export function relDir(px, pz, yaw, x, z) {
  const dx = x - px, dz = z - pz, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const along = dx * fx + dz * fz, side = dx * -fz + dz * fx; // + side: to the right
  return Math.abs(along) >= Math.abs(side) ? (along >= 0 ? 'ahead' : 'behind') : side > 0 ? 'right' : 'left';
}
// who speaks when: a line (or a few said in a row) may come back only after its rest, and never over one still being said
export function createSpeaker({ rest = 45 } = {}) {
  const last = new Map();
  let busyUntil = -Infinity;
  return {
    // now: seconds; ids: one id or several said in a row; seconds: how long they take; again: this line's own rest. true if he may speak
    may(now, ids, seconds = 3, again = rest) {
      const key = [].concat(ids).join('+');
      if (now < busyUntil || now - (last.get(key) ?? -Infinity) < again) return false;
      last.set(key, now); busyUntil = now + seconds;
      return true;
    },
  };
}
