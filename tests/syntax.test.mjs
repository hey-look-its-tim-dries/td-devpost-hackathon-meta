// tests/syntax.test.mjs: every source file parses. The browser modules cannot be imported here (three.js comes from
// a CDN), so a slip in one of them would only show as a blank page: this catches it with the unit tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? (f === 'node_modules' || f.startsWith('.') ? [] : walk(p)) : /\.m?js$/.test(f) ? [p] : []; });
test('every source file parses', () => {
  const bad = [];
  for (const f of [...walk(join(root, 'src')), ...walk(join(root, 'server', 'src'))]) { try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { bad.push(`${f.replace(root, '')}: ${String(e.stderr).split('\n').find((l) => /Error/.test(l)) ?? 'does not parse'}`); } }
  assert.deepEqual(bad, []);
});
