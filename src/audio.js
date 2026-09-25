// All sound is generated: wind, a slow breathing pad and pentatonic chimes. Nothing to download.
let ctx, master, verb, wind, windBand, padTone;
const SCALE = [0, 2, 4, 7, 9]; // major pentatonic: any order of notes sounds kind
let step = 4;

export function startAudio() {
  if (ctx) return ctx.resume();
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 5);
  master.connect(ctx.destination);

  verb = ctx.createConvolver();
  verb.buffer = noise(4.5, 2, true);
  const wet = ctx.createGain();
  wet.gain.value = 0.45;
  verb.connect(wet).connect(master);

  // wind: looped noise through a slowly wandering band-pass
  const air = ctx.createBufferSource();
  air.buffer = noise(4, 1);
  air.loop = true;
  windBand = ctx.createBiquadFilter();
  windBand.type = 'bandpass';
  windBand.frequency.value = 520;
  windBand.Q.value = 0.6;
  wind = ctx.createGain();
  wind.gain.value = 0.22;
  air.connect(windBand).connect(wind).connect(master);
  air.start();
  wobble(windBand.frequency, 0.06, 260);
  wobble(wind.gain, 0.09, 0.07);

  // pad: an open D chord, every voice breathing at its own rate
  padTone = ctx.createBiquadFilter();
  padTone.type = 'lowpass';
  padTone.frequency.value = 800;
  const pad = ctx.createGain();
  pad.gain.value = 0.05;
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

// altitude 0..1: the wind thins out and the pad opens up as you rise
export function setAltitude(a) {
  if (!ctx) return;
  const t = ctx.currentTime;
  wind.gain.setTargetAtTime(0.22 * (1 - a) ** 2 + 0.01, t, 3);
  padTone.frequency.setTargetAtTime(700 + a * 2400, t, 3);
}

// pan -1..1. Notes wander up and down the scale, so a trail of lights plays a little melody.
export function chime(pan) {
  if (!ctx) return;
  step = Math.max(0, Math.min(11, step + [-1, 1, 1, 2][Math.floor(Math.random() * 4)]));
  const note = 62 + 12 * Math.floor(step / 5) + SCALE[step % 5];
  const f = 440 * 2 ** ((note - 69) / 12);
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.16, t + 0.012);
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
