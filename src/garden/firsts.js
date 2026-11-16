// src/garden/firsts.js
// "What is what", for the first minutes: the first time you meet each thing in the world, a short note says what
// it is and what to do with it. One note at a time, a few seconds each, each said once and never again (kept on
// your device). When all are said this is silent for good. Pure but for storage.
// st: { onHand, onWater (what is under you), cloud, mushroom, gnome, player, storm, gold (near you now), bloom (level of the plot under you) }
export const FIRSTS = [
  { id: 'screen', title: 'Your screen', text: 'Top: the compass. Left: the world in numbers. Right: the radar. Below: where you are, and your seeds.', when: () => true },
  { id: 'hand', title: 'A Hand', text: 'This sand is the palm of a player. Fly low over it and you can sow.', when: (s) => s.onHand },
  { id: 'river', title: 'A river', text: 'A palm line full of water. Skim low over it to fill up, then water thirsty groves.', when: (s) => s.onWater },
  { id: 'wilderness', title: 'The wilderness', text: 'Nothing grows between the Hands. The compass marks the nearest Hand.', when: (s) => !s.onHand && !s.onWater },
  { id: 'cloud', title: 'A seed cloud', text: 'That swirl of little flowers is seed on the wind. Fly through it and the seeds are yours.', when: (s) => s.cloud },
  { id: 'mushroom', title: 'A mushroom', text: 'Fly low through it to eat it: the world glows for a while and everything counts double.', when: (s) => s.mushroom },
  { id: 'gnome', title: 'A gnome', text: 'It lives in that mushroom. Fly low and gently over it and it jumps on, with a wish.', when: (s) => s.gnome },
  { id: 'player', title: 'Another player', text: 'A real person: the dark dot on your radar. Fly close and your whorls braid in greeting.', when: (s) => s.player },
  { id: 'bloom', title: 'A plot in bloom', text: 'Enough groves flower here: wildlife moves in. Keep it watered and it blooms further.', when: (s) => s.bloom > 0 },
  { id: 'storm', title: 'The sandstorm', text: 'It dries out every grove it crosses. Water them afterwards and they recover.', when: (s) => s.storm },
  { id: 'gold', title: 'The golden seed', text: 'One is out: the gold star on your radar. The first player to reach it wins a rare kind.', when: (s) => s.gold },
];
const SHOW = 9, GAP = 3, START = 2.5; // seconds a note stays, the pause before the next, and the quiet at the very start
export function createFirsts(storage, { off = false, key = 'pwc.firsts.v1' } = {}) {
  let told = [];
  try { const d = JSON.parse(storage?.getItem(key)); if (Array.isArray(d)) told = d.filter((x) => typeof x === 'string'); } catch {}
  let now = null, age = 0, wait = START;
  return {
    get left() { return FIRSTS.filter((n) => !told.includes(n.id)).length; },
    // every frame; the note to show now ({ id, title, text, progress 0..1 of its time }), or null
    update(st, dt) {
      if (off) return null;
      if (now) {
        age += dt;
        if (age < SHOW) return { ...now, progress: age / SHOW };
        now = null; wait = GAP;
        return null;
      }
      if ((wait -= dt) > 0) return null;
      const next = FIRSTS.find((n) => !told.includes(n.id) && n.when(st));
      if (!next) return null;
      told.push(next.id);
      try { storage?.setItem(key, JSON.stringify(told)); } catch {}
      now = { id: next.id, title: next.title, text: next.text }; age = 0;
      return { ...now, progress: 0 };
    },
  };
}
