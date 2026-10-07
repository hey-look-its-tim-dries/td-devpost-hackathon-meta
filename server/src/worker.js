// server/src/worker.js
// Palm Whorl Cities' server: the world's Hands (D1, through the World Durable Object) and live rooms
// (Room Durable Objects). Nothing about a hand but its DNA, pose and name ever arrives here.
export { World } from './world.js';
export { Room } from './room.js';

const REGIONS = ['eu', 'na', 'sa', 'as', 'af', 'oc'];
const MAX_BODY = 8192;

const cors = (req, env, extra = {}) => {
  const list = (env.ORIGINS ?? '').split(','), origin = req.headers.get('Origin') ?? '';
  const allow = req.method === 'GET' ? '*' : list.includes(origin) ? origin : list[0]; // reading the map is open to all; writing to listed origins
  return { 'Access-Control-Allow-Origin': allow, 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin', ...extra };
};
const json = (req, env, body, status = 200) => new Response(JSON.stringify(body), { status, headers: cors(req, env, { 'Content-Type': 'application/json' }) });

export default {
  async fetch(req, env) {
    const url = new URL(req.url), path = url.pathname;
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req, env) });
    const world = env.WORLD.get(env.WORLD.idFromName('world'));
    if (path === '/world' && req.method === 'GET') {
      const r = await world.fetch(new Request('https://world/world', { headers: { 'If-None-Match': req.headers.get('If-None-Match') ?? '' } }));
      return new Response(r.body, { status: r.status, headers: cors(req, env, { 'Content-Type': 'application/json', 'ETag': r.headers.get('ETag') ?? '', 'Cache-Control': 'public, max-age=10' }) });
    }
    if (path === '/hands' && req.method === 'POST') {
      const text = await req.text();
      if (text.length > MAX_BODY) return json(req, env, { error: 'too big' }, 413);
      const r = await world.fetch(new Request('https://world/hands', { method: 'POST', body: text, headers: { 'CF-Connecting-IP': req.headers.get('CF-Connecting-IP') ?? 'local' } }));
      return json(req, env, await r.json(), r.status);
    }
    const del = path.match(/^\/hands\/([\w-]{1,64})$/);
    if (del && req.method === 'DELETE') {
      const r = await world.fetch(new Request(`https://world/hands/${del[1]}`, { method: 'DELETE', body: (await req.text()).slice(0, MAX_BODY) }));
      return r.status === 204 ? new Response(null, { status: 204, headers: cors(req, env) }) : json(req, env, await r.json(), r.status);
    }
    if (path === '/room') {
      if (req.headers.get('Upgrade') !== 'websocket') return json(req, env, { error: 'websocket only' }, 426);
      const asked = url.searchParams.get('region'), continent = String(req.cf?.continent ?? '').toLowerCase();
      const region = REGIONS.includes(asked) ? asked : REGIONS.includes(continent) ? continent : regionOf(req.headers.get('CF-IPCountry'));
      const shard = Math.max(0, Math.min(999, +(url.searchParams.get('shard') ?? 0) | 0)), name = `${region}-${shard}`;
      const cap = Math.max(1, Math.min(200, +(url.searchParams.get('cap') ?? 200) | 0));
      return env.ROOM.get(env.ROOM.idFromName(name)).fetch(new Request(`https://room/?name=${name}&cap=${cap}`, { headers: req.headers }));
    }
    return json(req, env, { error: 'not found' }, 404);
  },
};

// a continent from a country code when Cloudflare gave none (dev)
const COUNTRIES = { na: 'US CA MX GL', sa: 'BR AR CL CO PE VE UY PY BO EC', oc: 'AU NZ', as: 'CN JP KR IN ID TH VN PH MY SG TW HK PK BD', af: 'ZA NG EG KE MA GH ET' };
function regionOf(cc) {
  for (const [r, list] of Object.entries(COUNTRIES)) if (list.split(' ').includes(cc)) return r;
  return 'eu';
}
