// tools/film.mjs: records the demo video in Meta's Quest 3 emulator (IWER), with no headset.
// It moves the emulated head and hands through the real gestures: a fingertip on the card, a look and
// a pinch for the place, a raised hand that points to fly. Captions are laid over the page.
//   node tools/film.mjs [out.mp4]       needs serve.py on :8130, Chrome, ffmpeg on the PATH
//   SHOTS=dir node tools/film.mjs       no recording: a still every 2 s into dir, to check the takes
//   API=http://localhost:8787 (default): the shared map (wrangler dev); a second player, Oruvel, flies there too
// Before the take the second player grows a garden on that map (only on a local one; it is kept between takes):
// patches of flowers and trees on the Hand north of the start, and mushrooms until some house a gnome. The film
// then sows, waters, scatters and hyper-sows there by hand, eats a mushroom (the foxfire) and carries its gnome.
// ?quest=foxfire asks every gnome for the same side quest (eat a mushroom with it on board), so the take is the same every day.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import puppeteer from '/Users/timdries/Desktop/Projects/TD-GAME-LINKSAWAKENING/tests/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';

const OUT = process.argv[2] ?? 'media/palm-whorl-cities-demo.mp4', SHOTS = process.env.SHOTS;
const [W, H] = (process.env.SIZE ?? '1280x720').split('x').map(Number);
const API = process.env.API ?? 'http://localhost:8787';
const URL_ = process.env.URL_ ?? `http://localhost:8130/?emulate&nodevui&atelier&notutorial&tuft&quest=sow&at=0,1100,11800&api=${API}`; // ?atelier: the hand card at once
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: 'new', executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--enable-gpu', `--window-size=${W},${H}`] });
// a second player on the same map, circling near the route: the one you meet
const friend = await (await browser.createBrowserContext()).newPage();
await friend.setViewport({ width: 640, height: 360 });
await friend.goto('http://localhost:8130/', { waitUntil: 'load' });
await friend.evaluate(async () => { const F = await import('/src/world/founders.js'), M = await import('/src/world/mine.js'); const f = F.founders()[6]; M.saveHand(localStorage, { palm: f.palm, prints: f.prints, pose: { x: -9000, z: 21000, rot: 2.6, mirror: false }, name: 'Oruvel', pending: true }); });
await friend.goto(`http://localhost:8130/?play&atelier&api=${API}&at=500,420,2900`, { waitUntil: 'load' }); // north of the garden, on the lane the film flies
await friend.waitForFunction(() => window.__pwc && __pwc.state.started && __pwc.state.hands >= 10, { timeout: 60000 });
await friend.keyboard.press('m'); // their atlas is open, so they hover where you will find them
await friend.waitForFunction(() => __pwc.hands.filter((h) => h.data?.cells).length >= 10, { timeout: 60000 });
// the garden the film flies over, grown by the second player on Marrow, the Hand north of the start (a local map only;
// planted afresh for every take, and the Hands earlier takes laid are washed away): flowers in drifts along two lanes (x = 1000 northbound, x = -350 back), trees further
// out, and mushrooms beside the first lane until three of them house a gnome. Every plot keeps room for the film's own sowing.
const LOCAL = /localhost|127\.0\.0\.1/.test(API);
if (LOCAL) try { execFileSync('npx', ['wrangler', 'd1', 'execute', 'pwc', '--local', '--command', 'delete from plant; delete from gnome; delete from gnome_score; delete from hand where founder = 0'], { cwd: new URL('../server', import.meta.url).pathname, stdio: 'ignore' }); } catch (e) { console.log('the local map was not cleared:', e.message); }
const garden = !LOCAL ? null : await friend.evaluate(async () => {
  const p = window.__pwc, { whereAt } = await import('/src/world/where.js'), { toHand, toWorld } = await import('/src/world/founders.js'), { gnomeAt } = await import('/src/gnomes/gnomes.js');
  const S = p.bloom.species, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), hand = whereAt(p.hands, 1000, 4600).hand;
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, flowers = S.filter((s) => s.kind === 'flower'), trees = S.filter((s) => s.kind === 'tree'), fungi = S.filter((s) => s.kind === 'mushroom');
  const list = [], ids = [], room = new Map(); // room: groves planted per plot; 50 of the 80 a plot holds
  const spot = (x, z) => { const w = whereAt(p.hands, x, z); if (!w?.handbit || w.hand !== hand) return null; const [hx, hy] = toHand(hand.pose, x, z); return { hand: hand.id, bit: w.index, x: hx, y: hy, hab: 'dune', big: 0 }; };
  const put = (x, z, sp) => { const s = spot(x, z), n = s ? room.get(s.bit) ?? 0 : 99; if (n >= 50) return; room.set(s.bit, n + 1); list.push({ ...s, sp }); };
  // a lane: drifts of one flower, a new kind every few steps, alternating sides; now and then a tree further out
  const lane = (x0, z0, z1, step, near, far, treeEvery) => { let kind = flowers[0], k = 0; for (let z = z0; z > z1; z -= step, k++) { if (k % 5 === 0) kind = flowers[Math.floor(rnd() * flowers.length)]; const side = k % 2 ? 1 : -1; put(x0 + side * (near + rnd() * (far - near)), z + rnd() * 30, kind.id); if (treeEvery && k % treeEvery === 0) put(x0 - side * (far + 60 + rnd() * 220), z, trees[Math.floor(rnd() * trees.length)].id); } };
  lane(1000, 7320, 4150, 34, 60, 280, 4); // plots t, s and p
  lane(-350, 6400, 4150, 40, 0, 130, 0); // plot r, a narrow bank between two rivers
  lane(-1000, 6300, 4200, 70, 0, 280, 3); // plot q, the far bank
  for (let i = 0; i < list.length; i += 40) { const r = await p.net.plantMany(list.slice(i, i + 40)); if (r.ids) ids.push(...r.ids.filter(Boolean)); }
  let gnomes = 0; // mushrooms on the first lane, until three of them house a gnome (about four in ten do)
  for (let k = 0; k < 14 && gnomes < 3; k++) { const s = spot(600 + (k % 2 ? 45 : -45), 5450 - k * 95); if (!s) continue; const sp = fungi[k % fungi.length].id, r = await p.net.plant({ ...s, sp }); if (r.id) { ids.push(r.id); if (gnomeAt({ id: r.id, sp, stage: 3, dry: 0 }, S)) gnomes++; } }
  for (let round = 0; round < 3; round++) { await sleep(1150); for (let i = 0; i < ids.length; i += 25) await Promise.all(ids.slice(i, i + 25).map((id) => p.net.tend(id))); } // watered three times: in full flower
  const now = (await p.net.plants(hand.id))?.plants ?? [];
  const shrooms = now.filter((g) => S[g.sp]?.kind === 'mushroom' && g.stage === 3).map((g) => { const [x, z] = toWorld(hand.pose, g.x, g.y); return { id: g.id, x: Math.round(x), z: Math.round(z), gnome: !!gnomeAt({ ...g, dry: 0 }, S) }; });
  return { hand: hand.name, groves: now.length, plots: Object.fromEntries(room), shrooms };
});
console.log('garden', JSON.stringify(garden));
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
  let f0 = null; // where the fingers point when the hand is not turned: measured once, the first time you fly
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
      let i = 0, prev = window.__pwc.state.pos, vel = [0, 0, -1], turn = 0, climb = 0;
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
    // ---- the garden ----
    // fly towards a spot, keeping `alt` over the land under you (go() moves the spot)
    goal: { x: 0, z: 0, alt: 200 },
    go(x, z, alt) { this.goal = { x, z, alt }; },
    cruise() { this.fly([() => { const g = this.goal, p = window.__pwc.state.pos; return [g.x, window.__pwc.groundAt(p[0], p[2]) + g.alt, g.z]; }]); },
    sow(on) { hands.r.updatePinchValue(on ? 1 : 0); }, // a held right pinch sows
    async hyper() { hands.l.updatePinchValue(1); await sleep(950); hands.l.updatePinchValue(0); }, // a left pinch held for most of a second
    // the free (left) hand, open, swept fast to the right: seed scattered that way
    async sweep() { T.l.pose = 'default'; T.l.quat = REST; T.l.rate = 7; T.l.pos = add(S.head(), [-0.34, -0.2, -0.42]); await sleep(700); T.l.rate = 24; T.l.pos = add(S.head(), [0.2, -0.18, -0.42]); await sleep(450); this.rest('l'); },
    // a flat palm held out and pressed down: water for the groves around you
    async pour() { T.l.pose = 'default'; T.l.quat = REST; T.l.rate = 7; T.l.pos = add(S.head(), [-0.2, -0.2, -0.4]); await sleep(1000); T.l.rate = 8; T.l.pos = add(S.head(), [-0.2, -0.37, -0.4]); await sleep(1000); this.rest('l'); },
  };
});
const film = (fn, ...a) => page.evaluate(fn, ...a);
const state = () => film(() => { const { mode, mine, hands, steering, speed, pos, xr } = __pwc.state; return { mode, mine, hands, steering, speed, pos, xr }; });
const until = async (pred, label, ms = 30000) => { for (const end = Date.now() + ms; Date.now() < end; await wait(200)) { const s = await state(); if (pred(s)) return log(`${label} ${JSON.stringify(s)}`); } log(`TIMEOUT ${label} ${JSON.stringify(await state())}`); process.exitCode = 1; };
const caps = []; // [when (ms), what is said]: the narration is cut to these
let chapter = '';
const caption = (t) => { if (t) caps.push([Date.now(), t]); return film((h) => __film.caption(h), t ? `<span style="display:block;font:700 .95vw Inter,system-ui,sans-serif;letter-spacing:.28em;color:#ffcfa8;margin-bottom:.35em">${chapter}</span>${t}` : null); };
const poke = (x, y, drag) => film((x, y, drag) => __film.poke(x, y, drag), x, y, drag ?? []);

// ---------- the film ----------
await wait(3500); // the title, over the drifting world
// the lobby: the world right now, with the second player on the live map
await page.click('#previewButton');
await wait(600);
chapter = 'EARLY GAME · YOUR HAND BECOMES LAND';
await caption('One live world, shared by everyone. See who is flying before you dive in.');
await wait(4200);
await caption(null);
await page.click('#lobbyXr');
await until((s) => s.xr, 'in the headset');
await caption('The whole map is made of hands. Ten founders, and then every player adds one.');
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
await film(([x, y, z]) => { __film.rest('l'); __film.lookWorld(x, y + 150, z, 1.5); }, fits[pick]);
await film(() => { __film.go(1000, 10400, 520); __film.cruise(); }); // meanwhile you fly on: to a point south of the garden, to come in over it northbound
await until((s) => s.mode === 'fly' && s.mine, 'risen', 20000);
await wait(1500);
// ---------- the flight, and the garden ----------
// Marrow's sand: lane A (x = 1000) runs north over plot t (z 7300..6750), a river, plot s, a river, then plot p
// (z 5800..4100); lane B (x = -350) comes back south over plot r (z 4150..6400), a bank between two rivers. The
// mushrooms stand in plot p at x = 600. North is -z; the Source is at 0, 0. At cruise the whorl turns in a 340 m circle.
const go = (x, z, alt) => film((x, z, alt) => __film.go(x, z, alt), x, z, alt);
const reach = async (ok, label, ms = 20000) => { for (const end = Date.now() + ms; Date.now() < end; await wait(80)) { if (ok((await state()).pos)) return true; } log(`TIMEOUT ${label}: at ${(await state()).pos}`); return false; };
const near = (x, z, d, ms) => reach((p) => Math.hypot(p[0] - x, p[2] - z) < d, `near ${x},${z}`, ms);
const bloomNow = () => film(() => { const p = window.__pwc, h = p.bloom.hud(null), g = p.gnomes.hud(), s = p.state.pos, acts = {}; for (const a of window.__acts) acts[a] = (acts[a] ?? 0) + 1; return { acts, seeds: h.seeds, water: h.water, hyper: h.hyper, fox: !!h.fox, sown: p.bloom.counts.sown, tends: p.bloom.counts.tends, riders: g.riders, team: g.team, quest: g.quest && `${g.quest.kind} ${g.quest.have}/${g.quest.need}${g.quest.done ? ' done' : ''}`, speed: p.state.speed, alt: Math.round(s[1] - p.groundAt(s[0], s[2])), pos: s }; });
const mark = async (label) => log(`${label} ${JSON.stringify(await bloomNow())}`);
await film(() => { const b = window.__pwc.bloom, act = b.act; window.__acts = []; b.act = (what, ctx) => { window.__acts.push(what); return act.call(b, what, ctx); }; }); // what the hands asked the garden for, for the log
await caption('No controllers. Raise a hand and point: your fingers are the arrow.');
await film(() => __film.lookAhead(-0.14));
await near(1000, 10400, 800, 20000);
await go(1000, 8700, 250);
await wait(1500);
await caption('Dive, and you build speed. Fly low over a Hand and you chart it.');
await near(1000, 8700, 600, 12000);
// lane A, northbound: sow and water on plot t
await go(1000, 3600, 215);
await reach((p) => p[2] < 7300, 'over plot t', 8000);
await mark('at the garden');
chapter = 'MID GAME · A GARDEN FOR EVERYONE';
await caption('Every Hand is a garden. Hold a pinch, and seed flies out ahead of you.');
await film(() => __film.sow(true));
await wait(3000);
await film(() => __film.sow(false));
await mark('sown');
// low over the river for water, then plot s: sow a little more and pour it on
await go(1000, 3600, 100);
await caption('Skim a river and you carry water.');
await reach((p) => p[2] < 6480, 'over plot s', 8000);
await go(1000, 3600, 200);
await film(() => __film.sow(true));
await wait(1900);
await caption('Press a flat palm down, and it pours on what you planted.');
await film(() => __film.pour()); // (still sowing, so still slow: the water falls on the groves just planted)
await wait(300);
await film(() => __film.sow(false));
await mark('watered');
// on over the river and plot p
await caption('Four hundred real flowers and trees to find. Where plots bloom, wildlife moves in.');
await reach((p) => p[2] < 5500, 'over plot p', 12000);
await caption('Sweep an open hand and you scatter seed.');
await film(() => __film.sweep());
await mark('scattered');
// round the wrist (a U-turn to the left is 680 m wide: from x = 330 it comes out on lane B) and back south:
// the hyper sow, slowly (a held pinch brakes)
await go(330, 3600, 200);
await reach((p) => p[2] < 4150, 'past the wrist', 12000);
await go(-350, 7000, 190);
await reach((p) => p[2] > 4250 && p[0] < -150, 'onto lane B', 12000);
await caption('Hold a left pinch for a hyper sow: ten seconds of drawing with flowers.');
await film(() => __film.hyper());
await film(() => __film.sow(true));
await wait(6500);
await film(() => __film.sow(false));
await mark('drawn');
await caption('You are what you have sown: your whorl wears every flower you planted.');
await reach((p) => p[2] > 6300, 'the end of lane B', 9000);
// round again and north up lane A to a mushroom with a gnome in it
const shroom = (garden?.shrooms ?? []).find((q) => q.gnome) ?? garden?.shrooms?.[0] ?? null;
log(`mushroom ${JSON.stringify(shroom)}`);
if (shroom) {
  await go(shroom.x, 6500, 175); /* level with the pass to come: no dive, so slow enough for the gnome to grab on */
  await near(shroom.x, 6500, 450, 12000);
  chapter = 'LATE GAME · FOXFIRE, GNOMES, ONE WORLD';
  await caption('Mushrooms fruit among the flowers. Fly through one…');
  for (let pass = 0; pass < 2; pass++) {
    await go(shroom.x, shroom.z, 170);
    await near(shroom.x, shroom.z, 110, 15000);
    await wait(500);
    const b = await bloomNow();
    if (b.riders || b.fox) break; /* the foxfire is on: the story goes on, gnome or no gnome */
    log(`missed the mushroom (pass ${pass + 1}): ${JSON.stringify(b)}`);
    await go(shroom.x, shroom.z + 1500, 200); // come round again from the south
    await near(shroom.x, shroom.z + 1500, 500, 14000);
  }
  await mark('mushroom');
  await caption('…and the foxfire comes over the world. Everything counts double.');
  await wait(4200);
  // the foxfire's row of seeds: fly the line (the film logs each seed caught, for the bells on the sound track)
  await film(() => { window.__tings = []; let last = 0; setInterval(() => { const tr = window.__pwc.trail, taken = tr.points().length - tr.left; if (taken < last) last = 0; for (let k = last; k < taken; k++) window.__tings.push([Date.now(), Math.max(0, tr.streak - (taken - k))]); last = taken; }, 40); });
  await caption('Rows of seeds appear. Fly the line, and every seed rings one note higher.');
  await film(() => __film.fly([() => { const tr = window.__pwc.trail, pts = tr.points(); let far = -1; for (let i = 0; i < pts.length; i++) if (tr.isTaken(i)) far = i; return pts[Math.min(pts.length - 1, far + 2)] ?? window.__pwc.state.pos; }]));
  await wait(7000);
  log(`tings ${await film(() => window.__tings.length)}`);
  await caption('And a glimpse of what is coming: the gnome folk, giants, watching you fly over.');
  await wait(4000);
  if ((await bloomNow()).riders) {
    await caption('A gnome grabbed on, with a wish. Grant it, and it joins your team.');
    await film(() => __film.cruise()); await go(1000, 5200, 190);
    await film(() => __film.sow(true)); await wait(5000); await film(() => __film.sow(false));
    await mark('wish');
  }
}
// on north to the other player
await film(() => __film.fly([() => __film.friend() ?? [500, 420, 2900]]));
log(`friend ${JSON.stringify(await film(() => __film.friend()))}`);
await wait(3000);
await caption('Meet another player and your whorls braid. You swap seeds. That is the greeting.');
for (let i = 0; i < 40 && !(await film(() => window.__pwc.state.braid)); i++) await wait(250);
log(`braid ${JSON.stringify(await film(() => window.__pwc.state.braid))}`);
await wait(3500);
await mark('gnome');
await caption('Turn your left palm up: the atlas. The world, your garden, your friends and rivals.');
await film(() => __film.palmUp(true));
await until((s) => s.mode === 'atlas', 'the atlas', 6000);
await film(() => { __film.T.lookRate = 3; __film.T.look = () => { const h = window.__pwc.space.head(); return [h[0] - 0.1, h[1] + 0.05, h[2] - 0.36]; }; });
await wait(5000);
await caption(null);
await film(() => { __film.palmUp(false); __film.lookAhead(-0.12); });
await until((s) => s.mode === 'fly', 'atlas closed', 6000);
await film(() => __film.fly([[0, 600, 1200], [0, 700, -2500]]));
await caption('At the Source lies the Community Hand: every grove sown in the world, one pixel each.');
await film(() => { __film.T.lookRate = 1.2; __film.T.look = () => window.__pwc.space.toRig(0, 120, 0); });
await wait(6500);
await caption(null);
await film(() => __film.title('<div><p style="font:600 1.2vw Inter,system-ui,sans-serif;letter-spacing:.3em;text-transform:uppercase;color:#ffcfa8;margin:0 0 1vw">Sow the desert into bloom, together</p><h1 style="font:600 6.5vw Georgia,serif;margin:0;line-height:.95">Palm Whorl Cities</h1><p style="font:400 1.5vw Inter,system-ui,sans-serif;margin:2vw 0 0;opacity:.85">Hands only · Meta Quest · WebXR</p></div>'));
await wait(3800);
log('cut');
if (stills) clearInterval(stills);
if (!SHOTS) {
  const tings = await film(() => window.__tings ?? []).catch(() => []);
  await cdp.send('Page.stopScreencast');
  await browser.close();
  const list = frames.map(([name, at], i) => `file '${fs.realpathSync(name)}'\nduration ${((frames[i + 1]?.[1] ?? at + 0.04) - at).toFixed(4)}`).join('\n');
  fs.writeFileSync(`${dir}/list.txt`, list);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', `${dir}/list.txt`, '-vf', 'fps=30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT]);
  console.log(`${frames.length} frames over ${(frames.at(-1)[1] - frames[0][1]).toFixed(1)} s -> ${OUT}`);
  try { // narration (Kokoro, a local voice model) at each caption, never over the one before; a bell per seed; music under it
    const kokoro = `${process.env.HOME}/projects/td-assistant-jarvis-1/backtalk/.venv/bin/kokoro`, base = frames[0][1] * 1000, ins = [], fx = [];
    let end = 0;
    caps.forEach(([at, text], i) => {
      const wav = `${dir}/n${i}.wav`;
      execFileSync(kokoro, ['-m', process.env.NARRATOR ?? 'bf_emma', '-s', '1.05', '-t', text.replace(/…/g, ''), '-o', wav], { stdio: 'ignore' });
      const dur = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', wav]).toString(), start = Math.max((at - base) / 1000 + 0.3, end + 0.15);
      end = start + dur;
      ins.push('-i', wav); fx.push(`[${ins.length / 2 + 1}:a]adelay=${Math.round(start * 1000)}:all=1,volume=1.6[a${fx.length}]`);
    });
    const hz = (i) => { const k = i % 10; return 523.25 * 2 ** (([0, 2, 4, 7, 9][k % 5] + 12 * Math.floor(k / 5)) / 12); };
    for (const [at, streak] of tings) { ins.push('-f', 'lavfi', '-t', '0.6', '-i', `sine=f=${hz(streak).toFixed(1)}`); fx.push(`[${ins.filter((x) => x === '-i').length + 1}:a]afade=t=out:st=0.05:d=0.5,adelay=${Math.max(0, Math.round(at - base))}:all=1,volume=0.5[a${fx.length}]`); }
    const withSound = OUT.replace(/\.mp4$/, '.sound.mp4');
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', OUT, '-stream_loop', '-1', '-i', new URL('../assets/music/midnight-drive.ogg', import.meta.url).pathname, ...ins, '-filter_complex', `[1:a]volume=0.16[m];${fx.join(';')};[m]${fx.map((_, i) => `[a${i}]`).join('')}amix=inputs=${fx.length + 1}:normalize=0:duration=first[out]`, '-map', '0:v', '-map', '[out]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', withSound]);
    fs.renameSync(withSound, OUT);
    console.log(`sound: ${caps.length} lines of narration, ${tings.length} bells, music`);
  } catch (e) { console.log('no sound track:', String(e.message).slice(0, 400)); }
  fs.rmSync(dir, { recursive: true, force: true });
} else await browser.close();
