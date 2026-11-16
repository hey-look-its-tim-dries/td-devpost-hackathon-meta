// tools/load.mjs: simulated players against a LOCAL map (wrangler dev on :8787), to see what a crowd costs.
// Each player joins the room, sends its pose five times a second, sows a sprig every 2 s, waters one now and then,
// saves its pouch every 20 s and reads the board, as the game does.   node tools/load.mjs [players=40] [seconds=30]
import { encodePose } from '../src/net/wire.js';
const API = 'http://localhost:8787', N = +(process.argv[2] ?? 40), SECONDS = +(process.argv[3] ?? 30);
const hands = (await (await fetch(`${API}/world`)).json()).hands.map((h) => h.id), lat = { plant: [], tend: [], profile: [], board: [] }, fail = {}, t0 = Date.now();
let snaps = 0, texts = 0, open = 0, closed = 0;
const timed = async (kind, path, init) => { const at = performance.now(); try { const r = await fetch(API + path, init); await r.text(); lat[kind].push(performance.now() - at); if (!r.ok) fail[`${kind} ${r.status}`] = (fail[`${kind} ${r.status}`] ?? 0) + 1; return r.ok; } catch { fail[`${kind} net`] = (fail[`${kind} net`] ?? 0) + 1; return false; } };
const post = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const players = Array.from({ length: N }, (_, i) => {
  const token = `load-test-player-${String(i).padStart(4, '0')}-0123456789abcdef`, ws = new WebSocket(`ws://localhost:8787/room?shard=0`), mine = [];
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => { open++; ws.send(JSON.stringify({ name: `Load ${i}` })); };
  ws.onmessage = (e) => (typeof e.data === 'string' ? texts++ : snaps++);
  ws.onclose = () => closed++;
  const timers = [
    setInterval(() => { if (ws.readyState === 1) ws.send(encodePose({ x: i * 50, y: 300, z: 5000 + ((Date.now() - t0) / 1000) * 340, yaw: 0, pitch: 0, mode: 0 })); }, 200),
    setInterval(async () => { const at = performance.now(), r = await fetch(`${API}/plants`, post({ token, hand_id: hands[i % hands.length], bit: (i * 7) % 20, x: (Math.random() - 0.5) * 400, y: 100 + Math.random() * 300, sp: i % 259, hab: 'dune', big: 2 })).catch(() => null), b = r && await r.json().catch(() => null); lat.plant.push(performance.now() - at); if (b?.id) mine.push(b.id); else fail[`plant ${r?.status ?? 'net'}`] = (fail[`plant ${r?.status ?? 'net'}`] ?? 0) + 1; }, 2000),
    setInterval(() => { if (mine.length) timed('tend', `/plants/${mine[Math.floor(Math.random() * mine.length)]}/tend`, post({ token })); }, 5000),
    setInterval(() => timed('profile', '/profile', post({ token, data: { seeds: { 0: 10 }, xp: i, found: [0, 1, 2], log: [] } })), 20000),
    setInterval(() => { timed('board', '/plants?top=1'); timed('board', '/stats'); }, 30000),
  ];
  return { ws, timers, token, mine };
});
await new Promise((r) => setTimeout(r, SECONDS * 1000));
for (const p of players) { p.timers.forEach(clearInterval); p.ws.close(); }
const q = (a, k) => (a.length ? Math.round([...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * k))]) : null);
console.log(JSON.stringify({ players: N, seconds: SECONDS, joined: open, dropped: closed, snapshotsPerPlayerPerSecond: +(snaps / N / SECONDS).toFixed(2), textMessages: texts, fail,
  ms: Object.fromEntries(Object.entries(lat).map(([k, a]) => [k, { n: a.length, median: q(a, 0.5), p95: q(a, 0.95), worst: q(a, 1) }])) }, null, 1));
// tidy: every sprig this run planted comes off the local map again
for (const p of players) for (const id of p.mine) await fetch(`${API}/plants/${id}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: p.token }) }).catch(() => {});
process.exit(0);
