// src/garden/herbarium.js
// The herbarium, a tab of the palm atlas: every species of the index by kind, the ones you found in
// colour with their name, the rest as blanks to look for. Tap a flower or tree you carry seeds of to
// make it the seed you sow. Canvas 2D on the atlas card (1200 x 900); the card owns `regions`.
export const KINDS = ['flower', 'tree', 'bird', 'insect', 'fish', 'animal'];
const LABEL = { flower: 'Flowers', tree: 'Trees', bird: 'Birds', insect: 'Insects', fish: 'Fish', animal: 'Animals' };
export const PER_PAGE = 60, COLS = 10;
const INK = '#16100e', SEAL = '#b8442e', GILT = '#c9a35a';

// st: { species, found: Set, has(id), icon(id), style(id), selected, kind, page }
export function paintHerbarium(g, regions, { button, text }, st) {
  const of = (k) => st.species.filter((s) => s.kind === k);
  KINDS.forEach((k, i) => { const all = of(k); button(`kind:${k}`, 30 + i * 192, 104, 182, 56, `${LABEL[k]} ${all.filter((s) => st.found.has(s.id)).length}/${all.length}`, { primary: k === st.kind }); });
  const list = of(st.kind), pages = Math.max(1, Math.ceil(list.length / PER_PAGE)), page = Math.min(st.page, pages - 1);
  list.slice(page * PER_PAGE, (page + 1) * PER_PAGE).forEach((s, i) => {
    const x = 34 + (i % COLS) * 114, y = 178 + Math.floor(i / COLS) * 106, found = st.found.has(s.id), n = st.has(s.id);
    g.fillStyle = found ? 'rgba(255,255,255,0.55)' : 'rgba(22,16,14,0.07)'; g.strokeStyle = s.id === st.selected ? SEAL : 'rgba(22,16,14,0.25)'; g.lineWidth = s.id === st.selected ? 5 : 1.5;
    g.beginPath(); g.roundRect(x, y, 106, 98, 14); g.fill(); g.stroke();
    if (!found) { text('?', x + 53, y + 58, { font: '700 40px Georgia, serif', color: 'rgba(22,16,14,0.25)', align: 'center' }); for (let r = 0; r < s.rarity; r++) { g.fillStyle = 'rgba(22,16,14,0.25)'; g.beginPath(); g.arc(x + 53 + (r - (s.rarity - 1) / 2) * 12, y + 82, 3.5, 0, Math.PI * 2); g.fill(); } return; }
    const ic = st.icon(s.id);
    if (ic) { g.imageSmoothingEnabled = st.style(s.id) !== 'pixel'; g.drawImage(ic.canvas, ic.x, ic.y, ic.s, ic.s, x + 23, y + 4, 60, 60); g.imageSmoothingEnabled = true; }
    else { g.fillStyle = s.color; g.beginPath(); g.arc(x + 53, y + 34, 24, 0, Math.PI * 2); g.fill(); g.fillStyle = s.color2; g.beginPath(); g.arc(x + 62, y + 28, 10, 0, Math.PI * 2); g.fill(); } // wildlife: its two colours
    text(s.name, x + 53, y + 80, { font: '600 14px Inter, system-ui, sans-serif', align: 'center', max: 100 });
    for (let r = 0; r < s.rarity; r++) { g.fillStyle = s.rarity === 4 ? GILT : INK; g.beginPath(); g.arc(x + 53 + (r - (s.rarity - 1) / 2) * 10, y + 90, 2.5, 0, Math.PI * 2); g.fill(); }
    if (n > 0) { g.fillStyle = SEAL; g.beginPath(); g.roundRect(x + 70, y + 4, 32, 22, 11); g.fill(); text(String(n), x + 86, y + 21, { font: '700 15px Inter, system-ui, sans-serif', color: '#f7eedf', align: 'center' }); regions.push({ id: `seed:${s.id}`, x, y, w: 106, h: 98 }); }
  });
  const sel = st.species[st.selected];
  text(sel && st.has(sel.id) ? `Sowing: ${sel.name} (${sel.latin}) · ${st.has(sel.id)} seeds · grows best on a ${sel.habitat}` : 'Fly through a seed cloud to fill your pouch', 40, 858, { font: 'italic 400 24px Georgia, serif', max: 820 });
  if (pages > 1) { button('page:prev', 900, 824, 120, 52, '‹ back', { on: page > 0 }); button('page:next', 1040, 824, 120, 52, 'more ›', { on: page < pages - 1 }); }
  return { page, pages };
}
