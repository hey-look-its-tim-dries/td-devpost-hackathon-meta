// src/ui/neon.js
// The look of every panel in the game: Bioluminescent Synthwave. A panel is a terminal window: a
// translucent violet pane with chamfered corners, a glowing laser frame, bracketed corners and faint
// scanlines, so the glowing world shows through behind it. Canvas 2D, shared by the HUD and the cards.
export const NEON = { void: '#05010d', panel: 'rgba(11, 0, 26, 0.72)', cyan: '#00ffff', pink: '#ff2bd6', magenta: '#ff00ff', green: '#39ff14', orange: '#ff4500', white: '#f4fbff', ice: '#bfe9ff' };
export const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

export function neonPanel(g, x, y, w, h, { color = NEON.cyan, accent = NEON.pink, cut = 18, scan = true, fill = NEON.panel } = {}) {
  const c = Math.min(cut, w / 4, h / 4);
  const path = () => { g.beginPath(); g.moveTo(x + c, y); g.lineTo(x + w - c, y); g.lineTo(x + w, y + c); g.lineTo(x + w, y + h - c); g.lineTo(x + w - c, y + h); g.lineTo(x + c, y + h); g.lineTo(x, y + h - c); g.lineTo(x, y + c); g.closePath(); };
  g.save();
  path(); g.fillStyle = fill; g.fill();
  if (scan) { g.save(); path(); g.clip(); g.fillStyle = 'rgba(191, 233, 255, 0.045)'; for (let yy = y + 2; yy < y + h; yy += 4) g.fillRect(x, yy, w, 1); g.restore(); } // a CRT's lines, barely there
  g.shadowColor = color; g.shadowBlur = 14; g.strokeStyle = color; g.lineWidth = 2.5; path(); g.stroke(); // the laser frame
  g.shadowColor = accent; g.shadowBlur = 8; g.strokeStyle = accent; g.lineWidth = 3;
  for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) { g.beginPath(); g.moveTo(cx + sx * (c + 18), cy); g.lineTo(cx + sx * c, cy); g.lineTo(cx, cy + sy * c); g.lineTo(cx, cy + sy * (c + 18)); g.stroke(); } // bracketed corners
  g.restore();
}
