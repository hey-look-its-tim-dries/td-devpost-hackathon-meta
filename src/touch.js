// src/touch.js
// The game on a phone: tilt it to steer (the gyroscope), or drag a thumb; buttons for what the keyboard does.
// The buttons press the same keys the keyboard would, so every rule of the game stays in one place.

// the phone's tilt as a stick. o: { beta, gamma } (deviceorientation), angle: the screen's rotation (0, 90, 180, 270),
// neutral: { roll, pitch } as it was held when play began. 22 degrees is full stick; 3 degrees of dead zone.
export function axes(o, angle) {
  const b = o.beta ?? 0, g = o.gamma ?? 0;
  return angle === 90 ? { roll: b, pitch: -g } : angle === 270 ? { roll: -b, pitch: g } : angle === 180 ? { roll: -g, pitch: -b } : { roll: g, pitch: b };
}
const stick = (deg) => { const a = Math.abs(deg); return a < 3 ? 0 : Math.sign(deg) * Math.min(1, (a - 3) / 19); };
export function tilt(o, angle, neutral) {
  const a = axes(o, angle);
  return { turn: stick(a.roll - neutral.roll), climb: stick(a.pitch - neutral.pitch) };
}

const BUTTONS = [ // [key, label, class, hold]
  [' ', 'SOW', 'sow', true], ['q', '◀', 'prev'], ['e', '▶', 'next'], ['f', 'HYPER', 'hyper'], ['t', 'POUR', 'pour'], ['z', 'SCATTER', 'scatter'], ['m', 'MAP', 'map'], ['v', '⟲', 'centre'], ['p', '❚❚', 'pause'], ['i', 'BAG', 'bag'],
];
export function createTouch(root, canvas) {
  const on = globalThis.matchMedia?.('(pointer: coarse)').matches;
  let last = null, neutral = null, drag = null, thumb = null;
  const angle = () => globalThis.screen?.orientation?.angle ?? globalThis.orientation ?? 0;
  const key = (type, k) => globalThis.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
  if (on) {
    document.body.classList.add('touch');
    for (const [k, label, cls, hold] of BUTTONS) {
      const b = Object.assign(document.createElement('button'), { textContent: label, className: `tb ${cls}`, type: 'button' });
      if (k === 'v') b.addEventListener('click', () => { neutral = null; }); // hold the phone as you like, then tap: that is level
      else {
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); key('keydown', k); if (!hold) setTimeout(() => key('keyup', k), 80); });
        if (hold) for (const up of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(up, () => key('keyup', k));
      }
      root.appendChild(b);
    }
    addEventListener('deviceorientation', (e) => { if (e.beta !== null) last = { beta: e.beta, gamma: e.gamma }; });
    globalThis.screen?.orientation?.addEventListener?.('change', () => { neutral = null; });
    // a thumb dragged on the view steers too (and wins over the tilt while it is down)
    canvas.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; drag = { id: t.identifier, x: t.clientX, y: t.clientY }; thumb = { turn: 0, climb: 0 }; }, { passive: true });
    canvas.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) if (drag && t.identifier === drag.id) thumb = { turn: Math.max(-1, Math.min(1, (t.clientX - drag.x) / 70)), climb: Math.max(-1, Math.min(1, (drag.y - t.clientY) / 70)) }; }, { passive: true });
    for (const end of ['touchend', 'touchcancel']) canvas.addEventListener(end, () => { drag = thumb = null; }, { passive: true });
  }
  return {
    on,
    show(v) { root.classList.toggle('hidden', !on || !v); },
    // from the tap that starts play: iOS only hands out the gyroscope when asked from a tap
    arm() { neutral = null; try { globalThis.DeviceOrientationEvent?.requestPermission?.().catch(() => {}); } catch {} },
    steer() {
      if (!on) return null;
      if (thumb) return thumb;
      if (!last) return null;
      neutral ??= axes(last, angle());
      return tilt(last, angle(), neutral);
    },
  };
}
