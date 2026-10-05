// src/world/mine.js
// Your own Hand, kept on this device: its DNA, where it lies, and its name. Nothing else: no images,
// no tracking data. `storage` is localStorage in the page, a stand-in in tests. Pure.
import { unpackPalm, unpackPrint, toB64, fromB64, palmBytes } from '../hand/dna.js';

const KEY = 'pwc.hand.v1';

export function saveHand(storage, { palm, prints, pose, name }) {
  storage.setItem(KEY, JSON.stringify({ palm: toB64(palm), prints: prints.map(toB64), pose: { x: pose.x, z: pose.z, rot: pose.rot, mirror: !!pose.mirror }, name, at: Date.now() }));
}

export function loadHand(storage) {
  try {
    const v = JSON.parse(storage.getItem(KEY));
    if (!v || !Array.isArray(v.prints) || v.prints.length !== 5 || ![v.pose?.x, v.pose?.z, v.pose?.rot].every(Number.isFinite)) return null;
    const palm = fromB64(v.palm), prints = v.prints.map(fromB64);
    if (palm.length < 28 || palm.length !== palmBytes(unpackPalm(palm).lines.length) || prints.some((p) => p.length !== 44)) return null;
    prints.forEach(unpackPrint); // each throws on a version it does not know
    return { palm, prints, pose: { x: v.pose.x, z: v.pose.z, rot: v.pose.rot, mirror: !!v.pose.mirror }, name: String(v.name ?? '').slice(0, 40) };
  } catch {
    return null;
  }
}

export const forgetHand = (storage) => storage.removeItem(KEY);
