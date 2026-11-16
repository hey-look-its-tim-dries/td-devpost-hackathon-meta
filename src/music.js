// src/music.js
// The music: openly licensed synthwave (assets/music, listed in tracks.json, credited in CREDITS.md), one track
// after another, from a different one each visit. Soft while you fly and garden; when the foxfire comes
// (src/garden/foxfire.js) it swells to full, and when it has passed the next track begins. Browsers only let sound start after the
// player has pressed something, so the game arms it from its start button. If the tracks cannot be loaded,
// or the player muted it, the game is simply silent.
export function createMusic({ base = new URL('../', import.meta.url).href, onPlay = null, storage = null } = {}) {
  let tracks = null, el = null, armed = false, index = Math.floor(Math.random() * 1000), announced = -1, muted = false, high = false;
  try { muted = storage?.getItem('pwc.mute.v1') === '1'; } catch {}
  fetch(`${base}assets/music/tracks.json`).then((r) => (r.ok ? r.json() : [])).then((l) => { tracks = Array.isArray(l) ? l.filter((t) => typeof t?.file === 'string') : []; }).catch(() => { tracks = []; });
  const track = () => tracks[index % tracks.length];
  const load = () => { el.src = base + track().file; const at = +track().startAt || 0; if (at > 0) el.addEventListener('loadedmetadata', () => { try { el.currentTime = at; } catch {} }, { once: true }); }; // start where the full arrangement is in
  const start = () => { el.play().then(() => { if (announced !== index) { announced = index; onPlay?.(track()); } }).catch(() => {}); };
  return {
    arm() { armed = true; }, // from a press: the start button
    get muted() { return muted; },
    toggle() { muted = !muted; try { storage?.setItem('pwc.mute.v1', muted ? '1' : '0'); } catch {} if (muted && el) el.pause(); return muted; },
    get now() { return el && !el.paused && tracks?.length ? track() : null; }, // what is playing
    // every frame; level: the foxfire's strength, 0..1
    update(level, dt) {
      if (!armed || muted || !tracks?.length) return;
      if (!el) {
        el = new Audio(); el.preload = 'auto'; el.volume = 0;
        el.addEventListener('ended', () => { index++; load(); start(); }); // one track after another
        load();
      }
      if (el.paused) start();
      el.volume = Math.max(0, Math.min(1, el.volume + (0.16 + 0.62 * Math.min(1, level) - el.volume) * Math.min(1, dt * 1.5))); // soft in the calm world, full in the foxfire
      if (level > 0.5) high = true;
      else if (high && level <= 0.02) { high = false; index++; load(); start(); } // the foxfire has passed: the next track
    },
  };
}
