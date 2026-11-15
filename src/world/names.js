// src/world/names.js
// Names for Hands and places, grown from a seed: two or three soft syllables that read like a map
// (Yanida, Cadio, Oru). Pure.
import { rng } from '../hand/dna.js';

const ONSET = ['', 'b', 'c', 'd', 'f', 'm', 'n', 'l', 'r', 's', 't', 'v', 'y', 'qu', 'br', 'tr'];
const VOWEL = ['a', 'e', 'i', 'o', 'u', 'a', 'e', 'io', 'ai'];
const CODA = ['', '', 'n', 'r', 'l', 's', 'th', 'd'];

export function nameFor(seed) {
  const rand = rng(seed), pick = (l) => l[Math.floor(rand() * l.length)];
  let s = '';
  for (let k = 0, n = 2 + Math.floor(rand() * 2); k < n; k++) s += pick(k ? ONSET.slice(1) : ONSET) + pick(VOWEL); // only the first syllable may open on a vowel
  s += pick(CODA);
  return s[0].toUpperCase() + s.slice(1);
}

// a name from a player, made safe to draw and to show others: no control or bidi characters, trimmed,
// at most 24 characters, not blocked. null when nothing usable is left.
const BLOCK = ['hitler', 'nazi', 'nigger', 'faggot']; // ponytail: a short blocklist; reports and owner review if names spread further
export function cleanName(s) {
  if (typeof s !== 'string') return null;
  const t = s.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '').trim().slice(0, 24).trim();
  if (!t || BLOCK.some((w) => t.toLowerCase().includes(w))) return null;
  return t;
}

// a name for a place, from a seed and what it is: summits get a landform word ("Oru Fell")
const LANDFORMS = ['Fell', 'Crown', 'Peak', 'Knoll', 'Cairn', 'Spire'];
export function placeName(seed, feature) {
  const base = nameFor((seed * 2654435761 + feature.length * 97 + feature.charCodeAt(feature.length - 1)) >>> 0);
  return feature.startsWith('summit:') ? `${base} ${LANDFORMS[seed % LANDFORMS.length]}` : base;
}
// the features a name can be given to: handbits (owners only) and fingertip summits (anyone, first come)
export const HANDBIT_FEATURE = /^([TIMRL][123]|P[1-9]|P1[0-9])$/, SUMMIT_FEATURE = /^summit:[0-4]$/;
