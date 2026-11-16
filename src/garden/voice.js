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
// More ways to say the lines he says often, so he hardly ever repeats himself: each becomes a line of its own
// (`<id>-v1`, `<id>-v2`, ...) with its own clip, and pickLine() takes one of them at random, never the last one again.
export const MORE = {
  back: ['Oh good. It is you. I had just got comfortable.', 'Back again? The flowers asked about you. I said nothing nice.', 'Look what the wind blew in. Pouch full, I hope.'],
  'need-hand': ['Sand of a Hand, I said. This is nowhere. You are sowing nowhere.', 'No Hand under you. The seed would only fall and sulk.', 'Find a palm first. Big sandy thing. Hard to miss, yet here we are.'],
  'need-low': ['Down! Down, you kite. Seeds do not have parachutes.', 'Too high. The ground is the brown bit.', 'Come lower. I can barely see you, and I am not complaining about that.'],
  'need-sand': ['Water. That is water. Flowers are not fish.', 'You are over a river, you sponge. Sand!', 'Wet. Wrong. Move over to the dry part.'],
  'need-water': ['You are dry as my humour. Skim a river.', 'No water in you. Rivers are the blue lines. Go.', 'Pouring nothing does nothing. Fill up first.'],
  'need-seeds': ['Empty pouch. Catch a seed cloud, or stand there looking pretty.', 'Out of seeds. Chase one of those swirls on the wind.', 'Nothing left to sow. The swirls, child. The swirls.'],
  ahead: ['dead ahead. Just keep your nose still.', 'right in front of you. Open your eyes.', 'ahead. Straight. No, straighter.'],
  right: ['on your right. The hand you do not think with.', 'off to the right. Lean into it.', 'right of you. Turn. More. There.'],
  behind: ['behind you. You flew straight past it.', 'at your back. Around you go.', 'the other way entirely. Naturally.'],
  left: ['on your left. Yes, that left.', 'off to the left. Swing round.', 'left of you. Do keep up.'],
  'over-wild': ['Nothing but wilderness. Wonderful choice.', 'Lost again. I should knit you a map.', 'Empty dunes. Even the lizards left.'],
  'hyper-ready': ['Hyper sow is charged. Do not waste it on a straight line.', 'You are tingling again. Hyper sow. Go make a mess.', 'Hyper sow, ready. Write your name. If you can spell it.'],
  level: ['A new level. They will let anyone garden these days.', 'Level up. Do not look so surprised, I am surprised enough for both of us.', 'Another level. The rare seeds have heard of you now. Poor things.'],
  foxfire: ['Foxfire! The world has gone purple and so have you. Double everything!', 'Ha ha! You ate it! Sow, you luminous lunatic, sow!', 'Foxfire time. Everything counts twice. Even your mistakes.'],
  'foxfire-over': ['Show is over. Back to beige.', 'It wore off. So did your charm.', 'Done glowing. Drink some water.'],
  grab: ['A cousin of mine just grabbed your tail. Listen to him.', 'You picked up a gnome. He has opinions. Many.', 'Passenger on board. Do as he says, he bites.'],
  quest: ['He got what he wanted. Insufferable now.', 'Wish granted. He will tell the whole family.', 'Happy gnome. A rare and noisy thing.'],
  team: ['Another gnome for your team. Feed him at your own risk.', 'He has joined you. He will rearrange your garden.', 'Your team grows. So does the snoring.'],
  lost: ['A gnome left your team. He packed quickly.', 'Somebody charmed one of your gnomes away. Rude, but fair.', 'One gnome fewer. He never liked your flying.'],
  cross: ['You frightened him! Gently near mushrooms, you cannonball.', 'Now he is sulking. Fly softer next time.', 'Too fast, too rude. He will remember that.'],
  greet: ['Another gardener. Be nice. Pretend, at least.', 'Company! Swap seeds, do not swap opinions.', 'Someone to fly with. Lucky them, I suppose.'],
  bloomed: ['Full bloom over there. The bees are unbearable about it.', 'Something bloomed. You may feel smug for one minute.', 'A plot in bloom. Even I have to admit it is pretty.'],
  golden: ['You got the golden seed. I am speechless. Enjoy it, it will not last.', 'Golden seed, caught. Beginner\'s luck, the tenth time running.', 'Gold! Plant it somewhere I can see it.'],
  storm: ['A storm is on its way. Everything in its path will want watering.', 'Sand in the air. Hold on to your hat. I am holding mine.', 'Here comes the wind. Your poor seedlings.'],
  dry: ['Thirsty groves below. Do something about it.', 'These ones are wilting. Water. Now, ideally.', 'Dry leaves down there. A gardener would notice.'],
  'step-done': ['Good. Next.', 'That will do.', 'Passable.'],
};
// What he mutters when nothing is happening: a new one every minute or so, none of them twice in a row.
export const MUSINGS = [
  'I planted the first cactus here. It still does not write.', 'When I was young the dunes were taller. So was I.', 'Do you know how long a beard takes? Longer than you have been alive.',
  'I once out-stared a lizard. Three days. He blinked.', 'My hat has a bell so the cousins can find me. I regret the bell.', 'Sand in the beard, sand in the tea, sand in the sandwiches. Fitting, that last one.',
  'Fly like that near my mushrooms and we will have words.', 'I knew a whorl once who never sowed a thing. Nobody remembers his name.', 'The rivers are palm lines, you know. Somebody\'s fortune, running downhill.',
  'Flowers do not care who planted them. I do. I keep a list.', 'Your flying has improved. From dreadful to merely alarming.', 'In my day we sowed uphill. Both ways.',
  'A gnome never forgets. A gnome also never forgives. Plan accordingly.', 'I am not grumpy. This is my resting beard.', 'Somebody sowed tulips next to my poppies. I am choosing to rise above it.',
  'The wind is from the west. Or the east. One of the directions.', 'I could have been a lighthouse keeper. No lighthouses. So. Desert.', 'You know what this place needs? More purple. I said what I said.',
  'Every Hand here is a real one. Some people have very strange palms.', 'Keep sowing. I am counting, and so far I am unimpressed.', 'Listen. Hear that? Nothing. That is the sound of you not planting.',
  'The birds gossip about you. I will not repeat it. It was mostly true.', 'I taught the foxes to dig. I did not teach them where. Mistake.', 'Rain? Here? You are the rain, child. Go skim a river.',
  'A good garden is ninety parts water and ten parts stubbornness.', 'My cousin Bodkin says hello. He does not mean it.', 'Never trust a mushroom that glows. Eat it, certainly. But do not trust it.',
  'I have had this pipe for two hundred years. Never lit it. Fire near a beard? No.', 'You fly as if the ground owed you money.', 'Somewhere out there a seed cloud has your name on it. Misspelled, probably.',
  'If you see a golden light, fly at it. If you see me, fly around.', 'The Source is where it all began. Bit damp for my taste.', 'I counted the dunes once. Lost count at four. Wind moved them.',
  'Do not mind me. Just an old gnome, judging quietly.', 'A bee landed on my nose yesterday. We have an understanding now.', 'Plant a tree and in a hundred years you get shade. I can wait.',
  'They say laughter makes flowers grow. I have never tested it.', 'Low and slow near the mushrooms. That is all I ask. That, and everything else.', 'The tall ones call this a game. I call it Tuesday.',
  'I saw you take that turn. Elegant. Like a falling wardrobe.', 'Somebody has to keep this desert in order. Apparently it is me.', 'You smell of lavender. Suspicious.',
  'Trees first, then birds, then noise. It is always the same.', 'The cacti are the only sensible plants. Keep your distance, mind your business.', 'I have a cousin on every Hand. Family dinners are a nightmare.',
  'The sand remembers every seed. I remember every crash.', 'Careful with the hyper sow. Last one drew a moustache on a mountain.', 'What do you call a gnome without a hat? Cold.',
  'I wrote a poem about you. It is short. It goes: hmm.', 'If the compass spins, it is not broken. You are.', 'A river is just rain that made up its mind.',
  'The foxfire is not dangerous. It is just very, very loud to look at.', 'I had a garden gnome once. Awkward.', 'Plant in threes. Or do not. I am a gnome, not your mother.',
  'You missed a spot. No, I will not say where.', 'Butterflies. Useless. Lovely, but useless.', 'There is a mushroom out there the size of a house. I am not saying where it is.',
  'The moon here is somebody\'s fingernail. Do not think about it too hard.', 'Slower. Enjoy it. The desert took ten thousand years, you can take ten seconds.', 'I like you. Do not tell the others. I will deny it.',
  'Seeds in the pouch are worth nothing. Seeds in the sand, now.', 'One day all this will be forest. Then I shall complain about the leaves.', 'A tidy plot is a happy plot. A happy plot attracts rabbits. There is no winning.',
  'Go north for the Source. Or is it south. I have not moved in years.', 'I have seen whorls come and go. You go more than most.', 'That was nearly a compliment. I felt it coming and stopped.',
  'The snails are faster than they look. They are also plotting something.', 'Sow something blue. For me. I never ask for anything.', 'Wind in the beard. Best feeling there is. You would not know.',
  'I can hear a cactus flowering. Tiny little pop. You talked over it.', 'Old gnome saying: he who sows nothing, reaps my disappointment.', 'If you find my other boot, it is the left one. Brown. Keep quiet about it.',
  'More flowers, fewer loops. Actually, some loops. I liked the loops.', 'The frogs have started a choir. I blame the water you poured.', 'Do you ever land? No? Good. The ground is mine.',
  'Mushrooms are the desert\'s way of winking.', 'I knew your whorl when it was a squiggle.', 'Somebody planted a whole Hand in a day once. Showing off, if you ask me.',
  'Careful. That grove is young. Younger than my socks.', 'The owls tell me you were up late. Sowing, I hope.', 'Sand gets everywhere. I have made my peace. Mostly.',
  'There are four hundred kinds of flower out here. You have found, what, a handful? Tsk.', 'An empty Hand is a sad thing. Fill one.', 'Big sky today. Try not to bump into it.',
  'I keep bees. Well. They keep me.', 'Somebody is flying about out there right now. Go and bother them instead.', 'The best gardeners talk to their plants. The plants would rather they did not.',
  'Nice bouquet you are wearing. Bit much, but nice.', 'I shall be here. Being right about things.', 'Go on, then. Surprise me.',
];
for (const [id, alts] of Object.entries(MORE)) alts.forEach((text, i) => { LINES[`${id}-v${i + 1}`] = text; });
MUSINGS.forEach((text, i) => { LINES[`muse-${i}`] = text; });
// one of the ways to say `id` (itself or one of its `-vN`), at random but never `was` again when there is a choice
export function pickLine(id, was = null, rand = Math.random) {
  const all = [id, ...(MORE[id] ?? []).map((_, i) => `${id}-v${i + 1}`)], free = all.length > 1 ? all.filter((x) => x !== was) : all;
  return free[Math.floor(rand() * free.length) % free.length];
}
// the squeals of a gnome dangling from your whorl (the same words, in the same order, as JOYS in src/gnomes/gnomes.js):
// tools/voice.mjs makes joy-0 .. joy-9 of them, in a small high voice
export const SCREAM_LINES = ['Aaaaaaaaah!', 'Noooooooo!', 'Waaaaaaaah!', 'Eeeeeeeeek!', 'Help meeeee!', 'Not like thiiiis!', 'Yaaaaaargh!', 'Mummyyyyyy!'];
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
