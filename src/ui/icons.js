// src/ui/icons.js
// The game's icons: ink line drawings on a 24 x 24 grid, one stroke weight, round ends, like the whorl itself.
// The same paths serve the pages (icon(): inline SVG that takes the text's colour) and the canvases of the HUD and
// the atlas (drawIcon()). Pure but for drawIcon, which needs a browser's Path2D.
export const ICONS = {
  fly: 'M12 12c0-2 3-2 3 1s-4 4-6 1-1-8 4-8 8 4 7 9-6 8-11 6', // the whorl
  turn: 'M4 12a8 8 0 0 1 14-5l2-2v6h-6l2-2a5 5 0 0 0-9 3',
  climb: 'M12 20V5M6 11l6-6 6 6',
  sow: 'M12 21v-9M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 14c0-3 2.5-5 6-5 0 3-2.5 5-6 5z', // a sprout
  seed: 'M5 14a4 4 0 0 1 2-7 5 5 0 0 1 9-1 4 4 0 0 1 3 7M8 18h.01M12 20h.01M16 18h.01', // a seed cloud
  scatter: 'M4 18c4-8 8-10 16-12M9 20h.01M13 17h.01M17 14h.01M20 10h.01M15 21h.01',
  water: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  pour: 'M5 6h9l4 4-3 1-2-2H7zM7 9v9h6v-7M17 14v.01M17 18v.01',
  hyper: 'M13 2 5 14h6l-1 8 8-12h-6z',
  clear: 'M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13',
  bloom: 'M9.5 12a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8',
  mushroom: 'M4 12a8 8 0 0 1 16 0zM10 12v6a2 2 0 0 0 4 0v-6',
  gnome: 'M12 2l5 10H7zM7 12c0 6 2 10 5 10s5-4 5-10M10 15h.01M14 15h.01',
  player: 'M5 9a3 3 0 1 0 6 0 3 3 0 1 0-6 0M13 9a3 3 0 1 0 6 0 3 3 0 1 0-6 0M3 20c0-3 2-5 5-5s5 2 5 5M13 16c1-1 2-1 3-1 3 0 5 2 5 5',
  hand: 'M8 13V6a1.5 1.5 0 0 1 3 0v5V4a1.5 1.5 0 0 1 3 0v7V6a1.5 1.5 0 0 1 3 0v8l1.5-2a1.5 1.5 0 0 1 2.5 1.7L18 19c-1 2-3 3-5 3h-1c-3 0-5-2-5-5z',
  river: 'M3 8c3-3 6 3 9 0s6-3 9 0M3 14c3-3 6 3 9 0s6-3 9 0',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15 9l-2 5-4 1 2-5z',
  atlas: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
  storm: 'M3 8h11a3 3 0 1 0-3-3M3 13h15a3 3 0 1 1-3 3M3 18h7',
  gold: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.3l6.1-.7z',
  sound: 'M4 10v4h4l5 4V6l-5 4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  news: 'M6 4h12v16H6zM9 8h6M9 12h6M9 16h4',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8',
  away: 'M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z',
  explain: 'M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1zM12 6v14',
  dive: 'M5 12h14M13 6l6 6-6 6',
  back: 'M19 12H5M11 6l-6 6 6 6',
  headset: 'M3 10a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v4a3 3 0 0 1-3 3h-2l-2-3h-4l-2 3H6a3 3 0 0 1-3-3z',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM9 13a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
  sign: 'M9 11a4 4 0 1 0 6 0 4 4 0 1 0-6 0M4 21c0-4 3.5-6 8-6s8 2 8 6',
  me: 'M9 8a3 3 0 1 0 6 0 3 3 0 1 0-6 0M5 20c0-4 3-6 7-6s7 2 7 6',
  world: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
};
// inline SVG for a page: as tall as the text beside it, in the text's colour
export const icon = (name, size = '1.15em') => (ICONS[name] ? `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name]}"/></svg>` : '');
// on a canvas: the icon in a square of `size` whose top left is (x, y)
export function drawIcon(g, name, x, y, size, colour) {
  if (!ICONS[name] || typeof Path2D === 'undefined') return;
  g.save(); g.translate(x, y); g.scale(size / 24, size / 24);
  g.strokeStyle = colour; g.lineWidth = 2; g.lineCap = 'round'; g.lineJoin = 'round';
  g.stroke(new Path2D(ICONS[name]));
  g.restore();
}
