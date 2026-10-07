// server/seed.mjs: the First Ten as rows, as SQL on stdout (`npm run seed` runs it into the local D1)
import { founders } from '../src/world/founders.js';
import { unpackPalm } from '../src/hand/dna.js';

const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const now = 1759276800000; // 2026-10-01, so founders sort first
let sql = '';
founders().forEach((f, i) => {
  const palm = unpackPalm(f.palm), pid = `founder-${i}`, hid = `hand-founder-${i}`;
  sql += `insert or replace into player (id, token_hash, created_at, name, palette) values (${q(pid)}, ${q('founder-' + i)}, ${now}, ${q(f.name)}, ${palm.palette});\n`;
  sql += `insert or replace into hand (id, player_id, side, palm_dna, prints, route, gen, x, z, rot, placed_at, founder) values (${q(hid)}, ${q(pid)}, ${q(palm.side)}, X'${hex(f.palm)}', X'${hex(Uint8Array.from(f.prints.flatMap((p) => [...p])))}', 'synthetic', 1, ${f.pose.x}, ${f.pose.z}, ${f.pose.rot}, ${now + i}, 1);\n`;
});
process.stdout.write(sql);
