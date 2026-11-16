// src/voiceplay.js
// Plays Grandfather Tuft's clips (assets/voice/<id>.mp3, made by tools/voice.mjs): one or a few in a row, never two
// at once. Says how long a set of clips takes (lines.json) so the game knows when he is done. Silent when muted,
// when the clips cannot be loaded, or before the player has pressed something (arm()).
export function createVoicePlayer({ base = new URL('../', import.meta.url).href } = {}) {
  let seconds = {}, armed = false, muted = false, el = null, queue = [];
  fetch(`${base}assets/voice/lines.json`).then((r) => (r.ok ? r.json() : {})).then((j) => { seconds = j ?? {}; }).catch(() => {});
  const next = () => { const id = queue.shift(); if (!id || !el) return; el.src = `${base}assets/voice/${id}.mp3`; el.play().catch(() => {}); };
  return {
    arm() { if (armed) return; armed = true; el = new Audio(); el.volume = 0.95; el.addEventListener('ended', next); el.addEventListener('error', next); },
    set(m) { muted = m; if (m && el) { el.pause(); queue = []; } },
    // how long these clips take together, in seconds (a guess of 3 s each before the list has loaded)
    length(ids) { return [].concat(ids).reduce((a, id) => a + (seconds[id] ?? 3), 0); },
    say(ids) { if (!armed || muted || !el) return; el.pause(); queue = [].concat(ids); next(); },
    get talking() { return !!el && !el.paused && !el.ended; },
  };
}
