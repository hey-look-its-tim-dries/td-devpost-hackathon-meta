// tests/phone.mjs: the phone companion end to end, with generated images only (never a real photo).
// A headset page asks for a pairing code; a phone page reads a synthetic palm (two knuckle taps) and five
// rendered fingertips, and sends the DNA; the headset's card moves on to the palette with the phone's reading.
// Run by hand: needs serve.py on :8130 and the server on :8787.   node tests/phone.mjs
import puppeteer from '/Users/timdries/Desktop/Projects/TD-GAME-LINKSAWAKENING/tests/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const API = 'http://localhost:8787', GAME = 'http://localhost:8130';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pwc-phone-'));
const browser = await puppeteer.launch({ headless: 'new', executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--use-angle=metal', '--enable-gpu'] });
const fail = (m) => { console.log('FAIL', m); process.exitCode = 1; };

// the images, drawn in a page and saved as PNGs
const art = await browser.newPage();
await art.goto(`${GAME}/phone.html#XXXXXX`, { waitUntil: 'load' });
const files = await art.evaluate(async () => {
  const { templatePalm } = await import('/src/hand/shape.js');
  const { printPhase } = await import('/src/print/phase.js');
  const { PATTERN_OF } = await import('/src/hand/dna.js');
  const png = (c) => c.toDataURL('image/png');
  const toImage = ([X, Y]) => [256 + X * 180, 480 - Y * 180]; // a real photo: one scale both ways
  const c = Object.assign(document.createElement('canvas'), { width: 512, height: 512 }), g = c.getContext('2d');
  g.fillStyle = '#e8c3a6'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#8a5a44'; g.lineWidth = 6; g.lineCap = 'round';
  for (const l of templatePalm({ seed: 11, fate: false }).lines) { g.beginPath(); l.pts.forEach((p, i) => (i ? g.lineTo(...toImage(p)) : g.moveTo(...toImage(p)))); g.stroke(); }
  const out = { palm: png(c), prints: [] };
  for (const cls of ['whorl', 'ulnar', 'radial', 'arch', 'double']) {
    const p = Object.assign(document.createElement('canvas'), { width: 256, height: 256 }), q = p.getContext('2d'), img = q.createImageData(256, 256), [pat, mir] = PATTERN_OF[cls];
    for (let py = 0; py < 256; py++) for (let px = 0; px < 256; px++) {
      const x = (px - 128) / (256 * 0.41), y = (128 - py) / (256 * 0.45), r = Math.hypot(x, y * 0.95);
      const v = r > 0.95 ? 0.85 : 0.5 + 0.4 * Math.cos(2 * Math.PI * printPhase(pat, mir ? -x : x, y, 3)), o = (py * 256 + px) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v * 255; img.data[o + 3] = 255;
    }
    q.putImageData(img, 0, 0);
    out.prints.push(png(p));
  }
  return out;
});
const save = (name, url) => { const f = path.join(dir, name); fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); return f; };
const palmFile = save('palm.png', files.palm), printFiles = files.prints.map((u, i) => save(`print${i}.png`, u));
await art.close();

// the headset
const head = await (await browser.createBrowserContext()).newPage();
await head.setViewport({ width: 1280, height: 720 });
head.on('pageerror', (e) => fail(`headset: ${e.message}`));
await head.goto(`${GAME}/?play&api=${API}`, { waitUntil: 'load' });
await head.waitForFunction(() => window.__pwc && __pwc.state.mode === 'atelier' && __pwc.state.online, { timeout: 60000 });
await head.evaluate(() => __pwc.atelier.act({ type: 'route', route: 'phone' }));
await head.waitForFunction(() => __pwc.state.pairCode, { timeout: 20000 });
const code = await head.evaluate(() => __pwc.state.pairCode);
console.log('code', code);
await head.screenshot({ path: path.join(dir, 'headset-code.jpg'), type: 'jpeg', quality: 85 });

// the phone
const phone = await (await browser.createBrowserContext()).newPage();
await phone.setViewport({ width: 420, height: 860, isMobile: true, hasTouch: false });
phone.on('pageerror', (e) => fail(`phone: ${e.message}`));
phone.on('dialog', (d) => { fail(`phone dialog: ${d.message()}`); d.dismiss(); });
await phone.goto(`${GAME}/phone.html?api=${API}&nolandmarks#${code}`, { waitUntil: 'load' });
await phone.click('#yes');
await (await phone.waitForSelector('#pick')).uploadFile(palmFile);
await phone.waitForSelector('#pic canvas');
await wait(300);
const knuckle = await phone.evaluate(async () => { const { FINGERS, PALM_UNIT } = await import('/src/hand/shape.js'); const at = (id) => FINGERS.find((f) => f.id === id).base.map((v) => v / PALM_UNIT); return ['I', 'L'].map((id) => { const [X, Y] = at(id); return [256 + X * 180, 480 - Y * 180]; }); });
for (const [x, y] of knuckle) { const box = await (await phone.$('#pic canvas')).boundingBox(), b = 2; await phone.mouse.click(box.x + b + (x / 512) * (box.width - 2 * b), box.y + b + (y / 512) * (box.height - 2 * b)); await wait(200); } // inside the 2 px border
await phone.waitForSelector('#ok');
const read = await phone.evaluate(() => [...document.querySelectorAll('#kinds button')].map((b) => b.textContent));
console.log('phone lines', read.join(' | '));
await phone.screenshot({ path: path.join(dir, 'phone-lines.jpg'), type: 'jpeg', quality: 85 });
await phone.click('#ok');
const seen = [];
for (const f of printFiles) {
  await (await phone.waitForSelector('#pick')).uploadFile(f);
  await phone.waitForSelector('#next');
  seen.push(await phone.evaluate(() => document.querySelector('#out b')?.textContent ?? '?'));
  await phone.click('#next');
  await wait(150);
}
console.log('phone read prints as', seen.join(' | '));
await phone.waitForFunction(() => /Done|did not arrive/.test(document.getElementById('msg')?.textContent ?? ''), { timeout: 20000 });
console.log('phone says', await phone.evaluate(() => document.getElementById('msg').textContent.slice(0, 60)));
await phone.screenshot({ path: path.join(dir, 'phone-done.jpg'), type: 'jpeg', quality: 85 });

// back at the headset
await head.waitForFunction(() => __pwc.state.flowStep === 'palette', { timeout: 15000 }).catch(() => fail('the headset never reached the palette step'));
const prints = await head.evaluate(() => __pwc.atelier.flow.prints);
console.log('headset has prints', prints.join(','), 'and', await head.evaluate(() => __pwc.atelier.flow.lines.map((l) => l.kind).join(',')));
if (prints.join() !== 'whorl,ulnar,radial,arch,double') fail(`prints ${prints}`);
await head.screenshot({ path: path.join(dir, 'headset-palette.jpg'), type: 'jpeg', quality: 85 });
console.log(process.exitCode ? 'FAILED' : 'OK', '· screenshots in', dir);
await browser.close();
