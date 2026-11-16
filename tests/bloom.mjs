// tests/bloom.mjs: the garden end to end, two headless browsers against `wrangler dev` (8787) and serve.py (8130).
// A sows by holding the plant key over a Hand; B sees the groves arrive; A waters one and B sees it grow; A clears
// one and it leaves both. Run by hand:  node tests/bloom.mjs
import puppeteer from '/Users/timdries/Desktop/Projects/TD-GAME-LINKSAWAKENING/tests/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import assert from 'node:assert/strict';

const URL_ = 'http://localhost:8130/?play&noatelier&api=http://localhost:8787&at=0,260,7600';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const open = async (label) => {
  const page = await (await browser.createBrowserContext()).newPage();
  page.on('pageerror', (e) => { console.log(label, 'PAGEERROR', e.message); process.exitCode = 1; });
  await page.goto(URL_, { waitUntil: 'domcontentloaded' });
  return page;
};
const until = async (page, fn, what, arg) => { for (let i = 0; i < 960; i++) { const v = await page.evaluate(fn, arg); if (v) return v; await wait(250); } throw new Error(`timed out: ${what}`); };
const ready = (p) => until(p, () => window.__pwc?.state.started && window.__pwc.hands.filter((h) => h.data?.cells).length >= 10 && window.__pwc.state.room === 'open' && window.__pwc.bloom.handsRead() > 0, 'ready');
const mineIds = (p) => p.evaluate(() => [...window.__pwc.bloom.garden.all()].filter((g) => g.id > 0).map((g) => g.id));
let a = null, b = null, had0 = null;
try {
  a = await open('A');
  await ready(a); // one at a time: two software-rendered pages starting together starve each other
  b = await open('B');
  await ready(b);
  await wait(2500); // what the map already holds near here has been read
  had0 = await mineIds(a);
  // A sows
  // the longest stretch of sand due north of the start (x = 0): the whorl is put back at its start before each act, as it flies on at 340 m/s
  const homeZ = await a.evaluate(async () => {
    const { whereAt } = await import('/src/world/where.js'), p = window.__pwc;
    let best = [0, 7600], run = 0, from = 0;
    for (let z = 7600; z > 2500; z -= 20) { if (whereAt(p.hands, 0, z)?.handbit) { if (!run) from = z; run += 20; if (run > best[0]) best = [run, from]; } else run = 0; }
    return best[1] - 40;
  });
  const home = () => a.evaluate((z) => { const g = window.__pwc.glide; g.pos[0] = 0; g.pos[2] = z; g.pos[1] = window.__pwc.groundAt(0, z) + 120; g.yaw = 0; g.speed = 90; }, homeZ);
  await home(); await wait(300);
  await a.keyboard.down('Space'); await wait(4000); await a.keyboard.up('Space');
  const sown = await until(a, (old) => { const g = [...window.__pwc.bloom.garden.all()].filter((q) => !old.includes(q.id)); return g.length >= 3 && g.every((q) => q.id > 0) && g.map((q) => q.id); }, 'A planted and the map answered', had0);
  console.log('A sowed', sown.length, 'groves; speed while sowing', await a.evaluate(() => window.__pwc.state.speed));
  await until(b, (ids) => ids.every((id) => window.__pwc.bloom.garden.get(id)), 'B sees the groves', sown);
  const hudB = await b.evaluate(() => window.__pwc.bloom.hud(null).plants);
  assert.ok(hudB >= sown.length, `B counts ${hudB}`);
  // a hyper sow: for ten seconds single plants fall along A's path; they reach the map in batches, and B
  const sprigs = () => [...window.__pwc.bloom.garden.all()].filter((g) => g.big === 2 && g.id > 0).length;
  await home(); await wait(300);
  await a.keyboard.press('KeyF');
  for (let i = 0; i < 4; i++) { await wait(2400); await home(); } // ten seconds, kept over the Hand
  const drawn = await until(a, () => { const g = [...window.__pwc.bloom.garden.all()].filter((q) => q.big === 2); return g.length >= 8 && window.__pwc.bloom.hud(null).hyper === 0 && g.every((q) => q.id > 0) && g.length; }, "A drew with sprigs and the map took them");
  await until(b, (n) => [...window.__pwc.bloom.garden.all()].filter((g) => g.big === 2 && g.id > 0).length >= n, 'B sees the drawing', drawn);
  console.log('hyper sow:', drawn, 'sprigs drawn by A, seen by B:', await b.evaluate(sprigs));
  // A waters the newest grove: water in the pouch, then low over it
  const target = await a.evaluate((id) => { const p = window.__pwc, g = p.bloom.garden.get(id); p.bloom.pouch.fill(); return { id: g.id, x: g.wx, y: g.wy, z: g.wz }; }, sown.at(-1));
  await wait(1600); // a grove takes water a moment after planting
  for (let i = 0; i < 24; i++) { await a.evaluate((q) => { const g = window.__pwc.glide; g.pos[0] = q.x; g.pos[1] = q.y + 90; g.pos[2] = q.z; }, target); await wait(250); if (await a.evaluate((id) => window.__pwc.bloom.garden.get(id)?.stage >= 1, target.id)) break; }
  console.log('A after watering', JSON.stringify(await a.evaluate((id) => { const p = window.__pwc, g = p.bloom.garden.get(id), h = p.bloom.hud(null); return { water: h.water, stage: g?.stage, age: Date.now() - g?.tended, alt: Math.round(p.glide.pos[1] - g.wy), mode: p.state.mode }; }, target.id)));
  await until(b, (id) => window.__pwc.bloom.garden.get(id)?.stage >= 1, 'B sees it grow', target.id);
  console.log('watered: stage', await b.evaluate((id) => window.__pwc.bloom.garden.get(id).stage, target.id), 'on B');
  // A clears it
  // A clears a grove (the whorl flies on, so whichever grove is nearest when X lands): it must leave B too
  const had = await mineIds(a);
  let gone = [];
  for (let i = 0; i < 10 && !gone.length; i++) {
    await a.evaluate((q) => { const g = window.__pwc.glide; g.pos[0] = q.x; g.pos[1] = q.y + 90; g.pos[2] = q.z; }, target);
    await wait(150);
    await a.keyboard.press('KeyX');
    await wait(700);
    const now = await mineIds(a);
    gone = had.filter((id) => !now.includes(id));
  }
  assert.ok(gone.length, 'A cleared a grove');
  await until(b, (ids) => ids.every((id) => !window.__pwc.bloom.garden.get(id)), 'B sees it cleared', gone);
  console.log('cleared on both');
  console.log('BLOOM OK: sow, see, water, clear between two players');
} catch (e) { console.log('B:', b ? JSON.stringify(await b.evaluate(() => { const p = window.__pwc; return p ? { started: p.state.started, baked: p.hands.filter((q) => q.data?.cells).length, hands: p.hands.length, room: p.state.room, online: p.state.online, read: p.bloom.handsRead(), pos: p.state.pos, fps: p.state.fps } : 'no __pwc'; }).catch((x) => String(x))) : 'not opened'); console.log('FAILED', e.message, a ? JSON.stringify(await a.evaluate(() => { const p = window.__pwc, g = [...p.bloom.garden.all()].filter((q) => q.big === 2), h = p.bloom.hud(p.hands[0] && null); return { hyper: h.hyper, charge: h.charge, seeds: h.seeds, sprigs: g.length, temp: g.filter((q) => q.id < 0).length, pos: p.state.pos, mode: p.state.mode, started: p.state.started, baked: p.hands.filter((q) => q.data?.cells).length, room: p.state.room, online: p.state.online, read: p.bloom.handsRead() }; }).catch(() => null)) : ''); process.exitCode = 1; } finally {
  // tidy, pass or fail: A takes what it planted off the map, so the next run finds room
  if (a && had0) await a.evaluate(async (old) => { const p = window.__pwc; for (const g of [...p.bloom.garden.all()]) if (g.id > 0 && !old.includes(g.id)) await p.net.uproot(g.id); }, had0).catch(() => {});
  await browser.close();
}
