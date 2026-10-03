// Grows a fingerprint land from a class and a seed (never from a real finger), then reads it as
// terrain: ridges are walls, furrows are paths, ridge count towards the core is height, minutiae
// are landmarks. Pure: runs under node --test and in a module worker.
//
// Growth follows SFinGe (Cappelli, Maio, Maltoni): an orientation field from the class's singular
// points (the Sherlock-Monro zero-pole model), then oriented Gabor filtering of a few random seeds,
// iterated until ridges fill the finger. Minutiae appear where growing ridge fronts meet, so the
// seed decides them while the class decides the flow.

export const CLASSES = ['arch', 'tented', 'loop', 'pocket', 'whorl', 'double'];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Singular points in unit coordinates (x right, y down, the fingertip at the top).
function singularities(cls, rand) {
  const j = (s) => (rand() - 0.5) * s;
  const side = rand() < 0.5 ? -1 : 1;
  switch (cls) {
    case 'tented': return { cores: [[0.5 + j(0.04), 0.44 + j(0.03)]], deltas: [[0.5 + j(0.04), 0.57 + j(0.02)]] };
    case 'loop': return { cores: [[0.5 + side * 0.04 + j(0.04), 0.42 + j(0.04)]], deltas: [[0.5 + side * 0.25 + j(0.03), 0.68 + j(0.04)]] };
    case 'pocket': return { cores: [[0.48 + j(0.02), 0.44 + j(0.02)], [0.52 + j(0.02), 0.47 + j(0.02)]], deltas: [[0.5 - side * 0.24, 0.68 + j(0.03)], [0.5 + side * 0.13, 0.6 + j(0.03)]] };
    case 'whorl': return { cores: [[0.494 + j(0.01), 0.47 + j(0.03)], [0.506 + j(0.01), 0.47 + j(0.03)]], deltas: [[0.25 + j(0.04), 0.71 + j(0.04)], [0.75 + j(0.04), 0.71 + j(0.04)]] };
    case 'double': return { cores: [[0.42 + j(0.03), 0.4 + j(0.03)], [0.58 + j(0.03), 0.53 + j(0.03)]], deltas: [[0.22 + j(0.03), 0.69 + j(0.03)], [0.78 + j(0.03), 0.66 + j(0.03)]] };
    default: return { cores: [], deltas: [] }; // arch
  }
}

// Ridge direction at (x, y), radians, defined up to pi.
function orientation(cls, sp, x, y, bend) {
  let t;
  if (cls === 'arch') {
    // ridges cross the finger and hump in the middle; the hump is tallest mid-finger
    const g = Math.exp(-(((x - 0.5) / 0.2) ** 2)), a = 0.16 * Math.exp(-(((y - 0.55) / 0.3) ** 2));
    t = Math.atan(a * g * (2 * (x - 0.5)) / 0.04);
  } else {
    t = 0;
    for (const [cx, cy] of sp.cores) t += Math.atan2(y - cy, x - cx);
    for (const [dx, dy] of sp.deltas) t -= Math.atan2(y - dy, x - dx);
    t *= 0.5;
  }
  return t + bend[0] * Math.sin(x * 4.1 + bend[1]) * Math.cos(y * 3.3 + bend[2]); // organic sway
}

// A fingertip outline: round at the tip, a little wider towards the base, soft coast.
function maskAt(x, y) {
  const s = Math.min(1, Math.max(0, (y - 0.3) / 0.45)), base = s * s * (3 - 2 * s);
  const dx = (x - 0.5) / (0.41 + 0.035 * base), dy = (y - 0.52) / (0.47 - 0.03 * base);
  return Math.max(0, Math.min(1, (1 - Math.hypot(dx, dy)) / 0.12));
}

// [1 2 1] x [1 2 1] / 16, in place (tmp is scratch)
function blur(img, tmp, N) {
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      tmp[i] = (img[x > 0 ? i - 1 : i] + 2 * img[i] + img[x < N - 1 ? i + 1 : i]) * 0.25;
    }
  }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      img[i] = (tmp[y > 0 ? i - N : i] + 2 * tmp[i] + tmp[y < N - 1 ? i + N : i]) * 0.25;
    }
  }
}

const N8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]]; // in circular order

export function makeLand({ cls, seed, size = 256, ridges = 22, iterations = 40, onProgress = null }) {
  if (!CLASSES.includes(cls)) throw new Error(`unknown class ${cls}`);
  const N = size, NN = N * N, T = N / ridges;
  const rand = rng(seed * 7919 + CLASSES.indexOf(cls));
  const sp = singularities(cls, rand);
  const bend = [0.12 + rand() * 0.1, rand() * 6.28, rand() * 6.28];

  const mask = new Float32Array(NN);
  const cos = new Float32Array(NN), sin = new Float32Array(NN);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x, u = (x + 0.5) / N, v = (y + 0.5) / N;
      mask[i] = maskAt(u, v);
      const t = orientation(cls, sp, u, v, bend);
      cos[i] = Math.cos(t);
      sin[i] = Math.sin(t);
    }
  }

  // gather tables: per pixel, the source pixels of each filter tap (nearest neighbour)
  const TT = 7, TN = 11, stepT = 1.2, stepN = T / 6;
  const along = new Int32Array(NN * TT), across = new Int32Array(NN * TN);
  const wT = [], wN = [];
  for (let k = 0; k < TT; k++) wT.push(Math.exp(-(((k - 3) * stepT) ** 2) / 8));
  for (let k = 0; k < TN; k++) {
    const s = (k - 5) * stepN;
    wN.push(Math.cos((2 * Math.PI * s) / T) * Math.exp(-(s * s) / (2 * (T / 3) ** 2)));
  }
  const mean = wN.reduce((a, b) => a + b, 0) / TN;
  for (let k = 0; k < TN; k++) wN[k] -= mean; // zero mean: a band-pass that only keeps ridges
  const gain = 1 / wN.reduce((a, w, k) => a + w * Math.cos((2 * Math.PI * (k - 5) * stepN) / T), 0);
  const sumT = wT.reduce((a, b) => a + b, 0);
  const clampI = (v) => (v < 0 ? 0 : v >= N ? N - 1 : v);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x, c = cos[i], s = sin[i];
      for (let k = 0; k < TT; k++) {
        const d = (k - 3) * stepT;
        along[i * TT + k] = clampI(Math.round(y + d * s)) * N + clampI(Math.round(x + d * c));
      }
      for (let k = 0; k < TN; k++) {
        const d = (k - 5) * stepN;
        across[i * TN + k] = clampI(Math.round(y + d * c)) * N + clampI(Math.round(x - d * s));
      }
    }
  }

  // a few seeds, like the initiation sites real ridges grow from, plus a whisper of noise
  let img = new Float32Array(NN), tmp = new Float32Array(NN);
  for (let i = 0; i < NN; i++) img[i] = (rand() - 0.5) * 0.02 * mask[i];
  for (let s = 0; s < 14; s++) {
    const cx = Math.floor(N * (0.2 + rand() * 0.6)), cy = Math.floor(N * (0.2 + rand() * 0.6)), r = T * 0.6;
    for (let y = Math.max(0, cy - r); y < Math.min(N, cy + r); y++) {
      for (let x = Math.max(0, cx - r); x < Math.min(N, cx + r); x++) img[y * N + x] = rand() < 0.5 ? 1 : -1;
    }
  }
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < NN; i++) {
      let a = 0;
      for (let k = 0, o = i * TT; k < TT; k++) a += wT[k] * img[along[o + k]];
      tmp[i] = a / sumT;
    }
    for (let i = 0; i < NN; i++) {
      let b = 0;
      for (let k = 0, o = i * TN; k < TN; k++) b += wN[k] * tmp[across[o + k]];
      img[i] = b * gain;
    }
    // a light binomial blur: rounding the taps to whole pixels gives the filter some gain at the
    // two-pixel stripe, and the iteration would otherwise grow that hatching instead of ridges
    blur(img, tmp, N);
    for (let i = 0; i < NN; i++) img[i] = Math.tanh(2.2 * img[i]) * (mask[i] > 0 ? 1 : 0);
    if (onProgress && (it % 4 === 3 || it === iterations - 1)) onProgress(img, it + 1, iterations);
  }
  const ridge = img;
  for (let i = 0; i < NN; i++) ridge[i] = mask[i] > 0.02 ? Math.max(-1, Math.min(1, ridge[i] * 1.4)) * Math.min(1, mask[i] * 3) : 0;

  const inside = (i) => mask[i] > 0.5;
  const isRidge = (i) => ridge[i] > 0;

  // height: ridges crossed on the straight walk to the summit (forensic ridge counting)
  const px = (p) => [p[0] * N, p[1] * N];
  const summits = sp.cores.length ? sp.cores.map(px) : [[0.5 * N, 0.42 * N]];
  const count = new Float32Array(NN);
  let maxCount = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      if (!inside(i)) continue;
      let best = Infinity, target = summits[0];
      for (const s of summits) { const d = (s[0] - x) ** 2 + (s[1] - y) ** 2; if (d < best) { best = d; target = s; } }
      const steps = Math.ceil(Math.sqrt(best) / 0.75);
      let c = 0, prev = isRidge(i);
      for (let k = 1; k <= steps; k++) {
        const q = Math.round(y + ((target[1] - y) * k) / steps) * N + Math.round(x + ((target[0] - x) * k) / steps);
        const r = isRidge(q);
        if (r && !prev) c++;
        prev = r;
      }
      count[i] = c;
      if (c > maxCount) maxCount = c;
    }
  }
  // each furrow becomes one flat terrace (the median of its pixels); walls take the higher side
  const height = new Uint8Array(NN), label = new Int32Array(NN).fill(-1);
  const stack = new Int32Array(NN);
  let labels = 0;
  for (let s = 0; s < NN; s++) {
    if (label[s] >= 0 || !inside(s) || isRidge(s)) continue;
    let top = 0, n = 0;
    const members = [];
    stack[top++] = s;
    label[s] = labels;
    while (top) {
      const i = stack[--top];
      members.push(i);
      n++;
      const x = i % N, y = (i / N) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const qx = x + dx, qy = y + dy, q = qy * N + qx;
        if (qx < 0 || qy < 0 || qx >= N || qy >= N || label[q] >= 0 || !inside(q) || isRidge(q)) continue;
        label[q] = labels;
        stack[top++] = q;
      }
    }
    const values = members.map((i) => count[i]).sort((a, b) => a - b);
    const level = Math.max(0, Math.round(maxCount - values[values.length >> 1]));
    for (const i of members) height[i] = level;
    labels++;
  }
  for (let i = 0; i < NN; i++) {
    if (!inside(i) || !isRidge(i)) continue;
    const x = i % N, y = (i / N) | 0;
    let h = 0;
    for (let r = 1; r <= Math.ceil(T / 2) && !h; r++) {
      for (const [dx, dy] of N8) {
        const qx = x + dx * r, qy = y + dy * r;
        if (qx >= 0 && qy >= 0 && qx < N && qy < N && !isRidge(qy * N + qx) && inside(qy * N + qx)) h = Math.max(h, height[qy * N + qx]);
      }
    }
    height[i] = h;
  }
  let levels = 0;
  for (let i = 0; i < NN; i++) if (height[i] > levels) levels = height[i];

  // the walkable paths: furrow centrelines, thinned to one pixel, short spurs pruned
  const paths = new Uint8Array(NN);
  for (let i = 0; i < NN; i++) paths[i] = inside(i) && !isRidge(i) ? 1 : 0;
  thin(paths, N);
  prune(paths, N, Math.round(T / 2));

  // landmarks from the ridge skeleton: endings and forks (crossing number), dots, the singular points
  const bones = new Uint8Array(NN);
  for (let i = 0; i < NN; i++) bones[i] = inside(i) && isRidge(i) ? 1 : 0;
  thin(bones, N);
  const found = [];
  for (let y = 1; y < N - 1; y++) {
    for (let x = 1; x < N - 1; x++) {
      const i = y * N + x;
      if (!bones[i] || mask[i] < 0.85) continue;
      let cn = 0, nb = 0;
      for (let k = 0; k < 8; k++) {
        const a = bones[(y + N8[k][1]) * N + x + N8[k][0]], b = bones[(y + N8[(k + 1) % 8][1]) * N + x + N8[(k + 1) % 8][0]];
        cn += Math.abs(a - b);
        nb += a;
      }
      cn /= 2;
      if (nb === 0) found.push({ x, y, kind: 'dot' });
      else if (cn === 1) found.push({ x, y, kind: 'ending' });
      else if (cn === 3) found.push({ x, y, kind: 'fork' });
    }
  }
  // spread them out: false pairs and clusters become one landmark
  const landmarks = [];
  const minGap = T * 1.3;
  for (const m of found) {
    if (landmarks.some((o) => (o.x - m.x) ** 2 + (o.y - m.y) ** 2 < minGap * minGap)) continue;
    const curve = trace(bones, N, m.x, m.y, 34);
    if (curve.length >= 8 || m.kind === 'dot') landmarks.push({ ...m, ridge: curve.length >= 2 ? curve : [[m.x - 4, m.y], [m.x + 4, m.y]] });
  }
  const cores = sp.cores.map(px), deltas = sp.deltas.map(px);
  for (const [kind, list] of [['core', cores], ['delta', deltas]]) {
    for (const [x, y] of list) {
      const near = nearestOn(bones, N, Math.round(x), Math.round(y), Math.ceil(T * 2));
      const curve = near ? trace(bones, N, near[0], near[1], 40, true) : [];
      landmarks.push({ x: Math.round(x), y: Math.round(y), kind, ridge: curve.length >= 2 ? curve : [[x - 6, y], [x + 6, y]] });
    }
  }

  return { size: N, ridge, mask, height, levels, paths, landmarks, cores, deltas };
}

// Zhang-Suen thinning, in place: a binary mask down to one-pixel-wide centrelines.
function thin(img, N) {
  const kill = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      kill.length = 0;
      for (let y = 1; y < N - 1; y++) {
        for (let x = 1; x < N - 1; x++) {
          const i = y * N + x;
          if (!img[i]) continue;
          // neighbours p2..p9 clockwise from north
          const p = [img[i - N], img[i - N + 1], img[i + 1], img[i + N + 1], img[i + N], img[i + N - 1], img[i - 1], img[i - N - 1]];
          const b = p.reduce((a, v) => a + v, 0);
          if (b < 2 || b > 6) continue;
          let a = 0;
          for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) % 8]) a++;
          if (a !== 1) continue;
          if (pass === 0 ? p[0] * p[2] * p[4] || p[2] * p[4] * p[6] : p[0] * p[2] * p[6] || p[0] * p[4] * p[6]) continue;
          kill.push(i);
        }
      }
      for (const i of kill) img[i] = 0;
      if (kill.length) changed = true;
    }
  }
}

const neighbours = (img, N, x, y) => {
  const out = [];
  for (const [dx, dy] of N8) {
    const qx = x + dx, qy = y + dy;
    if (qx >= 0 && qy >= 0 && qx < N && qy < N && img[qy * N + qx]) out.push([qx, qy]);
  }
  return out;
};

// Remove spurs: branches shorter than `len` from an end to a junction.
function prune(img, N, len) {
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!img[y * N + x] || neighbours(img, N, x, y).length !== 1) continue;
      const branch = [[x, y]];
      let [cx, cy] = [x, y], prev = null;
      while (branch.length <= len) {
        const next = neighbours(img, N, cx, cy).filter(([qx, qy]) => !prev || qx !== prev[0] || qy !== prev[1]);
        if (next.length !== 1) {
          if (next.length > 1) for (const [bx, by] of branch) img[by * N + bx] = 0; // reached a junction: a spur
          break;
        }
        prev = [cx, cy];
        [cx, cy] = next[0];
        branch.push([cx, cy]);
      }
    }
  }
}

// Follow a skeleton line from (x, y) for up to `len` pixels; `both` walks both ways and joins them.
function trace(img, N, x, y, len, both = false) {
  const walk = (start, first) => {
    const out = [];
    const seen = new Set([start[1] * N + start[0]]);
    let cur = first;
    while (cur && out.length < len) {
      out.push(cur);
      seen.add(cur[1] * N + cur[0]);
      const next = neighbours(img, N, cur[0], cur[1]).filter(([qx, qy]) => !seen.has(qy * N + qx));
      cur = next[0];
    }
    return out;
  };
  const first = neighbours(img, N, x, y);
  if (!first.length) return [];
  const a = walk([x, y], first[0]);
  if (!both || first.length < 2) return [[x, y], ...a];
  const b = walk([x, y], first[first.length - 1]).slice(0, Math.floor(len / 2));
  return [...b.reverse(), [x, y], ...a.slice(0, Math.floor(len / 2))];
}

function nearestOn(img, N, x, y, r) {
  let best = null, bd = Infinity;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const qx = x + dx, qy = y + dy;
      if (qx < 0 || qy < 0 || qx >= N || qy >= N || !img[qy * N + qx]) continue;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = [qx, qy]; }
    }
  }
  return best;
}
