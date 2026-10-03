// All sound is generated: wind, a slow breathing pad, pentatonic tones, sand and bird song.
// Nothing to download.
let ctx, master, verb, wind, windBand, padTone, sand;
const SCALE = [0, 2, 4, 7, 9]; // major pentatonic: any order of notes sounds kind
let step = 4;

export function startAudio() {
  if (ctx) return ctx.resume();
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 4);
  master.connect(ctx.destination);

  verb = ctx.createConvolver();
  verb.buffer = noise(4.5, 2, true);
  const wet = ctx.createGain();
  wet.gain.value = 0.45;
  verb.connect(wet).connect(master);

  // wind: looped noise through a slowly wandering band-pass, loud only while flying
  const air = ctx.createBufferSource();
  air.buffer = noise(4, 1);
  air.loop = true;
  windBand = ctx.createBiquadFilter();
  windBand.type = 'bandpass';
  windBand.frequency.value = 520;
  windBand.Q.value = 0.6;
  wind = ctx.createGain();
  wind.gain.value = 0.02;
  air.connect(windBand).connect(wind).connect(master);
  air.start();
  wobble(windBand.frequency, 0.06, 260);

  // sand: the same noise, higher and brighter, swelling while a fingertip walks
  const grains = ctx.createBufferSource();
  grains.buffer = noise(3, 1);
  grains.loop = true;
  const grit = ctx.createBiquadFilter();
  grit.type = 'highpass';
  grit.frequency.value = 2400;
  sand = ctx.createGain();
  sand.gain.value = 0;
  grains.connect(grit).connect(sand).connect(master);
  grains.start();

  // pad: an open D chord, every voice breathing at its own rate
  padTone = ctx.createBiquadFilter();
  padTone.type = 'lowpass';
  padTone.frequency.value = 900;
  const pad = ctx.createGain();
  pad.gain.value = 0.045;
  padTone.connect(pad);
  pad.connect(master);
  pad.connect(verb);
  [73.42, 146.83, 220, 277.18, 329.63].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = i ? 'triangle' : 'sine';
    o.frequency.value = f;
    o.detune.value = (i - 2) * 3;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    wobble(g.gain, 0.04 + i * 0.011, 0.35);
    o.connect(g).connect(padTone);
    o.start();
  });
}

function wobble(param, rate, depth) {
  const o = ctx.createOscillator();
  o.frequency.value = rate;
  const g = ctx.createGain();
  g.gain.value = depth;
  o.connect(g).connect(param);
  o.start();
}

function noise(seconds, channels, decay = false) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(channels, len, ctx.sampleRate);
  for (let c = 0; c < channels; c++) {
    const d = buf.getChannelData(c);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = last * 0.96 + (Math.random() * 2 - 1) * 0.04; // soft brown-ish noise
      d[i] = decay ? (Math.random() * 2 - 1) * (1 - i / len) ** 3 : last * 6;
    }
  }
  return buf;
}

// 0 at the table (a faint room tone), 1 in full flight; the pad opens up as you fly
export function setWind(level) {
  if (!ctx) return;
  const t = ctx.currentTime;
  wind.gain.setTargetAtTime(0.02 + 0.2 * level, t, 0.8);
  padTone.frequency.setTargetAtTime(900 + level * 1600, t, 1.5);
}

// 0..1: how fast a fingertip is walking the sand
export function setSand(level) {
  if (ctx) sand.gain.setTargetAtTime(Math.min(1, level) * 0.05, ctx.currentTime, 0.08);
}

// One soft bell. step 0..11 walks the pentatonic scale over two octaves; pan -1..1.
export function tone(n, pan = 0, gain = 0.14) {
  if (!ctx) return;
  const note = 62 + 12 * Math.floor(n / 5) + SCALE[((n % 5) + 5) % 5];
  const f = 440 * 2 ** ((note - 69) / 12);
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
  const out = ctx.createStereoPanner();
  out.pan.value = Math.max(-1, Math.min(1, pan));
  [1, 2.01, 3.98].forEach((m, i) => {
    const o = ctx.createOscillator();
    o.frequency.value = f * m;
    const og = ctx.createGain();
    og.gain.value = [1, 0.28, 0.1][i];
    o.connect(og).connect(g);
    o.start(t);
    o.stop(t + 3.1);
  });
  g.connect(out);
  out.connect(master);
  out.connect(verb);
}

// A note that wanders up and down the scale, so a string of them plays a little melody.
export function chime(pan) {
  step = Math.max(0, Math.min(11, step + [-1, 1, 1, 2][Math.floor(Math.random() * 4)]));
  tone(step, pan);
}

// A bird's song: its own ridge curve (values 0..1) sung as quick whistled glides.
export function chirp(curve, pan = 0) {
  if (!ctx || !curve.length) return;
  const t0 = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const out = ctx.createStereoPanner();
  out.pan.value = Math.max(-1, Math.min(1, pan));
  o.type = 'sine';
  const dur = 0.09;
  curve.forEach((v, i) => o.frequency.setValueAtTime(1800 + v * 1900, t0 + i * dur));
  curve.forEach((v, i) => o.frequency.exponentialRampToValueAtTime(2100 + v * 2300, t0 + i * dur + dur * 0.8));
  g.gain.setValueAtTime(0, t0);
  curve.forEach((_, i) => {
    g.gain.linearRampToValueAtTime(0.05, t0 + i * dur + 0.01);
    g.gain.linearRampToValueAtTime(0.004, t0 + i * dur + dur * 0.9);
  });
  g.gain.linearRampToValueAtTime(0, t0 + curve.length * dur + 0.05);
  o.connect(g).connect(out);
  out.connect(master);
  out.connect(verb);
  o.start(t0);
  o.stop(t0 + curve.length * dur + 0.1);
}

// The land being born: sand rising for a few seconds under a low open chord.
export function swell(seconds = 8) {
  if (!ctx) return;
  const t = ctx.currentTime;
  sand.gain.cancelScheduledValues(t);
  sand.gain.setValueAtTime(0, t);
  sand.gain.linearRampToValueAtTime(0.07, t + seconds * 0.8);
  sand.gain.linearRampToValueAtTime(0, t + seconds + 1.5);
  [0, 4, 7].forEach((n, i) => setTimeout(() => tone(n, (i - 1) * 0.4, 0.08), (seconds * 1000 * i) / 3));
}

// Hidden session or tab: suspend everything, resume on return. Never starts audio by itself.
export const pauseAudio = (paused) => ctx && (paused ? ctx.suspend() : ctx.resume());
