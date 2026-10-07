// src/world/mine.js
// Your own Hand, kept on this device: its DNA, where it lies, and its name. Nothing else: no images,
// no tracking data. `storage` is localStorage in the page, a stand-in in tests. `checkHand` is the one
// gate for a Hand coming from storage or from the network, on the client and on the server. Pure.
import { unpackPalm, unpackPrint, toB64, fromB64, palmBytes } from '../hand/dna.js';

const KEY = 'pwc.hand.v1';
const REACH = 100000; // metres from the Source a Hand may lie

const bytes = (v) => (typeof v === 'string' ? fromB64(v) : v instanceof Uint8Array ? v : Array.isArray(v) ? Uint8Array.from(v) : null);

export function checkHand(v) {
  try {
    if (!v || !Array.isArray(v.prints) || v.prints.length !== 5 || ![v.pose?.x, v.pose?.z, v.pose?.rot].every(Number.isFinite)) return null;
    if (Math.hypot(v.pose.x, v.pose.z) > REACH || v.pose.mirror) return null;
    const name = String(v.name ?? '').trim();
    if (!name || name.length > 40) return null;
    const palm = bytes(v.palm), prints = v.prints.map(bytes);
    if (!palm || prints.some((p) => !p)) return null;
    if (palm.length < 28 || palm.length !== palmBytes(unpackPalm(palm).lines.length) || prints.some((p) => p.length !== 44)) return null;
    if (prints.some((p) => !unpackPrint(p).cls) || unpackPalm(palm).lines.some((l) => !l.kind)) return null; // unpack throws on a version it does not know
    return { palm, prints, pose: { x: v.pose.x, z: v.pose.z, rot: v.pose.rot, mirror: false }, name };
  } catch {
    return null;
  }
}

export function saveHand(storage, { palm, prints, pose, name, id, pending }) {
  storage.setItem(KEY, JSON.stringify({ palm: toB64(palm), prints: prints.map(toB64), pose: { x: pose.x, z: pose.z, rot: pose.rot, mirror: !!pose.mirror }, name, ...(id ? { id } : {}), ...(pending ? { pending: true } : {}) }));
}

export function loadHand(storage) {
  try {
    const v = JSON.parse(storage.getItem(KEY)), h = checkHand(v);
    return h && { ...h, id: typeof v.id === 'string' ? v.id.slice(0, 64) : undefined, pending: !!v.pending };
  } catch {
    return null;
  }
}

export const forgetHand = (storage) => storage?.removeItem(KEY);
