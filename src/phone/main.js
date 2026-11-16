// src/phone/main.js
// The phone companion (route A, spec 7.1-7.3): consent, a palm photo read into lines (you confirm or
// retrace them), five fingertip close-ups read into patterns (you confirm or change them), then the
// shuffled DNA goes to your headset through the pairing code. Photos are read in this page and never
// sent anywhere; nothing is stored on the phone either.
import { createNet, API, apiFrom } from '../net.js';
import { packPalm, rng, synthPrint, packPrint } from '../hand/dna.js';
import { templatePalm } from '../hand/shape.js';
import { glyph } from '../atelier/glyphs.js';
import { readPalmLines, frameFromKnuckles } from './palm-lines.js';
import { classifyPrint, toPrintDNA } from './print-class.js';

const app = document.getElementById('app'), params = new URLSearchParams(location.search);
const net = createNet({ api: apiFrom(params), storage: null }); // no token kept: the phone only relays DNA
const FINGERS = ['thumb', 'index finger', 'middle finger', 'ring finger', 'little finger'];
const CLASSES = ['arch', 'tented', 'ulnar', 'radial', 'whorl', 'pocket', 'double'];
const LABEL = { arch: 'arch', tented: 'tented arch', ulnar: 'loop (to the little finger)', radial: 'loop (to the thumb)', whorl: 'whorl', pocket: 'pocket loop', double: 'double loop' };
const KINDS = ['heart', 'head', 'life', 'fate'];
const COLOURS = { heart: '#b8442e', head: '#2f5d7c', life: '#3d6e2f', fate: '#6b4c9a' };
const state = { code: (location.hash.slice(1) || '').toUpperCase(), lines: [], prints: [], seed: (Math.random() * 2 ** 31) | 0 };
const el = (html) => { app.innerHTML = html; return (id) => document.getElementById(id); };

// a photo from a file input, drawn into a canvas no larger than `max` px, and its grey levels (0..1)
async function load(file, max) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const g = c.getContext('2d');
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const d = g.getImageData(0, 0, c.width, c.height).data, gray = new Float32Array(c.width * c.height);
  for (let i = 0; i < gray.length; i++) gray[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
  return { canvas: c, gray, w: c.width, h: c.height };
}

// knuckles from MediaPipe (on this phone), or null when it finds no hand or cannot load
async function knuckles(canvas) {
  try {
    const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';
    const { FilesetResolver, HandLandmarker } = await import(`${CDN}/vision_bundle.mjs`);
    const files = await FilesetResolver.forVisionTasks(`${CDN}/wasm`);
    const lm = await HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task' }, runningMode: 'IMAGE', numHands: 1 });
    const r = lm.detect(canvas);
    lm.close();
    const p = r.landmarks?.[0];
    if (!p) return null;
    const px = (i) => [p[i].x * canvas.width, p[i].y * canvas.height];
    return { index: px(5), little: px(17), wrist: px(0) };
  } catch (e) {
    console.warn('hand landmarks unavailable', e);
    return null;
  }
}

function start() {
  if (!/^[A-Z2-9]{6}$/.test(state.code)) {
    const $ = el(`<p class="eyebrow">Palm Whorl Cities</p><h1>Your phone reads your hand</h1>
      <p>Type the six-letter code your headset shows.</p><input id="code" class="code" maxlength="6" autocomplete="off" /><button id="go" class="primary">Continue</button>`);
    $('go').onclick = () => { state.code = $('code').value.trim().toUpperCase(); if (/^[A-Z2-9]{6}$/.test(state.code)) consent(); };
    return;
  }
  consent();
}

function consent() {
  const $ = el(`<p class="eyebrow">Before we start</p><h1>Your photos stay on your phone</h1>
    <p>This page photographs your palm and your five fingertips, reads them, and forgets the photos. It keeps a simplified,
    shuffled version of your palm lines and print patterns. They become a map that other players can see. You can delete
    it any time from the game ("Forget my Hand").</p>
    <p class="small">The camera route is for people aged 16 and over. Younger players read their hand by eye in the headset.</p>
    <button id="yes" class="primary">I am 16 or older: continue</button><button id="no">I am under 16</button>`);
  $('yes').onclick = palm;
  $('no').onclick = () => el(`<h1>Read your hand by eye</h1><p>Choose "Read by eye" on the card in your headset. It makes the same map, with no camera at all.</p>`);
}

function palm() {
  const $ = el(`<p class="eyebrow">1 of 2 · your palm</p><h1>Photograph your open right palm</h1>
    <p>Fingers together and up, good light, the whole palm in the picture.</p>
    <label class="button primary" for="pick">Take the palm photo</label><input id="pick" type="file" accept="image/*" capture="environment" />
    <div id="out"></div>`);
  $('pick').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    $('out').innerHTML = '<p>Reading your palm…</p>';
    const img = await load(file, 768);
    e.target.value = ''; // the photo is not kept anywhere
    const k = params.has('nolandmarks') ? null : await knuckles(img.canvas);
    if (k) return linesFrom(img, k);
    tapKnuckles(img); // no hand found: two taps place the frame by hand
  };
}

function tapKnuckles(img) {
  const $ = el(`<p class="eyebrow">1 of 2 · your palm</p><h1>Tap two knuckles</h1>
    <p id="ask" style="min-height:3.2em">Tap the knuckle at the base of your index finger.</p><div id="pic"></div>`); // a steady height: the photo must not move between the two taps
  const c = img.canvas;
  $('pic').append(c);
  const taps = [];
  c.onclick = (e) => {
    const r = c.getBoundingClientRect(), p = [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height];
    taps.push(p);
    if (taps.length === 1) $('ask').textContent = 'Now the knuckle at the base of your little finger.';
    else { c.onclick = null; linesFrom(img, { index: taps[0], little: taps[1] }); }
  };
}

function linesFrom(img, { index, little, wrist = null }) {
  // tapped by hand: the photo was taken fingers up, so the wrist lies below the knuckles
  const w = wrist ?? [(index[0] + little[0]) / 2, (index[1] + little[1]) / 2 + Math.hypot(index[0] - little[0], index[1] - little[1]) * 2];
  const frame = frameFromKnuckles(index, little, w);
  state.lines = readPalmLines(img.gray, img.w, img.h, frame);
  confirmLines(img, frame);
}

function confirmLines(img, frame) {
  const $ = el(`<p class="eyebrow">1 of 2 · your palm</p><h1>Are these your lines?</h1>
    <p>Each line will be a river. Tap a line's name and trace it with your finger to correct it.</p>
    <canvas id="c"></canvas><div class="row" id="kinds"></div><button id="ok" class="primary">These are my lines</button>`);
  const c = $('c'), g = c.getContext('2d');
  c.width = img.w; c.height = img.h;
  let tracing = null, stroke = null;
  const draw = () => {
    g.drawImage(img.canvas, 0, 0);
    for (const l of state.lines) {
      g.strokeStyle = COLOURS[l.kind]; g.lineWidth = Math.max(3, img.w / 120); g.lineCap = 'round';
      g.beginPath(); l.pts.forEach((p, i) => { const [x, y] = frame.toImage(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    }
    if (stroke) { g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); stroke.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); }
  };
  $('kinds').innerHTML = KINDS.map((k) => `<button data-k="${k}" style="border-color:${COLOURS[k]}">${state.lines.some((l) => l.kind === k) ? 'retrace' : 'add'} ${k}</button>`).join('');
  $('kinds').onclick = (e) => { const k = e.target.dataset?.k; if (!k) return; tracing = k; for (const b of $('kinds').children) b.classList.toggle('on', b.dataset.k === k); };
  const at = (e) => { const r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height]; };
  c.onpointerdown = (e) => { if (tracing) { stroke = [at(e)]; c.setPointerCapture(e.pointerId); } };
  c.onpointermove = (e) => { if (stroke) { stroke.push(at(e)); draw(); } };
  c.onpointerup = () => {
    if (!stroke || stroke.length < 4) { stroke = null; return draw(); }
    const pts = resample(stroke.map((p) => frame.toPalm(p)), 8).map(([x, y]) => [Math.max(-1, Math.min(1, x)), Math.max(-0.25, Math.min(1.75, y))]);
    state.lines = state.lines.filter((l) => l.kind !== tracing).concat({ kind: tracing, strength: 2, pts });
    stroke = null; draw();
  };
  draw();
  $('ok').onclick = () => (state.lines.some((l) => l.kind === 'life') ? finger(0) : alert('Trace your life line first: every hand has one.'));
}

function resample(p, n) {
  const cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
  return Array.from({ length: n }, (_, k) => {
    const s = (cum.at(-1) * k) / (n - 1);
    let j = 1;
    while (j < p.length - 1 && cum[j] < s) j++;
    const t = (s - cum[j - 1]) / Math.max(1e-9, cum[j] - cum[j - 1]);
    return [p[j - 1][0] + (p[j][0] - p[j - 1][0]) * t, p[j - 1][1] + (p[j][1] - p[j - 1][1]) * t];
  });
}

function finger(i) {
  if (i === 5) return send();
  const $ = el(`<p class="eyebrow">2 of 2 · your prints (${i + 1} of 5)</p><h1>Your ${FINGERS[i]}</h1>
    <p>Hold the fingertip about 5 cm from the lens, torch on, pad facing the camera. Fill the square with the fingertip.</p>
    <label class="button primary" for="pick">Take the close-up</label><input id="pick" type="file" accept="image/*" capture="environment" />
    <button id="skip">I can't: let me pick the pattern</button><div id="out"></div>`);
  const choose = (reading) => {
    let cls = reading?.cls ?? 'ulnar';
    $('out').innerHTML = `<p>${reading ? `It looks like a <b>${LABEL[cls]}</b>. Is that right? Tap the one that matches.` : 'Look at your fingertip and tap the pattern that matches.'}</p><div class="glyphs" id="gl"></div><button id="next" class="primary">Next</button>`;
    for (const k of CLASSES) {
      const b = Object.assign(document.createElement('button'), { className: k === cls ? 'on' : '' });
      const gc = glyph(k, 120, 148, 3); gc.style.width = '100%'; b.append(gc, Object.assign(document.createElement('div'), { textContent: LABEL[k] }));
      b.onclick = () => { cls = k; for (const x of $('gl').children) x.classList.toggle('on', x === b); };
      $('gl').append(b);
    }
    $('next').onclick = () => {
      const seed = rng(state.seed + i * 7919)() * 2 ** 32;
      state.prints[i] = reading ? toPrintDNA({ ...reading, cls }, i, seed) : packPrint({ ...synthPrint(i, cls, seed >>> 0), scanned: false });
      finger(i + 1);
    };
  };
  $('skip').onclick = () => choose(null);
  $('pick').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = await load(file, 1024);
    e.target.value = '';
    // the centre square, as framed, at 256 x 256
    const s = Math.min(img.w, img.h), c = document.createElement('canvas');
    c.width = c.height = 256;
    c.getContext('2d').drawImage(img.canvas, (img.w - s) / 2, (img.h - s) / 2, s, s, 0, 0, 256, 256);
    const d = c.getContext('2d').getImageData(0, 0, 256, 256).data, gray = new Float32Array(256 * 256);
    for (let k = 0; k < gray.length; k++) gray[k] = (0.299 * d[k * 4] + 0.587 * d[k * 4 + 1] + 0.114 * d[k * 4 + 2]) / 255;
    choose(classifyPrint(gray, 256, 256));
  };
}

async function send() {
  const $ = el(`<p class="eyebrow">Sending</p><h1>To your headset</h1><p id="msg">Shuffling and sending your map DNA…</p>`);
  // spec 7.3 step 7: 8 points per line on the DNA's 64-step grid, one step of jitter
  const rand = rng(state.seed ^ 0x5bd1e995), j = () => (Math.floor(rand() * 3) - 1) / 63 * 2;
  const lines = state.lines.map((l) => ({ ...l, pts: l.pts.map(([x, y]) => [x + j(), y + j()]) }));
  const palm = packPalm({ ...templatePalm({ seed: state.seed, fate: false }), lines });
  const r = await net.sendPair(state.code, { palm, prints: state.prints });
  if (r.ok) $('msg').innerHTML = '<b>Done.</b> Look back at your headset: your Hand is waiting there for its colours and its place in the world. The photos are gone.';
  else { $('msg').innerHTML = `It did not arrive (<span id="err"></span>). Check that the code on your headset is still showing, and <a href="#${state.code}" onclick="location.reload()">try again</a>.`; $('err').textContent = r.error; } // the server's words as text, never as markup
}

start();
