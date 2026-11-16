// src/atlas/layout.js
// Where things sit on the atlas card (1200 x 900 canvas pixels) and what a tap there means. Pure.
export const W = 1200, H = 900;
export const TABS = ['world', 'hand', 'garden', 'community', 'journal', 'how'];
export const TAB_LABELS = { world: 'World', hand: 'My Hand', garden: 'Garden', community: 'Community', journal: 'Journal', how: 'How' };
export const TAB = { x: 24, step: 178, w: 168 }; // six tabs in a row, left of the close button
export const MAP = { x: 24, y: 104, w: 1152, h: 772 }; // the map area on the World tab
export const LAYERS = ['rivers', 'owners', 'classes', 'players', 'charted', 'watersheds', 'bloom'];

// the fixed regions of a tab (tabs, close, layer chips); content regions are added by the card as it paints
export function layout(tab) {
  const r = TABS.map((t, i) => ({ id: `tab:${t}`, x: TAB.x + i * TAB.step, y: 22, w: TAB.w, h: 64 }));
  r.push({ id: 'close', x: 1100, y: 22, w: 76, h: 64 });
  if (tab === 'world') {
    LAYERS.forEach((l, i) => r.push({ id: `layer:${l}`, x: 36 + i * 150, y: MAP.y + 12, w: 138, h: 44 }));
    r.push({ id: 'map', ...MAP });
    r.push({ id: 'zoom:in', x: MAP.x + MAP.w - 90, y: MAP.y + 90, w: 72, h: 72 }, { id: 'zoom:out', x: MAP.x + MAP.w - 90, y: MAP.y + 172, w: 72, h: 72 }); // zoom by touch (review finding 4)
  }
  return r;
}

// the action at canvas point [x, y]: the topmost region wins (later ones are drawn over earlier ones)
export function hitAt(regions, [x, y]) {
  for (let i = regions.length - 1; i >= 0; i--) {
    const q = regions[i];
    if (x < q.x || x > q.x + q.w || y < q.y || y > q.y + q.h) continue;
    const [type, arg, more] = q.id.split(':');
    if (type === 'tab') return { type, tab: arg };
    if (type === 'layer') return { type, layer: arg };
    if (type === 'map') return { type, x: x - q.x, y: y - q.y };
    if (type === 'zoom') return { type, dir: arg };
    if (type === 'hand') return { type, id: arg };
    if (type === 'handbit') return { type, index: +arg };
    if (type === 'seed' || type === 'kind' || type === 'page') return { type, arg }; // the herbarium
    if (type === 'pin' || type === 'fly' || type === 'donate' || type === 'name' || type === 'unpin') return { type, arg, more };
    return { type };
  }
  return null;
}
