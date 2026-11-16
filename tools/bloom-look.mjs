// tools/bloom-look.mjs: a headless look at the garden. Scatters test groves ahead of the whorl (through
// the room-event path, local only: nothing is sent to the map) and saves screenshots.
//   node tools/bloom-look.mjs <out dir> [x,y,z] [groves] [stage]     needs serve.py on :8130 and the map on :8787
import puppeteer from '/Users/timdries/Desktop/Projects/TD-GAME-LINKSAWAKENING/tests/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const [out = '.', at = '0,260,7600', groves = '300', stage = '', extra = ''] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--window-size=1280,720'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', (e) => { console.log('PAGEERROR', e.message); process.exitCode = 1; });
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_/.test(m.text())) console.log('console.error', m.text().slice(0, 300)); });
await page.goto(`http://localhost:8130/?play&noatelier&api=http://localhost:8787&at=${at}${extra}`, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 60; i++) { await wait(1000); if (await page.evaluate(() => window.__pwc?.state.started && window.__pwc.hands.filter((h) => h.data?.cells).length >= 10)) break; }
const n = await page.evaluate(async (groves, stage) => {
  const p = window.__pwc, b = p.bloom, g = p.glide, S = b.species;
  const { toHand } = await import('/src/world/founders.js'), { whereAt } = await import('/src/world/where.js');
  const flora = S.filter((s) => s.kind === 'flower' || s.kind === 'tree').map((s) => s.id), f = g.forward();
  let id = 900000, n = 0;
  for (let i = 0; i < 20000 && n < groves; i++) {
    const d = 60 + Math.random() * 2200, a = (Math.random() - 0.5) * 1.5;
    const x = g.pos[0] + (f[0] * Math.cos(a) - f[2] * Math.sin(a)) * d, z = g.pos[2] + (f[2] * Math.cos(a) + f[0] * Math.sin(a)) * d;
    const w = whereAt(p.hands, x, z);
    if (!w?.handbit) continue;
    const [hx, hy] = toHand(w.hand.pose, x, z), sp = flora[Math.floor(Math.random() * flora.length)], pix = b.flora.styleOf(sp) === 'pixel';
    b.onGarden({ planted: { id: id++, hand: w.hand.id, bit: w.index, x: pix ? Math.round(hx / 9) * 9 : hx, y: pix ? Math.round(hy / 9) * 9 : hy, sp, stage: stage === '' ? Math.floor(Math.random() * 4) : +stage, tended: Date.now(), big: 0, hab: 'dune' } });
    n++;
  }
  return n;
}, +groves, stage);
for (let i = 0; i < 4; i++) { await wait(i ? 2500 : 3500); await page.screenshot({ path: `${out}/bloom-${i}.png` }); }
console.log('groves', n, JSON.stringify(await page.evaluate(() => { const p = window.__pwc, s = p.state; return { fps: s.fps, calls: s.calls, pos: s.pos, speed: s.speed, shown: p.bloom.flora.shown, fauna: p.fauna.count, hud: p.bloom.hud(null).seeds }; })));
if (process.env.TILES) console.log('tiles', JSON.stringify(await page.evaluate(() => { const m = window.__pwc.bloom.flora.group.children[2], a = m.geometry.attributes, f = (k, n) => Array.from(a[k].array.slice(0, n)).map((v) => +v.toFixed(1)); return { n: m.geometry.instanceCount, aPos: f('aPos', 8), aH: f('aH', 8), aCell: f('aCell', 4), aFx: f('aFx', 6), keys: Object.keys(a), side: m.material.side, index: !!m.geometry.index, uTime: m.material.uniforms.uTime.value }; })));
await browser.close();
