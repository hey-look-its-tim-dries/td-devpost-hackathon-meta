// src/postcard.js
// Your Hand as a printed map (spec 6.4 Postcards, 11.3 step 12): parchment, your Hand inked at its own
// scale with its rivers and handbit names, a compass rose, a scale bar, a frame and a dated Seal stamp.
// Made from the map, never from a photo. And your data as JSON (spec 8.5 Export). Pure drawing.
import { handShape, OUTLINE } from './hand/shape.js';
import { unpackPalm, toB64 } from './hand/dna.js';

export const POSTCARD = { w: 1600, h: 1100 };
const INK = '#16100e', PARCH = '#f3e4d2', RIVER = '#2f5d7c', SEAL = '#b8442e', GILT = '#c9a35a';
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function drawPostcard(g, { name, palm, handbits = [], names = {}, date = new Date(), tones = null }) {
  const { w, h } = POSTCARD, shape = handShape(unpackPalm(palm));
  g.fillStyle = PARCH; g.fillRect(0, 0, w, h);
  g.strokeStyle = INK; g.lineWidth = 6; g.strokeRect(30, 30, w - 60, h - 60);
  g.lineWidth = 2; g.strokeRect(46, 46, w - 92, h - 92);
  // the Hand, fingers up, fitted to the left two thirds (hand metres: about -200..300 across, -20..640 up)
  const k = Math.min(900 / 500, 960 / 660), at = ([X, Y]) => [90 + (X + 200) * k, h - 80 - (Y + 20) * k];
  const path = (pts, close) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(...at(p)) : g.moveTo(...at(p)))); if (close) g.closePath(); };
  g.fillStyle = tones?.[1] ?? '#e2b48f'; g.strokeStyle = INK; g.lineWidth = 3;
  for (const f of shape.fingers) {
    const hw = f.width / 2, pt = (u, t) => [f.base[0] + f.side[0] * u + f.dir[0] * t, f.base[1] + f.side[1] * u + f.dir[1] * t];
    path([pt(-hw, 0), pt(-hw, f.len - hw), pt(0, f.len), pt(hw, f.len - hw), pt(hw, 0)], true); g.fill(); g.stroke();
  }
  path(OUTLINE, true); g.fill(); g.stroke();
  g.save(); path(OUTLINE, true); g.clip(); // rivers run to the coast, not past it
  g.strokeStyle = RIVER; g.lineCap = 'round';
  for (const l of shape.lines) { g.lineWidth = 4 + 3 * l.strength; path(l.pts, false); g.stroke(); }
  g.restore();
  // handbit names where they lie
  g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const b of handbits) {
    if (b.area < 400) continue;
    g.font = `${b.kind === 'palm' ? 600 : 400} ${b.kind === 'palm' ? 26 : 18}px Georgia, serif`;
    g.fillText(names[b.code] ?? b.name, ...at([b.cx, b.cy]));
  }
  // the title block, top right
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.fillStyle = SEAL; g.font = '700 28px Inter, system-ui, sans-serif'; g.fillText('PALM WHORL CITIES', 1060, 150);
  g.fillStyle = INK; g.font = '600 92px Georgia, serif'; g.fillText(name, 1060, 250, 470);
  g.fillStyle = 'rgba(22,16,14,0.7)'; g.font = 'italic 400 30px Georgia, serif'; g.fillText('a piece of the world map', 1060, 300);
  // the compass rose
  g.save(); g.translate(1200, 520);
  g.strokeStyle = INK; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 70, 0, Math.PI * 2); g.stroke();
  g.fillStyle = INK; g.beginPath(); g.moveTo(0, -64); g.lineTo(14, 0); g.lineTo(0, 64); g.lineTo(-14, 0); g.closePath(); g.fill();
  g.fillStyle = GILT; g.beginPath(); g.moveTo(-64, 0); g.lineTo(0, 10); g.lineTo(64, 0); g.lineTo(0, -10); g.closePath(); g.fill();
  g.fillStyle = INK; g.font = '700 30px Georgia, serif'; g.textAlign = 'center'; g.fillText('N', 0, -84);
  g.restore();
  // the scale bar: a tenth of a span (600 m in the world, 60 hand metres)
  const bar = 60 * k;
  g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(1060, 700); g.lineTo(1060 + bar, 700); g.stroke();
  g.font = '500 22px Inter, system-ui, sans-serif'; g.fillStyle = INK; g.textAlign = 'left'; g.fillText('0.1 span', 1060, 680);
  // the stamp, dated
  const d = `${String(date.getUTCDate()).padStart(2, '0')} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  g.save(); g.translate(1330, 880); g.rotate(-0.16);
  g.strokeStyle = SEAL; g.lineWidth = 8; g.beginPath(); g.arc(0, 0, 110, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 92, 0, Math.PI * 2); g.stroke();
  g.fillStyle = SEAL; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 26px Inter, system-ui, sans-serif'; g.fillText('LAID', 0, -34);
  g.font = '700 24px Georgia, serif'; g.fillText(d, 0, 6);
  g.font = '600 18px Inter, system-ui, sans-serif'; g.fillText('THE SHARED MAP', 0, 44);
  g.restore();
}

// spec 8.5: what this device and the map keep of you, as a file
export function exportData(hand, charted, pins) {
  return JSON.stringify({
    note: 'Palm Whorl Cities keeps only this: your Hand\'s map DNA, where it lies, its name, what you charted and pinned. No images, no tracking data.',
    hand: hand && { id: hand.id ?? null, name: hand.name, palm: toB64(hand.palm), prints: hand.prints.map(toB64), pose: hand.pose },
    charted, pins,
  }, null, 2);
}
