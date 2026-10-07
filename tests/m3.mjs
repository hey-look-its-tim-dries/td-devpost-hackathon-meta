// tests/m3.mjs: two headless browsers against `wrangler dev` (8787) and `serve.py` (8130). One lays a
// Hand; both must end with 11 Hands and see each other's creature, and the wash must reach the other.
// Run by hand (not part of node --test):  node tests/m3.mjs
import puppeteer from '/Users/timdries/Desktop/Projects/TD-GAME-LINKSAWAKENING/tests/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';

const URL_ = 'http://localhost:8130/?play&api=http://localhost:8787';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const open = async (label) => {
  const page = await (await browser.createBrowserContext()).newPage(); // its own localStorage: its own token
  page.on('pageerror', (e) => { console.log(label, 'PAGEERROR', e.message); process.exitCode = 1; });
  await page.goto(URL_, { waitUntil: 'domcontentloaded' });
  return page;
};
const state = (p) => p.evaluate(() => (window.__pwc ? (({ mode, hands, online, others, mine, pending, scribbles }) => ({ mode, hands, online, others, mine, pending, scribbles }))(__pwc.state) : null)).catch(() => null);
const until = async (p, pred, label, tries = 150) => { for (let i = 0; i < tries; i++) { const x = await state(p); if (x && pred(x)) return console.log(label, JSON.stringify(x)); await wait(2000); } console.log('TIMEOUT', label, JSON.stringify(await state(p))); process.exitCode = 1; };

const a = await open('A'), b = await open('B');
await until(a, (x) => x.hands === 10 && x.online, 'A world');
await until(b, (x) => x.hands === 10 && x.online, 'B world');
await until(a, (x) => x.others === 1, 'A sees B');
await until(b, (x) => x.others === 1, 'B sees A');
await until(a, (x) => x.mode === 'atelier', 'A atelier');
await a.evaluate(() => { for (const c of ['whorl', 'ulnar', 'ulnar', 'whorl', 'ulnar']) __pwc.atelier.act({ type: 'pick', cls: c }); __pwc.atelier.act({ type: 'typical' }); __pwc.atelier.act({ type: 'lay' }); });
await until(a, (x) => x.mode === 'merge', 'A merge');
await a.evaluate(() => __pwc.atelier.choose(0));
await a.evaluate(() => __pwc.atelier.choose(0));
await until(a, (x) => x.mode === 'rise' && !x.pending, 'A laid through the server');
await until(b, (x) => x.hands === 11, 'B got the laid Hand');
await until(a, (x) => x.mode === 'fly' && x.hands === 11, 'A risen, its own Hand once');
await until(b, (x) => x.scribbles >= 64, 'B hatched it');
await a.evaluate(async () => { const m = JSON.parse(localStorage.getItem('pwc.hand.v1')); if (m?.id) await __pwc.net.washHand(m.id); }); // the next run starts from ten
await until(b, (x) => x.hands === 10, 'B saw the wash');
await browser.close();
console.log(process.exitCode ? 'FAIL' : 'M3 OK: two browsers see each other');
