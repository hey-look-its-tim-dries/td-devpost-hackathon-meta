// src/pickup.js
// Seeds you pick up fly to your inventory: a few small seed icons arc from your whorl to that kind's cell on the
// right, the cell gives a little pulse, and a quiet "+n Name" tally counts up beside the rail while you keep
// gathering. Screen only (the headset has no inventory rail).
export function createPickup(rail, { icon, name }) {
  const tally = document.createElement('div');
  tally.id = 'pickupTally';
  document.body.append(tally);
  let sum = 0, sp = -1, fade = 0;
  const seedEl = (id) => {
    const c = Object.assign(document.createElement('canvas'), { width: 32, height: 32, className: 'pickup-seed' }), g = c.getContext('2d'), ic = icon(id);
    if (ic) g.drawImage(ic.canvas, ic.x, ic.y, ic.s, ic.s, 0, 0, 32, 32); else { g.fillStyle = '#e8c27a'; g.beginPath(); g.arc(16, 16, 9, 0, 7); g.fill(); }
    return c;
  };
  return {
    // n seeds of kind id, from the screen point (x, y)
    fly(id, n, x, y) {
      if (rail.classList.contains('hidden')) return;
      const cell = rail.querySelector(`[data-sp="${id}"]`) ?? rail.querySelector('h4'), r = cell?.getBoundingClientRect();
      if (!r) return;
      const tx = r.left + r.width / 2, ty = r.top + r.height / 2;
      for (let i = 0; i < Math.min(n, 5); i++) {
        const e = seedEl(id), dx = (Math.random() - 0.5) * 60, mid = -40 - Math.random() * 60, dur = 650 + i * 90;
        document.body.append(e);
        e.animate([
          { transform: `translate(${x + dx}px, ${y}px) scale(0.6)`, opacity: 0 },
          { transform: `translate(${(x + tx) / 2 + dx}px, ${Math.min(y, ty) + mid}px) scale(1)`, opacity: 0.95, offset: 0.35 },
          { transform: `translate(${tx - 16}px, ${ty - 16}px) scale(0.5)`, opacity: 0.2 },
        ], { duration: dur, delay: i * 70, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'both' }).onfinish = () => {
          e.remove();
          if (i === 0) cell.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 260 });
        };
      }
      // the tally: one kind at a time, counting up while you keep gathering it
      if (id !== sp || performance.now() > fade) sum = 0;
      sp = id; sum += n; fade = performance.now() + 1800;
      tally.textContent = `+${sum} ${name(id)}`;
      tally.style.top = `${Math.max(8, ty - 12)}px`;
      tally.classList.remove('on'); void tally.offsetWidth; tally.classList.add('on');
    },
  };
}
