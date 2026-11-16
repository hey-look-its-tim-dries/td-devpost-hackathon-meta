// src/garden/voice.js
// The old gnome who talks you through the game: Grandfather Tuft. Every line he can say, by id (the audio clips in
// assets/voice are made from this list by tools/voice.mjs, one file per id), and the small rules of when: which way
// something lies from where you are flying, and how often a line may come back. Pure.
export const LINES = {
  // arriving
  welcome: 'Oh. A new one. I am Grandfather Tuft. Try not to crash into anything I planted.',
  back: 'You again. Fine. The desert did not sow itself while you were gone.',
  // the tutorial, step by step
  'tut-turn': 'First, turn. Left. Right. It is not hard, I have seen beetles do it.',
  'tut-climb': 'Now up, and then dive. Diving makes you fast. Screaming is optional.',
  'tut-sow': 'Now the only useful thing you will do today. Fly low over the sand, and sow.',
  'tut-seed': 'You carry more than one kind, you know. Pick another seed.',
  'tut-scatter': 'Scatter a handful to the side. Five groves at once. Even you can manage that.',
  'tut-water': 'Seeds drink. Skim low over a river and fill up. Low! Not that low.',
  'tut-pour': 'Now pour it on the young ones. Gently. They are babies, not a fire.',
  'tut-hyper': 'Feel that tingle? Hyper sow. Go on, scribble all over my desert.',
  'tut-atlas': 'Last thing. Open your atlas. The whole world is in there. Do not lose it.',
  'tut-done': 'There. You can fly and you can garden. I am almost proud. Now leave me alone. And mind the mushrooms.',
  'step-done': 'Hm. Not terrible.',
  'step-done-2': 'Well. Look at you.',
  'step-done-3': 'I have seen worse. Once.',
  // what is what
  'what-screen': 'Compass on top. Radar on the right. Seeds below. I will not explain it twice.',
  'what-hand': 'This sand is a Hand. Somebody\'s actual palm. Be polite, and plant something.',
  'what-river': 'A river. Every palm line is one. Skim it for water. Do not drink it all.',
  'what-wilderness': 'This is the wilderness. Nothing grows here, like your manners. Follow the compass.',
  'what-cloud': 'See that swirl? Seed on the wind. Fly through it. Mouth closed.',
  'what-mushroom': 'A mushroom! Fly low through it. I am not telling you what happens. Heh.',
  'what-gnome': 'One of my cousins lives there. Fly over gently. He bites if you rush him.',
  'what-player': 'Another whorl. A real person, poor thing. Fly close and say hello.',
  'what-bloom': 'This plot is in bloom. The animals noticed before you did.',
  'what-storm': 'A sandstorm. It dries out everything it crosses. Guess who gets to water after.',
  'what-gold': 'A golden seed is out. First one there keeps it. Why are you still listening to me? Go!',
  // what is missing
  'need-hand': 'Not here, genius. You need the sand of a Hand under you.',
  'need-low': 'Lower. Lower! You cannot sow from the moon.',
  'need-sand': 'That is a river. Seeds want sand. Seeds are smarter than you.',
  'need-water': 'With what water? Skim a river first.',
  'need-seeds': 'Your pouch is empty. Like your head. Find a seed cloud.',
  // finding your way: a thing, then where it lies
  'nearest-hand': 'The nearest Hand is',
  'the-source': 'The Source is',
  'your-hand': 'Your own Hand is',
  ahead: 'straight ahead. Even you cannot miss it.',
  right: 'to your right. Your other right.',
  behind: 'behind you. Turn around, you turnip.',
  left: 'to your left.',
  'over-wild': 'You are lost. Again.',
  // things that happen
  'hyper-ready': 'Your hyper sow is ready. Try to draw something nice for once.',
  level: 'A new gardener level. Rarer seeds will find you now. No idea why.',
  foxfire: 'Ha! The foxfire! Everything counts double. Go, go, you glowing fool!',
  'foxfire-over': 'And it is over. You look ridiculous again.',
  grab: 'You have a passenger. Do what he asks. He is fussier than me.',
  quest: 'He is pleased. He will never stop talking about it. Trust me.',
  team: 'One more gnome on your team. He snores. You were warned.',
  lost: 'One of your gnomes changed sides. Cannot say I blame him.',
  cross: 'Oh, now you have made him cross. Slow down near mushrooms, you hooligan.',
  greet: 'A friend. Try not to embarrass me.',
  bloomed: 'A plot came into bloom. Hear that? Birds. Noisy things.',
  golden: 'The golden seed is yours. Fine. That was well flown. Do not let it go to your head.',
  storm: 'Sandstorm coming. I hope you remember where you planted. I do not.',
  dry: 'Some groves here are thirsty. Water them, before I have to.',
  'own-hand': 'Your own Hand has risen. Nice palm. Bit sweaty.',
  idle: 'Still there? The desert will not sow itself.',
  'idle-2': 'Try flying low. Everything interesting is near the ground. Like me.',
  'idle-3': 'Have you met a gnome yet? Look for mushrooms. Knock first.',
};
// the squeals of a gnome dangling from your whorl (the same words, in the same order, as JOYS in src/gnomes/gnomes.js):
// tools/voice.mjs makes joy-0 .. joy-9 of them, in a small high voice
export const JOY_LINES = ['Wheee!', 'Woohoo!', 'Yippee!', 'Again! Again!', 'Hee hee hee!', 'Faster! Faster!', 'Whoa ho ho!', 'Eeeee!', 'Best. Day. Ever!', 'Loop it! Loop it!'];
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
