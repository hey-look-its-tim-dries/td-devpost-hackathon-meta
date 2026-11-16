// src/guide.js
// "Explain this game to me": the whole game from A to Z for someone who has never seen it, in the order you
// meet things. GUIDE is the text; guideHtml() makes the page of it, ending with every move (src/garden/hints.js)
// in the words of what you play with. Pure.
import { MOVES } from './garden/hints.js';

export const GUIDE = [
  { title: 'The world', text: ['A desert made of hands. Every piece of land is the palm of a player: its lines are rivers, its fingertips are hills. Ten founder Hands lie in a ring round the Source; every player who joins adds a Hand, so the world grows with its players.', 'It is one world for everyone, live. What anyone plants is there for all, and stays.'] },
  { title: 'Your whorl', text: ['You are a whorl: a creature of ink strands that flies. It takes its shape from your own five fingerprints once you lay your Hand, so no two players look alike.', 'It also wears what you do: tiny flecks for the seeds you carry, and a bouquet of everything you have ever sown, the first flower at its head.'] },
  { title: 'Flying', text: ['You fly all the time; you only steer. Dive and you gain speed, climb and you lose it. Skimming just over the ground is the fastest way to travel.', 'The compass at the top points to places; the round radar shows Hands, players, seed clouds and blooming plots near you.'] },
  { title: 'Seeds', text: ['Seed drifts on the wind in swirling clouds, one kind per cloud, out of 403 real flowers and trees. Fly through a cloud and the seeds are yours. Rarer kinds come to you as your gardener level rises.', 'Flying low over a grove in full flower also gives you a seed of it.'] },
  { title: 'Sowing', text: ['Fly low over the sand of a Hand and sow: a grove comes up where you are. You slow down while you sow. Seeds need sand: not the river, not the wilderness between the Hands.', 'Every plot of a Hand holds 80 groves. Some flowers are pixel art and lie down as mosaic tiles, some are painted, some are 3D: mixing them is the point.'] },
  { title: 'Water and growing', text: ['A grove grows through four stages, one for each watering. Skim low over a river to fill up (five pours), then fly low over thirsty groves, or pour over the ones around you.', 'Anyone can water anyone\'s grove. A grove nobody tends dries out after a day and a half and dies after four.'] },
  { title: 'Bloom and wildlife', text: ['As a plot fills with flowering groves it comes into bloom, in four levels. Insects arrive first, then birds and fish, then animals: 285 real species, each drawn to its own kind of land.', 'Everything you find, plant or meet goes into your herbarium in the atlas.'] },
  { title: 'Hyper sow', text: ['Watering and catching seed clouds charge the hyper sow. Set it off and for ten seconds single plants fall along your path, free: you draw with flowers.'] },
  { title: 'Sandstorm and golden seed', text: ['Every ten minutes a sandstorm crosses the world and parches the groves in its path until someone waters them. Every four minutes one golden seed appears somewhere: the first player to reach it wins a legend. Both are the same for every player.'] },
  { title: 'Mushrooms and the foxfire', text: ['Wild mushrooms stand on every Hand, and more grow on dead groves. Fly low through one and you eat it: for half a minute the world turns to foxfire, a glowing night in which you fly faster and everything counts double. Eat another to chain it.'] },
  { title: 'Gnomes', text: ['About four mushrooms in ten house a gnome. Fly low and gently over one and it jumps onto your whorl; roar past and it is cross with you. A gnome on board has a side quest for you: three minutes to do it.', 'Do it and the gnome joins your team. Gnomes on other players\' teams can be won over the same way, and yours can be won from you.'] },
  { title: 'Other players', text: ['Everyone you see is a real player. Fly close to one and your whorls braid: that is the greeting, and it makes you friends in each other\'s passport. The boards show who planted most and who converted most gnomes.'] },
  { title: 'Your own Hand', text: ['After a little gardening the game offers you a Hand of your own. You read your hand by eye: pick the pattern of each fingertip and trace your palm lines. No photo is taken. The world then shows three places where it fits; choose one and your Hand rises out of the wilderness, for everyone.'] },
  { title: 'The atlas', text: ['Your atlas holds the world map, your own page (Me), your herbarium (Garden), the Community Hand that everyone builds together at the Source, the journal of what happened, and a page with every move (How).'] },
  { title: 'Signing in', text: ['You can play as a guest: your garden is then kept on this device. Sign in and it follows you to every device. Only an anonymous account id is kept: no name, no e-mail.'] },
];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// hands: true for hand movements (the headset), false for keys (a screen)
export function guideHtml(hands) {
  const parts = GUIDE.map((s, i) => `<section><h3><span>${i + 1}</span>${esc(s.title)}</h3>${s.text.map((p) => `<p>${esc(p)}</p>`).join('')}</section>`);
  const moves = MOVES.map(([what, hand, keys]) => `<tr><th>${esc(what)}</th><td>${esc(hands ? hand : keys ?? hand)}</td></tr>`).join('');
  return `${parts.join('')}<section><h3><span>${GUIDE.length + 1}</span>Every move, ${hands ? 'with your hands' : 'on a screen'}</h3><table>${moves}</table></section>`;
}
