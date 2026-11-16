// src/inventory.js
// The inventory down the right side of a screen: everything you carry and everything you have found, every icon the
// same size. Seeds first (how many you carry, how many you sowed; a click chooses that seed), then the flowers and
// trees you know but carry none of, then the animals you met. Rebuilt only when something changed.
const KINDS = { flora: ['flower', 'tree', 'mushroom'] };
export function inventoryRows({ species, seeds, planted, found, selected }) {
  const flora = (s) => KINDS.flora.includes(s.kind), rows = { seeds: [], flora: [], fauna: [] };
  for (const id of [...found].sort((a, b) => a - b)) {
    const s = species[id];
    if (!s) continue;
    const n = seeds[id] ?? 0, sown = planted[id] ?? 0;
    if (n > 0) rows.seeds.push({ id, name: s.name, n, sown, status: id === selected ? 'chosen' : 'carried' });
    else if (flora(s)) rows.flora.push({ id, name: s.name, n: 0, sown, status: sown ? 'sown' : 'found' });
    else rows.fauna.push({ id, name: s.name, n: 0, sown: 0, status: 'met', color: s.color });
  }
  const all = Object.values(species);
  return { ...rows, floraOf: all.filter(flora).length, faunaOf: all.filter((s) => !flora(s)).length, carried: rows.seeds.reduce((a, r) => a + r.n, 0) };
}
export function createInventory(el, { onPick } = {}) {
  let key = '';
  const cell = (r, icon, pixel) => {
    const d = document.createElement('button'), c = Object.assign(document.createElement('canvas'), { width: 80, height: 80 }), g = c.getContext('2d');
    d.type = 'button'; d.className = `inv ${r.status}`; d.title = `${r.name} · ${r.status}${r.n ? ` · ${r.n} seeds` : ''}${r.sown ? ` · sown ${r.sown}` : ''}`;
    const ic = icon?.(r.id);
    if (ic) { g.imageSmoothingEnabled = !pixel?.(r.id); g.drawImage(ic.canvas, ic.x, ic.y, ic.s, ic.s, 4, 4, 72, 72); }
    else { g.fillStyle = r.color ?? '#c9a27a'; g.beginPath(); g.arc(40, 40, 30, 0, Math.PI * 2); g.fill(); g.fillStyle = '#16100e'; g.font = '700 34px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(r.name.slice(0, 1), 40, 43); }
    d.append(c, Object.assign(document.createElement('b'), { textContent: r.n ? `×${r.n}` : r.status }), Object.assign(document.createElement('i'), { textContent: r.sown ? `sown ${r.sown}` : '' }));
    if (r.n) d.addEventListener('click', () => onPick?.(r.id));
    return d;
  };
  return {
    show(v) { el.classList.toggle('hidden', !v); },
    update(state, icon, pixel) {
      const rows = inventoryRows(state), k = JSON.stringify([rows.seeds.map((r) => [r.id, r.n, r.sown, r.status]), rows.flora.length, rows.fauna.length, rows.flora.reduce((a, r) => a + r.sown, 0), !!icon?.(state.selected)]);
      if (k === key) return;
      key = k;
      el.replaceChildren();
      const part = (title, list) => { el.append(Object.assign(document.createElement('h4'), { textContent: title })); const grid = Object.assign(document.createElement('div'), { className: 'inv-grid' }); for (const r of list) grid.append(cell(r, icon, pixel)); el.append(grid); };
      part(`Seeds · ${rows.carried}`, rows.seeds);
      part(`Flora · ${rows.seeds.filter((r) => KINDS.flora.includes(state.species[r.id].kind)).length + rows.flora.length}/${rows.floraOf}`, rows.flora);
      part(`Fauna · ${rows.fauna.length}/${rows.faunaOf}`, rows.fauna);
    },
  };
}
