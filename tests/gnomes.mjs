// tests/gnomes.mjs: gnomes between two players, end to end. Two headless browsers against `wrangler dev` (8787)
// and serve.py (8130). A grows a mushroom a gnome lives in; both see it at home. A flies low over it: it grabs
// on, and B sees it on A's whorl and its cap empty. A does its quest: it joins A's team, and B hears. A sets it
// down; B picks it up and does its quest: it converts, B's count and the board go up, and A is told it lost one.
// Run by hand:  node tests/gnomes.mjs
import puppeteer from '/Users/timdries/Desktop/Projects/TD-GAME-LINKSAWAKENING/tests/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import assert from 'node:assert/strict';

const URL_ = 'http://localhost:8130/?play&noatelier&quest=speed&api=http://localhost:8787&at=0,260,7600'; // ?quest: every gnome asks to go FASTER
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const open = async (label) => {
  const page = await (await browser.createBrowserContext()).newPage();
  page.on('pageerror', (e) => { console.log(label, 'PAGEERROR', e.message); process.exitCode = 1; });
  await page.goto(URL_, { waitUntil: 'domcontentloaded' });
  // the whorl flies on at 340 m/s: hold(spot) keeps it where a step of the check needs it
  await page.evaluate(() => { window.__hold = null; setInterval(() => { const h = window.__hold, p = window.__pwc; if (!h || !p?.glide) return; const g = p.glide; g.pos[0] = h.x; g.pos[2] = h.z; g.pos[1] = p.groundAt(h.x, h.z) + h.alt; g.speed = h.speed ?? 120; g.yaw = 0; }, 50); });
  return page;
};
const until = async (page, fn, what, arg, tries = 480) => { for (let i = 0; i < tries; i++) { const v = await page.evaluate(fn, arg); if (v) return v; await wait(250); } throw new Error(`timed out: ${what}`); };
const ready = (p) => until(p, () => window.__pwc?.state.started && window.__pwc.hands.filter((h) => h.data?.cells).length >= 10 && window.__pwc.state.room === 'open' && window.__pwc.bloom.handsRead() > 0, 'ready', null, 960);
const hold = (page, spot) => page.evaluate((s) => { window.__hold = s; }, spot);
const hud = (page) => page.evaluate(() => { const h = window.__pwc.gnomes.hud(); return { riders: h.riders, team: h.team, converted: h.converted, top: h.top, quest: h.quest }; });
// the gnome on board asks to go faster (?quest=speed): fly at 780 m/s, high enough to annoy nobody
const doQuest = async (page, home) => {
  const q = await page.evaluate(() => window.__pwc.gnomes.riders()[0].quest);
  assert.equal(q.kind, 'speed');
  await hold(page, { x: home.x + 700, z: home.z, alt: 600, speed: 780 });
  return q.text;
};
let a = null, b = null;
const planted = [];
try {
  a = await open('A');
  await ready(a); // one at a time: two software-rendered pages starting together starve each other
  b = await open('B');
  await ready(b);
  await wait(2500);
  // ---- A grows a mushroom until one houses a gnome (about four in ten do) ----
  const home = await a.evaluate(async () => {
    const p = window.__pwc, { whereAt } = await import('/src/world/where.js'), { toHand } = await import('/src/world/founders.js'), { gnomeAt } = await import('/src/gnomes/gnomes.js');
    let best = [0, 7600], run = 0, from = 0; // the middle of the longest stretch of sand due north of the start
    for (let z = 7600; z > 2500; z -= 20) { if (whereAt(p.hands, 0, z)?.handbit) { if (!run) from = z; run += 20; if (run > best[0]) best = [run, from]; } else run = 0; }
    const x = 0, z = best[1] - best[0] / 2, w = whereAt(p.hands, x, z), [hx, hy] = toHand(w.hand.pose, x, z), sp = p.bloom.species.findIndex((s) => s.kind === 'mushroom'), made = [];
    for (let i = 0; i < 16; i++) {
      const r = await p.net.plant({ hand: w.hand.id, bit: w.index, x: hx, y: hy, sp, hab: 'dune', big: 0 });
      if (r.error) return { error: r.error };
      made.push(r.id);
      if (gnomeAt({ id: r.id, sp, stage: 3, dry: 0 }, p.bloom.species)) { for (let k = 0; k < 3; k++) { await new Promise((ok) => setTimeout(ok, 1150)); await p.net.tend(r.id); } return { id: r.id, x, z, made, name: gnomeAt({ id: r.id, sp, stage: 3, dry: 0 }, p.bloom.species).name }; }
      await p.net.uproot(r.id);
    }
    return { error: 'no gnome in 16 mushrooms', made };
  });
  planted.push(...(home.made ?? []));
  assert.ok(home.id, `a mushroom with a gnome: ${JSON.stringify(home)}`);
  const G = home.id;
  await hold(a, { x: home.x - 400, z: home.z, alt: 600 });
  await hold(b, { x: home.x + 300, z: home.z, alt: 600 });
  await until(a, (id) => window.__pwc.gnomes.atHome(id), 'A sees the gnome at home', G);
  await until(b, (id) => window.__pwc.gnomes.atHome(id), 'B sees the gnome at home', G);
  console.log(`${home.name} lives in mushroom ${G}; both players see it at home`);
  const a0 = await hud(a), b0 = await hud(b);
  // ---- A flies low and gently over it: it grabs on; B sees it leave its cap ----
  await hold(a, { x: home.x, z: home.z, alt: 110 });
  await until(a, (id) => window.__pwc.gnomes.riders().some((r) => r.gn.id === id), 'the gnome grabbed A', G);
  await until(b, (id) => window.__pwc.gnomes.carried().has(id) && !window.__pwc.gnomes.atHome(id), 'B sees it on A, its cap empty', G);
  console.log('it grabbed A; B sees it riding A\'s whorl and its mushroom empty');
  // ---- A does its quest: it joins A's team, and B hears ----
  console.log('A\'s quest:', await doQuest(a, home));
  await until(a, (n) => window.__pwc.gnomes.hud().team > n, 'the quest is done and the map counted it for A', a0.team);
  const tagA = (await until(a, (id) => window.__pwc.gnomes.teamOf(id), 'A knows it is on a team', G)).tag;
  await until(b, ([id, tag]) => window.__pwc.gnomes.teamOf(id)?.tag === tag, 'B hears whose it is now', [G, tagA]);
  console.log('joined A\'s team:', JSON.stringify(await hud(a)).slice(0, 90));
  // ---- A brings it home (low over its mushroom it hops off); B sees it back ----
  await hold(a, { x: home.x, z: home.z, alt: 200 });
  await until(a, () => window.__pwc.gnomes.riders().length === 0, 'it hopped off at its mushroom');
  await hold(a, { x: home.x - 900, z: home.z, alt: 600 });
  await until(b, (id) => window.__pwc.gnomes.atHome(id), 'B sees it at home again', G);
  // ---- B picks it up and does its quest: converted ----
  await hold(b, { x: home.x, z: home.z, alt: 110 });
  await until(b, (id) => window.__pwc.gnomes.riders().some((r) => r.gn.id === id), 'the gnome grabbed B', G);
  await until(a, (id) => window.__pwc.gnomes.carried().has(id), 'A sees it on B', G);
  console.log('B\'s quest:', await doQuest(b, home));
  await until(b, (n) => window.__pwc.gnomes.hud().converted > n, 'B converted it', b0.converted);
  await until(b, () => window.__pwc.gnomes.hud().top.length > 0, 'the board of converters reached B');
  await until(a, (n) => window.__pwc.gnomes.hud().team === n, 'A lost it from its team', a0.team);
  await until(a, ([id, tag]) => { const r = window.__pwc.gnomes.teamOf(id); return r && r.tag !== tag; }, 'A hears it is B\'s now', [G, tagA]);
  console.log('converted by B:', JSON.stringify(await hud(b)).slice(0, 140));
  console.log('GNOMES OK: at home, carried, seen by the other, quest, team, set down, converted, board');
} catch (e) {
  for (const [l, p] of [['A', a], ['B', b]]) if (p) console.log(l, JSON.stringify(await p.evaluate(() => { const w = window.__pwc; return w?.gnomes ? { hold: window.__hold, homes: w.gnomes.homes().length, hud: w.gnomes.hud(), carried: [...w.gnomes.carried()], room: w.state.room, online: w.state.online } : null; }).catch(() => 'gone')));
  console.log('FAILED:', e.message);
  process.exitCode = 1;
} finally {
  if (a) await a.evaluate(async (ids) => { for (const id of ids) await window.__pwc.net.uproot(id); }, planted).catch(() => {}); // tidy, pass or fail
  await browser.close();
}
