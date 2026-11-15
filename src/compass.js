// src/compass.js
// The HUD's arithmetic, kept pure for node tests: markers on the compass ribbon, altitude in spans.
export const SPAN = 6000; // metres (spec 16: 1 span = 6 km)
export const spans = (m) => (m / SPAN < 1 ? (m / SPAN).toFixed(2) : (m / SPAN).toFixed(1));

// markers [{ label, x, z, ... }] seen from `me` facing `yaw` (glide.js: yaw 0 looks along -z):
// x -1..1 across the ribbon (90 degrees each side), behind: past 90 degrees (clamped to an end)
export function bearings(me, yaw, markers) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  return markers.map((m) => {
    const vx = m.x - me[0], vz = m.z - me[2], a = Math.atan2(vx * rx + vz * rz, vx * fx + vz * fz);
    return { ...m, x: Math.max(-1, Math.min(1, a / (Math.PI / 2))), behind: Math.abs(a) > Math.PI / 2, dist: Math.hypot(vx, vz) };
  });
}
