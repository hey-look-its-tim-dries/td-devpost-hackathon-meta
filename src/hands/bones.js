// src/hands/bones.js: the stems of a gardener's hand (pure): wrist to each knuckle, then down each finger.
const FINGERS = ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
const PARTS = ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'];
export const BONES = [
  ['wrist', 'thumb-metacarpal'], ['thumb-metacarpal', 'thumb-phalanx-proximal'], ['thumb-phalanx-proximal', 'thumb-phalanx-distal'], ['thumb-phalanx-distal', 'thumb-tip'],
  ...FINGERS.flatMap((f) => [['wrist', `${f}-metacarpal`], ...PARTS.slice(1).map((p, k) => [`${f}-${PARTS[k]}`, `${f}-${p}`])]),
];

// thumb tip to index tip (metres) -> how open the index flower is: a bud while you pinch, wide open at 6 cm
export const openness = (d) => Math.max(0, Math.min(1, (d - 0.015) / 0.045));

// Your hand wears your garden: the kinds grown most on your laid Hand flower on your fingertips (then the seed
// you carry, then the garden palette), and blossoms climb your fingers as your Hand fills up.
const PALETTE = [{ petal: '#e8a6c8', heart: '#f2c84b' }, { petal: '#f2c84b', heart: '#e8743b' }, { petal: '#e8743b', heart: '#f2c84b' }, { petal: '#a98bd8', heart: '#f2c84b' }];
export const MAX_BLOSSOMS = 14;
// plots: [{ hand, sp, wild }], handId: your Hand's id or null, species: [{ color, color2 }], seed: the species you carry
export function decorOf(plots, handId, species, seed) {
  const n = new Map();
  let total = 0;
  if (handId != null) for (const p of plots) if (p.hand === handId && !p.wild) { n.set(p.sp, (n.get(p.sp) ?? 0) + 1); total++; }
  const kinds = [...n.keys()].sort((a, b) => n.get(b) - n.get(a));
  const look = (sp) => species[sp] && { petal: species[sp].color, heart: species[sp].color2 };
  const tips = [...new Set([...kinds, seed])].map(look).filter(Boolean).slice(0, 4);
  while (tips.length < 4) tips.push(PALETTE[tips.length]);
  return { tips, blossoms: total ? Math.min(MAX_BLOSSOMS, Math.round(Math.sqrt(total) * 1.6)) : 0, colours: kinds.length ? kinds.map(look).filter(Boolean) : [tips[0]] };
}
