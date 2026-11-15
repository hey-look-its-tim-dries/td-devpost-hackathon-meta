// src/hand/worker.js
// Builds a Hand off the main thread: DNA → shape → handbits → terrain → arrays the GPU takes as they
// are. Workers can't use the page's importmap, so nothing here may import three.js.
import { unpackPalm, unpackPrint } from './dna.js';
import { handShape } from './shape.js';
import { labelHand } from './label.js';
import { bakeHand } from './bake.js';
import { toHalf } from './half.js';
import { cellsOf } from '../world/where.js';

onmessage = ({ data: { id, palm, prints, cell } }) => {
  try { build(id, palm, prints, cell); } catch (e) { postMessage({ id, error: String(e?.stack ?? e) }); } // say what broke, not a bare error event
};
function build(id, palm, prints, cell) {
  const shape = handShape(unpackPalm(palm));
  const lab = labelHand(shape, cell);
  const b = bakeHand(shape, lab, prints.map(unpackPrint));
  const N = b.w * b.h, texA = new Uint16Array(N * 4), cells = cellsOf(lab); // the handbit under each cell, for charting (world/where.js)
  for (let i = 0; i < N; i++) {
    texA[i * 4] = toHalf(b.height[i]);
    texA[i * 4 + 1] = toHalf(b.cos[i]);
    texA[i * 4 + 2] = toHalf(b.sin[i]);
    texA[i * 4 + 3] = toHalf(b.water[i]);
  }
  postMessage(
    { id, w: b.w, h: b.h, cell: b.cell, x0: b.x0, y0: b.y0, height: b.height, texA, info: b.info, handbits: lab.handbits, cells },
    [b.height.buffer, texA.buffer, b.info.buffer, cells.buffer],
  );
}
