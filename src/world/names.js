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
