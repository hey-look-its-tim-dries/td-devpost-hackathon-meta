// src/world/community.js
// The Community Hand (spec 6.4): built at the Source from donated handbits, one per slot. Its 22 slots
// are the 15 finger handbits and the palm regions P1 to P7. Filled, it is sealed and the next starts. Pure.
export const SLOTS = [...'TIMRL'].flatMap((f) => [1, 2, 3].map((k) => `${f}${k}`)).concat([1, 2, 3, 4, 5, 6, 7].map((k) => `P${k}`));
export const slotFor = (code) => (SLOTS.includes(code) ? code : null);
export const isSealed = (slots) => SLOTS.every((s) => slots.some((q) => q.slot === s));
