// tools/film.mjs: records the demo video in Meta's Quest 3 emulator (IWER), with no headset.
// It moves the emulated head and hands through the real gestures: a fingertip on the card, a look and
// a pinch for the place, a raised hand that points to fly. Captions are laid over the page.
//   node tools/film.mjs [out.mp4]       needs serve.py on :8130, Chrome, ffmpeg on the PATH
//   SHOTS=dir node tools/film.mjs       no recording: a still every 2 s into dir, to check the takes
//   API=http://localhost:8787 (default): the shared map (wrangler dev); a second player, Oruvel, flies there too
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import puppeteer from '/Users/timdries/Desktop/Projects/TD-GAME-LINKSAWAKENING/tests/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';

const OUT = process.argv[2] ?? 'media/palm-whorl-cities-demo.mp4', SHOTS = process.env.SHOTS;
const [W, H] = (process.env.SIZE ?? '1280x720').split('x').map(Number);
const API = process.env.API ?? 'http://localhost:8787';
const URL_ = process.env.URL_ ?? `http://localhost:8130/?emulate&nodevui&at=0,1100,11800&api=${API}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: 'new', executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--enable-gpu', `--window-size=${W},${H}`] });
// a second player on the same map, circling near the route: the one you meet
const friend = await (await browser.createBrowserContext()).newPage();
await friend.setViewport({ width: 640, height: 360 });
await friend.goto('http://localhost:8130/', { waitUntil: 'load' });
await friend.evaluate(async () => { const F = await import('/src/world/founders.js'), M = await import('/src/world/mine.js'); const f = F.founders()[6]; M.saveHand(localStorage, { palm: f.palm, prints: f.prints, pose: { x: -9000, z: 21000, rot: 2.6, mirror: false }, name: 'Oruvel', pending: true }); });
await friend.goto(`http://localhost:8130/?play&auto&api=${API}&at=400,420,3600`, { waitUntil: 'load' });
const page = await (await browser.createBrowserContext()).newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(URL_, { waitUntil: 'load' });
await page.waitForFunction("!document.getElementById('banner').classList.contains('loading')", { timeout: 30000 });
await wait(2500); // the First Ten bake

let n = 0, stills = null;
if (SHOTS) stills = setInterval(() => page.screenshot({ path: `${SHOTS}/f${String(n++).padStart(3, '0')}.jpg`, type: 'jpeg', quality: 70 }).catch(() => {}), 2000);
// every frame Chrome paints, with the time it was painted, so the film plays at the speed it was played
const frames = [], dir = `${OUT}.frames`, cdp = await page.createCDPSession();
if (!SHOTS) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    const name = `${dir}/f${String(frames.length).padStart(5, '0')}.jpg`;
    fs.writeFileSync(name, Buffer.from(data, 'base64'));
    frames.push([name, metadata.timestamp]);
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
}
const t0 = Date.now(), log = (s) => console.log(((Date.now() - t0) / 1000).toFixed(1).padStart(6), s);

// ---------- in the page: the puppeteer of the emulated head and hands ----------
await page.evaluate(() => {
  const d = window.__device, S = window.__pwc.space, hands = { r: d.hands.right, l: d.hands.left };
  d.primaryInputMode = 'hand';
  const add = (a, b) => a.map((v, i) => v + b[i]), sub = (a, b) => a.map((v, i) => v - b[i]), mul = (a, k) => a.map((v) => v * k);
  const len = (a) => Math.hypot(...a), norm = (a) => mul(a, 1 / (len(a) || 1));
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const qaxis = (ax, ang) => [...mul(ax, Math.sin(ang / 2)), Math.cos(ang / 2)];
  const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
  const qrot = (q, v) => { const u = [q[0], q[1], q[2]], t = mul(cross(u, v), 2); return add(add(v, mul(t, q[3])), cross(u, t)); };
  const qfrom = (a, b) => { const c = cross(a, b), q = [...c, 1 + dot(a, b)], l = Math.hypot(...q); return q.map((v) => v / l); }; // the shortest turn from a to b
  const head0 = S.head(), delta = sub([d.position.x, d.position.y, d.position.z], head0); // the emulator's space to the game's
  const POINT = qaxis([1, 0, 0], -0.55), REST = [0, 0, 0, 1];
  // each hand eases to its target (in the game's space, the rig's); the head eases to look at a point
  const T = { r: { pos: [0.28, -0.75, -0.25], quat: REST, pose: 'default', rate: 4 }, l: { pos: [-0.28, -0.75, -0.25], quat: REST, pose: 'default', rate: 4 }, look: null, lookRate: 2, fly: null, head: head0.slice() };
  const cur = { r: { pos: T.r.pos.slice(), quat: REST.slice() }, l: { pos: T.l.pos.slice(), quat: REST.slice() }, yaw: 0, pitch: 0, head: head0.slice() };
  let last = performance.now();
  const tick = () => {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (T.fly) T.fly(dt);
    for (const k of ['r', 'l']) {
      const t = T[k], c = cur[k], e = 1 - Math.exp(-dt * t.rate);
      c.pos = add(c.pos, mul(sub(t.pos, c.pos), e));
      const s = dot(c.quat, t.quat) < 0 ? -1 : 1;
      c.quat = norm(c.quat.map((v, i) => v + (s * t.quat[i] - v) * e));
      hands[k].position.set(...add(c.pos, delta));
      hands[k].quaternion.set(...c.quat);
      if (hands[k].poseId !== t.pose) hands[k].poseId = t.pose;
    }
    cur.head = add(cur.head, mul(sub(T.head, cur.head), 1 - Math.exp(-dt * 1.5))); // leaning in or back
    d.position.set(...add(cur.head, delta));
    const at = typeof T.look === 'function' ? T.look() : T.look;
    if (at) {
      const v = sub(at, cur.head), yaw = Math.atan2(-v[0], -v[2]), pitch = Math.atan2(v[1], Math.hypot(v[0], v[2])), e = 1 - Math.exp(-dt * T.lookRate);
      cur.yaw += Math.atan2(Math.sin(yaw - cur.yaw), Math.cos(yaw - cur.yaw)) * e;
      cur.pitch += (pitch - cur.pitch) * e;
      d.quaternion.set(...qmul(qaxis([0, 1, 0], cur.yaw), qaxis([1, 0, 0], cur.pitch)));
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // captions
  const cap = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'filmcap' }));
  cap.style.cssText = 'position:fixed;left:0;right:0;bottom:7%;text-align:center;z-index:2147483646;opacity:0;transition:opacity .5s;pointer-events:none';
  const big = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'filmbig' }));
  big.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;text-align:center;z-index:2147483647;background:rgba(22,16,14,.72);color:#f6e8d8;opacity:0;transition:opacity .8s;pointer-events:none';

  let tipOff = null;
  let card = null; // kept after it closes, so a hand on its way back still has somewhere to go
  const cardPoint = (cx, cy, z) => { const c = (card = S.card() ?? card); return add(c.pos, qrot(c.quat, [(cx / 1200 - 0.5) * 0.6, (0.5 - cy / 900) * 0.45, z])); };
  window.__film = {
    T, cur, sleep,
    caption(text) { cap.style.opacity = 0; if (text) setTimeout(() => { cap.innerHTML = `<span style="display:inline-block;max-width:70%;padding:.5em 1.1em;border-radius:.6em;background:rgba(22,16,14,.62);font:600 2.1vw Georgia,serif;color:#f6e8d8">${text}</span>`; cap.style.opacity = 1; }, 350); },
    title(html) { big.innerHTML = html; big.style.opacity = html ? 1 : 0; },
    // the pointing hand: where its index fingertip is, relative to the hand
    async ready() {
      T.r.pose = 'point'; T.r.quat = POINT; T.r.rate = 30;
      await sleep(700);
      tipOff = sub(S.tip(1), cur.r.pos);
      T.r.rate = 5;
      return tipOff;
    },
    // touch the card at (cx, cy) of its 1200 x 900 face with the right index fingertip; drag = more points to draw through
    async poke(cx, cy, drag = []) {
      T.r.pose = 'point'; T.r.quat = POINT; T.r.rate = 6;
      T.look = () => { const p = cardPoint(cx, cy, 0), c = cardPoint(600, 450, 0); return add(mul(p, 0.3), mul(c, 0.7)); };
      T.r.pos = sub(cardPoint(cx, cy, 0.06), tipOff);
      await sleep(650);
      T.r.rate = 14;
      T.r.pos = sub(cardPoint(cx, cy, -0.012), tipOff);
      await sleep(330);
      for (const [x, y] of drag) { T.r.pos = sub(cardPoint(x, y, -0.012), tipOff); await sleep(140); }
      T.r.pos = sub(cardPoint(drag.length ? drag.at(-1)[0] : cx, drag.length ? drag.at(-1)[1] : cy, 0.07), tipOff);
      await sleep(330);
    },
    // raise the hand into view and pinch
    async pinch() { T.r.pose = 'default'; T.r.rate = 8; T.r.pos = add(cur.head, qrot(qmul(qaxis([0, 1, 0], cur.yaw), qaxis([1, 0, 0], cur.pitch)), [0.14, -0.16, -0.38])); await sleep(500); hands.r.updatePinchValue(1); await sleep(400); hands.r.updatePinchValue(0); await sleep(300); },
    // how far off (radians) the head still is from what it looks at
    off() { const at = typeof T.look === 'function' ? T.look() : T.look, v = norm(sub(at, cur.head)), g = qrot(qmul(qaxis([0, 1, 0], cur.yaw), qaxis([1, 0, 0], cur.pitch)), [0, 0, -1]); return Math.acos(Math.min(1, dot(v, g))); },
    lean(z) { T.head = add(head0, [0, 0, z]); },
    rest(k = 'r') { T[k].pose = 'default'; T[k].quat = REST; T[k].rate = 3; T[k].pos = [k === 'r' ? 0.28 : -0.28, -0.75, -0.25]; },
    lookWorld(x, y, z, rate = 1.5) { T.lookRate = rate; T.look = () => S.toRig(x, y, z); },
    lookAhead(pitch = -0.12, rate = 1.2) { T.lookRate = rate; T.look = () => add(S.head(), [0, Math.sin(pitch), -Math.cos(pitch)]); },
    // fly through waypoints [x, altitude, z] by pointing the raised right hand: your fingers are the arrow
    fly(points, onDone) {
      let i = 0, prev = window.__pwc.state.pos, vel = [0, 0, -1], f0 = null, turn = 0, climb = 0;
      T.r.pose = 'default'; T.r.rate = 4; T.r.pos = add(S.head(), [0.13, -0.2, -0.42]);
      T.fly = (dt) => {
        const s = window.__pwc.state, p = s.pos, h = s.hand[1];
        if (!f0 && h && len(sub(cur.r.quat, REST)) < 0.02) f0 = norm(h.point); // where the fingers point when the hand is not turned
        const mv = sub(p, prev);
        if (len(mv) > 2) { vel = norm([mv[0], 0, mv[2]]); prev = p; }
        const w = (typeof points[i] === 'function' ? points[i]() : points[i]) ?? p, to = [w[0] - p[0], 0, w[2] - p[2]], dist = len(to), t = norm(to);
        if (dist < 500 && i < points.length - 1) i++;
        else if (dist < 500 && onDone) { onDone(); onDone = null; }
        const wantTurn = Math.max(-1, Math.min(1, 2.5 * (vel[0] * t[2] - vel[2] * t[0]))), wantClimb = Math.max(-1, Math.min(1, (w[1] - p[1]) / 160));
        turn += (wantTurn - turn) * Math.min(1, dt * 2.5); climb += (wantClimb - climb) * Math.min(1, dt * 2.5);
        if (f0) T.r.quat = qfrom(f0, norm([0.5 * turn, 0.5 * climb, -1]));
        T.r.pos = add(S.head(), [0.13 + 0.05 * turn, -0.2 + 0.05 * climb, -0.42]);
        window.__film.flight = { i, dist: Math.round(dist), turn: +turn.toFixed(2), climb: +climb.toFixed(2), steering: s.steering, speed: s.speed, pos: p };
      };
    },
    stopFly() { T.fly = null; },
    // the left palm turned up in front of you (the atlas gesture), or back down on your lap
    palmUp(on) {
      T.l.pose = 'default'; T.l.rate = 4;
      T.l.quat = on ? qaxis([0, 0, 1], Math.PI) : REST;
      T.l.pos = on ? add(S.head(), [-0.1, -0.2, -0.36]) : [-0.28, -0.75, -0.25];
    },
    friend() { const o = S.others()[0]; return o ? [o.pos[0], o.pos[1], o.pos[2]] : null; },
  };
});
const film = (fn, ...a) => page.evaluate(fn, ...a);
const state = () => film(() => { const { mode, mine, hands, steering, speed, pos, xr } = __pwc.state; return { mode, mine, hands, steering, speed, pos, xr }; });
const until = async (pred, label, ms = 30000) => { for (const end = Date.now() + ms; Date.now() < end; await wait(200)) { const s = await state(); if (pred(s)) return log(`${label} ${JSON.stringify(s)}`); } log(`TIMEOUT ${label} ${JSON.stringify(await state())}`); process.exitCode = 1; };
const caption = (t) => film((t) => __film.caption(t), t);
const poke = (x, y, drag) => film((x, y, drag) => __film.poke(x, y, drag), x, y, drag ?? []);

// ---------- the film ----------
await wait(4000); // the title, over the drifting world
await page.click('#xrButton');
await until((s) => s.xr, 'in the headset');
await caption('A world map made of hands. Ten founders, then only players.');
await until((s) => s.mode === 'atelier', 'the card opens');
await caption('First, in your own room: read your hand by eye.');
log(`tip ${JSON.stringify(await film(() => __film.ready()))}`);
await film(() => __film.lean(-0.27)); // lean in to the card
await wait(1600);
if (await film(() => __pwc.state.online)) { await poke(310, 480); await wait(500); } // Read by eye (Use my phone is the other way in)
await caption('Look at each fingertip. Touch the pattern that matches.');
const PLATE = { arch: [175, 400], tented: [475, 400], ulnar: [775, 400], whorl: [175, 700], pocket: [475, 700], double: [775, 700] };
for (const cls of ['whorl', 'ulnar', 'ulnar', 'pocket', 'arch']) await poke(...PLATE[cls]);
await until((s) => true, 'prints read');
await caption('Trace your palm lines. They become rivers.');
// the dotted guide of the line being asked for, in the card's pixels
const guide = () => film(async () => {
  const { palmView, lineToPixels } = await import('/src/atelier/strokes.js');
  return lineToPixels(palmView(40, 150, 640, 710), __pwc.atelier.flow.guide());
});
for (let k = 0; k < 2; k++) { const g = await guide(); await poke(...g[0], g.slice(1)); await wait(500); }
log(`lines ${await film(() => __pwc.atelier.flow.lines.length)}`);
await poke(945, 396); // the rest: a typical palm
await wait(600);
await caption('No camera, no photo. Your Hand is a few hundred bytes of map.');
await poke(40 + 4 * 185 + 82, 290);
await wait(500);
await poke(190, 476);
await wait(900);
await poke(930, 775);
await until((s) => s.mode === 'merge', 'three fits');
await film(() => { __film.rest(); __film.lean(0); __film.lookAhead(-0.05); });
await caption('The world finds three places where your Hand fits.');
await wait(2500);
const fits = await film(() => __pwc.space.fits());
const pick = Math.min(1, fits.length - 1);
await film(([x, y, z]) => __film.lookWorld(x, y + 700, z, 4), fits[pick]);
const aimed = async () => { for (let i = 0; i < 40 && (await film(() => __film.off())) > 0.07; i++) await wait(150); };
await wait(1500);
await caption('Look at one and pinch.');
for (let k = 0; k < 4 && (await state()).mode === 'merge'; k++) { await aimed(); await film(() => __film.pinch()); log(`pinch ${k + 1}: ${(await state()).mode}`); await wait(1200); }
await until((s) => s.mode === 'rise' || s.mode === 'fly', 'laid');
await caption('Your Hand rises out of the wilderness, for everyone.');
await film(([x, y, z]) => { __film.rest(); __film.lookWorld(x, y + 150, z, 1.5); }, fits[pick]);
await until((s) => s.mode === 'fly' && s.mine, 'risen', 20000);
await wait(1500);
await caption('Raise a hand and point. Your fingers are the arrow.');
await film(() => { __film.lookAhead(-0.14); __film.fly([[0, 260, 8600], [0, 110, 6400], [500, 140, 4600]]); });
for (const [ms, text] of [[6000, 'Dive, and you build speed.'], [8000, 'Fly low over a Hand and you chart it: its handbits ink in.'], [6000, 'Every palm line is a river. Every fingertip is a hill of ridges.']]) { await wait(ms); log(`flight ${JSON.stringify(await film(() => __film.flight))}`); await caption(text); }
await wait(5000);
await caption('Turn your left palm up: the atlas of the whole world.');
await film(() => __film.palmUp(true));
await until((s) => s.mode === 'atlas', 'the atlas', 6000);
await film(() => { __film.T.lookRate = 3; __film.T.look = () => { const h = window.__pwc.space.head(); return [h[0] - 0.1, h[1] + 0.05, h[2] - 0.36]; }; });
await wait(6500);
await caption(null);
await film(() => { __film.palmUp(false); __film.lookAhead(-0.12); });
await until((s) => s.mode === 'fly', 'atlas closed', 6000);
await caption('Other players fly beside you.');
await film(() => __film.fly([() => __film.friend(), [0, 600, 0], [0, 800, -2500]]));
for (let i = 0; i < 40 && !(await film(() => window.__pwc.state.braid)); i++) await wait(500);
log(`braid ${JSON.stringify(await film(() => window.__pwc.state.braid))}`);
await caption('Meet one, and your swarms braid: that is the greeting.');
await wait(6000);
await caption('At the Source, everyone builds the Community Hand together.');
await film(() => { __film.T.lookRate = 1.2; __film.T.look = () => window.__pwc.space.toRig(0, 120, 0); });
await wait(9000);
await caption(null);
await film(() => __film.title('<div><p style="font:600 1.2vw Inter,system-ui,sans-serif;letter-spacing:.3em;text-transform:uppercase;color:#ffcfa8;margin:0 0 1vw">Every hand is a piece of the map</p><h1 style="font:600 6.5vw Georgia,serif;margin:0;line-height:.95">Palm Whorl Cities</h1><p style="font:400 1.5vw Inter,system-ui,sans-serif;margin:2vw 0 0;opacity:.85">Hands only · Meta Quest · WebXR</p></div>'));
await wait(4500);
log('cut');
if (stills) clearInterval(stills);
if (!SHOTS) {
  await cdp.send('Page.stopScreencast');
  await browser.close();
  const list = frames.map(([name, at], i) => `file '${fs.realpathSync(name)}'\nduration ${((frames[i + 1]?.[1] ?? at + 0.04) - at).toFixed(4)}`).join('\n');
  fs.writeFileSync(`${dir}/list.txt`, list);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', `${dir}/list.txt`, '-vf', 'fps=30', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT]);
  console.log(`${frames.length} frames over ${(frames.at(-1)[1] - frames[0][1]).toFixed(1)} s -> ${OUT}`);
  fs.rmSync(dir, { recursive: true, force: true });
} else await browser.close();
