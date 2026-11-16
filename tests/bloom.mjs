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
const until = async (page, fn, what, arg) => { for (let i = 0; i < 200; i++) { const v = await page.evaluate(fn, arg); if (v) return v; await wait(250); } throw new Error(`timed out: ${what}`); };
const ready = (p) => until(p, () => window.__pwc?.state.started && window.__pwc.hands.filter((h) => h.data?.cells).length >= 10 && window.__pwc.state.room === 'open', 'ready');
const mineIds = (p) => p.evaluate(() => [...window.__pwc.bloom.garden.all()].filter((g) => g.id > 0).map((g) => g.id));
try {
  const a = await open('A'), b = await open('B');
  await ready(a); await ready(b);
  const before = (await mineIds(b)).length;
  // A sows
  await a.keyboard.down('Space'); await wait(4000); await a.keyboard.up('Space');
  const planted = await until(a, (n) => { const g = [...window.__pwc.bloom.garden.all()]; return g.length >= n + 3 && g.every((q) => q.id > 0) && g.length; }, 'A planted and the map answered', before);
  console.log('A sowed', planted - before, 'groves; speed while sowing', await a.evaluate(() => window.__pwc.state.speed));
  await until(b, (n) => window.__pwc.bloom.garden.count >= n, 'B sees the groves', planted);
  const hudB = await b.evaluate(() => window.__pwc.bloom.hud(null).plants);
  assert.ok(hudB >= planted, `B counts ${hudB}`);
  // A waters the newest grove: water in the pouch, then low over it
  const target = await a.evaluate(() => { const p = window.__pwc, g = [...p.bloom.garden.all()].at(-1); p.bloom.pouch.fill(); return { id: g.id, x: g.wx, y: g.wy, z: g.wz }; });
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
  // tidy: A takes its test groves off the map
  await a.evaluate(async (keep) => { const p = window.__pwc; for (const g of [...p.bloom.garden.all()]) if (g.id > 0) await p.net.uproot(g.id); }, before);
  console.log('BLOOM OK: sow, see, water, clear between two players');
} catch (e) { console.log('FAILED', e.message); process.exitCode = 1; } finally { await browser.close(); }
