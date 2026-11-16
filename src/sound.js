// src/sound.js
// The game's sounds, all made in the browser (no files): a breeze that swells with your speed, and a small
// sound of its own for everything you do. Notes come from one pentatonic scale, so whatever happens together
// sounds in tune, and a soft echo carries each one off. `recipe()` and `breeze()` are pure (what to play);
// createSound() plays them with Web Audio once the player has pressed something (arm()).
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28]; // A major pentatonic, in semitones over A3
const hz = (step, octave = 0) => 220 * 2 ** ((SCALE[((step % SCALE.length) + SCALE.length) % SCALE.length] + 12 * octave) / 12);
// a note: { f (Hz), to (Hz it glides to, optional), at (s after the start), d (s it rings), type, g (loudness 0..1) }
const n = (f, at, d, g = 0.5, type = 'sine', to = null) => ({ f, to, at, d, type, g });
const run = (steps, gap, d, g, type = 'sine', octave = 0) => steps.map((s, i) => n(hz(s, octave), i * gap, d, g, type));
// every sound by name. k: a count that walks the scale (the third grove in a row sounds higher than the first)
export const SOUNDS = {
  sow: (k) => [n(hz(k % 8), 0, 0.35, 0.5, 'triangle'), n(hz(k % 8, 1), 0.02, 0.2, 0.18)], // a soft pluck, climbing as you sow on
  sprig: (k) => [n(hz(k * 3, 1), 0, 0.12, 0.22, 'triangle')], // the hyper sow's patter
  scatter: () => run([0, 2, 4, 5, 7], 0.05, 0.3, 0.4, 'triangle'), // five seeds, five notes
  next: () => [n(hz(4, 1), 0, 0.07, 0.3, 'square'), n(hz(6, 1), 0.05, 0.09, 0.25, 'square')], // a seed picked: tick-tock
  gather: (k) => run([0, 2, 4, 7, 9].map((s) => s + (k % 3)), 0.06, 0.5, 0.35, 'sine', 1), // a seed cloud caught: a sparkle upward
  found: () => [n(hz(7, 1), 0, 0.6, 0.35), n(hz(9, 1), 0.12, 0.8, 0.3)], // a new kind for the herbarium: two small bells
  water: () => [n(300, 0, 0.25, 0.45, 'sine', 620), n(420, 0.14, 0.3, 0.35, 'sine', 880)], // water gathered: two rising bloops
  tend: (k) => [n(900 + 80 * (k % 4), 0, 0.12, 0.3, 'sine', 420), n(1300, 0.09, 0.1, 0.2, 'sine', 700)], // a grove watered: drops
  pour: () => [0, 1, 2, 3, 4].map((i) => n(1100 - i * 90, i * 0.07, 0.12, 0.28, 'sine', 500 - i * 30)), // a palm of water: a run of drops
  bloom: () => [n(hz(0), 0, 1.2, 0.3), n(hz(2), 0.05, 1.2, 0.26), n(hz(4), 0.1, 1.2, 0.26), n(hz(7), 0.15, 1.4, 0.22)], // a plot comes into bloom: a chord opening
  clear: () => [n(140, 0, 0.3, 0.6, 'sine', 60), n(90, 0.03, 0.25, 0.3, 'triangle', 50)], // a grove pulled out: a soft thud
  hyper: () => [n(220, 0, 0.7, 0.3, 'sawtooth', 880), ...run([0, 4, 7, 9, 12], 0.07, 0.6, 0.3, 'triangle', 1).map((q) => ({ ...q, at: q.at + 0.35 }))], // the hyper sow: a sweep up, then a fanfare
  mushroom: () => [n(110, 0, 1.6, 0.4, 'sawtooth', 55), n(111.5, 0, 1.6, 0.4, 'sawtooth', 56), n(880, 0, 1.2, 0.2, 'sine', 220), n(hz(0, 1), 0.5, 1.4, 0.25, 'square')], // the foxfire comes: a deep detuned swell
  grab: () => [n(260, 0, 0.22, 0.45, 'sine', 780), n(hz(9, 1), 0.2, 0.25, 0.3, 'triangle')], // a gnome jumps on: boing
  drop: () => [n(600, 0, 0.18, 0.4, 'sine', 180)], // a gnome set down: plop
  cross: () => [n(330, 0, 0.14, 0.35, 'square', 300), n(277, 0.14, 0.14, 0.35, 'square', 250), n(233, 0.28, 0.3, 0.35, 'square', 190)], // a gnome annoyed: a grumble down the stairs
  quest: () => run([0, 2, 4, 7, 9, 12], 0.09, 0.45, 0.4, 'triangle', 1), // a gnome's quest done: up the whole scale
  team: () => [n(hz(0, 1), 0, 0.9, 0.35, 'triangle'), n(hz(2, 1), 0.02, 0.9, 0.3, 'triangle'), n(hz(4, 1), 0.04, 0.9, 0.3, 'triangle'), n(hz(7, 1), 0.3, 1.1, 0.35, 'triangle')], // it joins your team: a bright chord
  greet: () => [n(hz(4), 0, 0.9, 0.3), n(hz(7), 0.18, 0.9, 0.3), n(hz(9), 0.36, 1.2, 0.3)], // two whorls braid: three rising notes
  chart: () => [n(hz(5, 1), 0, 0.25, 0.22)], // a handbit charted: one clear note
  stamp: () => [n(110, 0, 1.4, 0.55), n(220, 0, 1.0, 0.25), n(331, 0, 0.7, 0.12)], // a stamp for the big moments: a deep bell
  level: () => run([0, 1, 2, 3, 4, 5, 7], 0.07, 0.4, 0.35, 'triangle', 1), // a level gained: a run up
  golden: () => run([7, 9, 11, 12, 11, 12], 0.06, 0.7, 0.3, 'sine', 2), // the golden seed: glitter, high up
  step: () => [n(hz(7, 1), 0, 0.25, 0.35, 'triangle'), n(hz(9, 1), 0.12, 0.45, 0.35, 'triangle')], // a tutorial step done: ding-ding
  atlas: () => [n(500, 0, 0.18, 0.18, 'triangle', 900)], // the atlas opens or closes: a page turned
  storm: () => [n(70, 0, 2.2, 0.4, 'sawtooth', 50), n(74, 0, 2.2, 0.3, 'sawtooth', 52)], // a sandstorm is coming: a low rumble
};
// the notes of a sound (an empty list for a name nobody knows)
export const recipe = (name, k = 0) => SOUNDS[name]?.(k) ?? [];
// the breeze at this speed (m/s): how loud (0..1) and how bright (the filter's Hz). Soft at a sower's pace, a rush flat out
export function breeze(speed) {
  const k = Math.max(0, Math.min(1, (speed - 60) / 1040));
  return { gain: 0.035 + 0.3 * k ** 0.8, hz: 280 + 2600 * k };
}

export function createSound({ storage = null } = {}) {
  let ctx = null, out = null, windGain = null, windFilter = null, muted = false, level = 0;
  try { muted = storage?.getItem('pwc.mute.v1') === '1'; } catch {}
  const counts = {}, last = {};
  function build() {
    const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    out = ctx.createGain(); out.gain.value = muted ? 0 : 0.5; out.connect(ctx.destination);
    const echo = ctx.createDelay(1), back = ctx.createGain(), wet = ctx.createGain(); // a soft echo: every sound is carried off
    echo.delayTime.value = 0.27; back.gain.value = 0.32; wet.gain.value = 0.28;
    out.connect(echo); echo.connect(back); back.connect(echo); echo.connect(wet); wet.connect(ctx.destination);
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0); // the breeze: two seconds of noise, round and round
    let b = 0;
    for (let i = 0; i < d.length; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 6; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    windFilter = ctx.createBiquadFilter(); windFilter.type = 'lowpass'; windFilter.frequency.value = 300; windFilter.Q.value = 0.6;
    windGain = ctx.createGain(); windGain.gain.value = 0;
    src.connect(windFilter); windFilter.connect(windGain); windGain.connect(ctx.destination);
    src.start();
  }
  return {
    arm() { if (!ctx) build(); ctx?.resume?.(); }, // from a press: the start button
    get muted() { return muted; },
    set(m) { muted = m; if (out) out.gain.value = m ? 0 : 0.5; },
    // every frame: the breeze follows your speed; quiet = true while the world waits (the atlas, your hand card)
    wind(speed, dt, quiet = false) {
      if (!ctx || !windGain) return;
      const w = breeze(speed), want = muted ? 0 : quiet ? 0.02 : w.gain;
      level += (want - level) * Math.min(1, dt * 2.5);
      windGain.gain.value = level;
      windFilter.frequency.value += (w.hz - windFilter.frequency.value) * Math.min(1, dt * 2.5);
    },
    // a sound by name; `gap` seconds at least between two of the same (a held key must not machine-gun)
    play(name, gap = 0.05) {
      if (!ctx || muted) return;
      const now = ctx.currentTime;
      if (now - (last[name] ?? -9) < gap) return;
      last[name] = now;
      const k = (counts[name] = (counts[name] ?? 0) + 1);
      for (const q of recipe(name, k)) {
        const o = ctx.createOscillator(), g = ctx.createGain(), t = now + q.at;
        o.type = q.type; o.frequency.setValueAtTime(q.f, t);
        if (q.to) o.frequency.exponentialRampToValueAtTime(q.to, t + q.d);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(q.g * 0.5, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + q.d);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + q.d + 0.05);
      }
    },
  };
}
