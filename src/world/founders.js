// src/world/founders.js
// The First Ten: synthetic founding hands in a ring around the Source, wrists in and fingers out,
// little-finger edge towards the next hand's thumb, so the world has a coast to grow from. Their
// DNA is generated, never scanned, and they are labelled as founders. Pure.
import { packPalm, packPrint, synthPrint, rng } from '../hand/dna.js';
import { templatePalm } from '../hand/shape.js';
import { WORLD } from './units.js';

export const FOUNDER_NAMES = ['Yanida', 'Cadio', 'Oru', 'Fennick', 'Saelo', 'Marrow', 'Tilde', 'Quenna', 'Brisk', 'Ombre'];
export const RING_WRIST = 405 * WORLD; // world metres from the Source to each wrist
export const SOURCE_RADIUS = 250 * WORLD;
// how often each class turns up on a fingertip, roughly as in people
const CLASS_ODDS = [['ulnar', 0.58], ['whorl', 0.26], ['radial', 0.04], ['double', 0.04], ['pocket', 0.03], ['arch', 0.03], ['tented', 0.02]];
const pickClass = (x) => {
  for (const [cls, p] of CLASS_ODDS) if ((x -= p) < 0) return cls;
  return 'ulnar';
};

export function founders() {
  return FOUNDER_NAMES.map((name, i) => {
    const rand = rng(1000 + i * 7919);
    const palm = templatePalm({
      seed: Math.floor(rand() * 2 ** 32), fate: rand() < 0.75, sun: rand() < 0.3, mercury: rand() < 0.2, fused: i === 6, palette: i % 6,
    });
    const prints = [0, 1, 2, 3, 4].map((f) => packPrint(synthPrint(f, pickClass(rand()), Math.floor(rand() * 2 ** 32))));
    const rot = (i / FOUNDER_NAMES.length) * Math.PI * 2;
    return { name, palm: packPalm(palm), prints, pose: { x: Math.sin(rot) * RING_WRIST, z: -Math.cos(rot) * RING_WRIST, rot, mirror: false } };
  });
}

// hand metres (X towards the thumb, Y towards the fingers) to world metres (x, z), and back
export function toWorld(pose, X, Y) {
  const c = Math.cos(pose.rot), s = Math.sin(pose.rot), x = (pose.mirror ? -X : X) * WORLD, y = Y * WORLD;
  return [pose.x + c * x + s * y, pose.z + s * x - c * y];
}
export function toHand(pose, x, z) {
  const c = Math.cos(pose.rot), s = Math.sin(pose.rot), dx = x - pose.x, dz = z - pose.z;
  const X = (c * dx + s * dz) / WORLD;
  return [pose.mirror ? -X : X, (s * dx - c * dz) / WORLD];
}
