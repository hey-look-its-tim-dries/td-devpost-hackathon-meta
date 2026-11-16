// src/music.js
// The foxfire's music. The calm world is silent; when the foxfire comes (src/garden/foxfire.js) one of the
// openly licensed synthwave tracks in assets/music (listed in tracks.json, credited in CREDITS.md) fades in
// with it and out again, and the next foxfire plays the next track. Browsers only let sound start after the
// player has pressed something, so the game arms it from its start button. If the tracks cannot be loaded,
// or the player muted it, the game is simply silent.
export function createMusic({ base = new URL('../', import.meta.url).href, onPlay = null, storage = null } = {}) {
  let tracks = null, el = null, armed = false, index = 0, announced = -1, muted = false;
  try { muted = storage?.getItem('pwc.mute.v1') === '1'; } catch {}
  fetch(`${base}assets/music/tracks.json`).then((r) => (r.ok ? r.json() : [])).then((l) => { tracks = Array.isArray(l) ? l.filter((t) => typeof t?.file === 'string') : []; }).catch(() => { tracks = []; });
  const track = () => tracks[index % tracks.length];
  const load = () => { el.src = base + track().file; };
  const start = () => { el.play().then(() => { if (announced !== index) { announced = index; onPlay?.(track()); } }).catch(() => {}); };
  return {
    arm() { armed = true; }, // from a press: the start button
    get muted() { return muted; },
    toggle() { muted = !muted; try { storage?.setItem('pwc.mute.v1', muted ? '1' : '0'); } catch {} if (muted && el) el.pause(); return muted; },
    // every frame; level: the foxfire's strength, 0..1
    update(level, dt) {
      if (!armed || muted || !tracks?.length) return;
      if (!el) {
        if (level <= 0.02) return;
        el = new Audio(); el.preload = 'auto'; el.volume = 0;
        el.addEventListener('ended', () => { index++; load(); start(); }); // a long chain of mushrooms outlasts a song
        load();
      }
      if (level > 0.02 && el.paused) start();
      el.volume = Math.max(0, Math.min(1, el.volume + (Math.min(1, level) * 0.8 - el.volume) * Math.min(1, dt * 3)));
      if (level <= 0.02 && !el.paused && el.volume < 0.03) { el.pause(); index++; load(); } // the next foxfire, the next song
    },
  };
}
