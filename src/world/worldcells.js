// src/world/worldcells.js
// The whole world in one hand. The Community Hand is a grid of cells (lab: { w, h, label[] }, label >= 0 where the
// cell is hand); every sowing [x, z, colour] (world metres, the Source at 0, 0, north = -z) colours the hand cell
// that lies where it does in the world: radius R maps onto the hand's square, and what falls outside the outline
// goes to the nearest cell that is hand. Pure.
export function nearest(lab) {
  const n = lab.w * lab.h, near = new Int32Array(n).fill(-1), queue = [];
  for (let i = 0; i < n; i++) if (lab.label[i] >= 0) { near[i] = i; queue.push(i); }
  for (let q = 0; q < queue.length; q++) { const i = queue[q], c = i % lab.w, r = (i - c) / lab.w; for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const c2 = c + dc, r2 = r + dr, j = r2 * lab.w + c2; if (c2 >= 0 && c2 < lab.w && r2 >= 0 && r2 < lab.h && near[j] < 0) { near[j] = near[i]; queue.push(j); } } }
  return near;
}
export function worldCells(points, R, lab, near = nearest(lab)) {
  const cells = new Map(); // cell index (row * w + column; rows run south to north) -> colour
  for (const [x, z, color] of points) {
    const c = Math.min(lab.w - 1, Math.max(0, Math.floor((x / R * 0.5 + 0.5) * lab.w))), r = Math.min(lab.h - 1, Math.max(0, Math.floor((0.5 - z / R * 0.5) * lab.h)));
    cells.set(near[r * lab.w + c], color);
  }
  return cells;
}
