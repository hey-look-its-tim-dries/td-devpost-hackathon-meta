// src/garden/hints.js
// How you play, said in the words of what you play with: hand movements in the headset, keys on a screen.
// One list for the atlas's How page, and the short lines the garden card and the panel show. Pure.
export const MOVES = [ // what, by hand, on a screen (null: the same either way)
  ['Fly', 'Raise a hand and point: your fingers are the arrow', 'A D turn · W S climb'],
  ['Sow', 'Pinch and hold, low over a Hand (it slows you)', 'hold SPACE'],
  ['Next seed', 'A short left pinch', 'Q · E'],
  ['Scatter', 'Sweep an open hand to a side, or throw it ahead', 'Z · C · R'],
  ['Water', 'Skim a river, then fly low over thirsty groves', null],
  ['Pour', 'Press a flat palm down', 'T'],
  ['Hyper sow', 'Hold a left pinch for a second', 'F'],
  ['Clear a grove', 'Make a fist and pull it up', 'X'],
  ['Eat a mushroom', 'Fly low through it: the foxfire', null],
  ['Carry a gnome', 'Fly low and gently over its mushroom', null],
  ['Set a gnome down', 'Toss an open hand upward', 'G'],
  ['Atlas', 'Turn your left palm up', 'M'],
];
const QUEST = { source: 'to the Source', hand: 'fly it there', cousin: 'to its cousin', foxfire: 'eat a mushroom', sow: 'sow', water: 'water', speed: 'FASTER', high: 'HIGHER', cloud: 'a seed cloud', river: 'skim the river' };
// the garden card's last line. gd: { gnome: { name, kind, have, need, left, done } | null, fox: { left, mult } | null,
// hyper (seconds left), charge 0..1 }; hands: true in the headset
export function hintLine(gd, hands) {
  const q = gd.gnome;
  if (q && !q.done) return `${q.name.toUpperCase()} WANTS: ${QUEST[q.kind] ?? 'a favour'}${q.need > 1 ? ` ${q.have}/${q.need}` : ''} · ${Math.floor(q.left / 60)}:${String(q.left % 60).padStart(2, '0')} · ${hands ? 'toss a hand up to set it down' : 'G sets it down'}`;
  if (gd.fox) return `FOXFIRE · ${gd.fox.left} s · everything counts x${gd.fox.mult} · eat another to chain`;
  if (gd.hyper) return `HYPER SOW · ${gd.hyper} s · fly low and draw with flowers`;
  if (hands) return gd.charge >= 1 ? 'HOLD A LEFT PINCH: HYPER SOW · pinch: sow · left pinch: next seed' : `pinch: sow · left pinch: next seed · hyper sow ${Math.round(gd.charge * 100)}%`;
  return gd.charge >= 1 ? 'F: HYPER SOW READY · SPACE plant · Q/E seed · X clear' : `SPACE plant · Q/E seed · X clear · hyper sow ${Math.round(gd.charge * 100)}%`;
}
export const hyperReady = (hands) => `Hyper sow is ready: ${hands ? 'hold a left pinch' : 'press F'} and draw with flowers`;
// said once, a few seconds after you start (unless the tutorial is teaching you)
export const firstHint = (hands) => (hands
  ? 'Point to fly · pinch and hold to sow · sweep an open hand to scatter · left palm up: the atlas, and how to play'
  : 'A D turn · W S climb · hold SPACE to sow · R Z C scatter · T pour · F hyper sow · M: the atlas, and how to play');
