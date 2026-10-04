// src/hand/half.js
// Float to IEEE half-float bits, for RGBA16F textures built in a worker (which can't load three.js).
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);

export function toHalf(v) {
  f32[0] = v;
  const x = u32[0], sign = (x >>> 16) & 0x8000, e = ((x >>> 23) & 0xff) - 112, m = x & 0x7fffff;
  if (e <= 0) return e < -10 ? sign : sign | (((m | 0x800000) >> (1 - e)) + 0x1000) >> 13;
  if (e >= 31) return sign | 0x7c00;
  return sign | ((e << 10) + ((m + 0x1000) >> 13));
}
