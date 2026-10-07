// src/net/wire.js
// The room protocol, binary and little-endian. A pose is 21 bytes: float32 x, y, z, yaw, pitch and a
// uint8 mode (0 fly, 1 atelier, 2 merge, 3 rise). A snapshot is uint16 count, then uint16 id + pose
// per player. Pure: the page, the Room Durable Object and tests.
export const POSE_BYTES = 21;
const FIELDS = ['x', 'y', 'z', 'yaw', 'pitch'];

export function encodePose(p, out = new Uint8Array(POSE_BYTES), offset = 0) {
  const v = new DataView(out.buffer, out.byteOffset + offset, POSE_BYTES);
  FIELDS.forEach((k, i) => v.setFloat32(i * 4, +p[k] || 0, true));
  v.setUint8(20, p.mode & 255);
  return out;
}

export function decodePose(b, offset = 0) {
  const v = new DataView(b.buffer, b.byteOffset + offset, POSE_BYTES), p = { mode: v.getUint8(20) };
  FIELDS.forEach((k, i) => (p[k] = v.getFloat32(i * 4, true)));
  return p;
}

export function encodeSnapshot(list) {
  const out = new Uint8Array(2 + list.length * (2 + POSE_BYTES)), v = new DataView(out.buffer);
  v.setUint16(0, list.length, true);
  list.forEach(({ id, pose }, i) => { const o = 2 + i * (2 + POSE_BYTES); v.setUint16(o, id & 0xffff, true); encodePose(pose, out, o + 2); });
  return out;
}

export function decodeSnapshot(b) {
  if (b.length < 2) return [];
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength), n = v.getUint16(0, true);
  if (b.length < 2 + n * (2 + POSE_BYTES)) return [];
  return Array.from({ length: n }, (_, i) => { const o = 2 + i * (2 + POSE_BYTES); return { id: v.getUint16(o, true), pose: decodePose(b, o + 2) }; });
}
