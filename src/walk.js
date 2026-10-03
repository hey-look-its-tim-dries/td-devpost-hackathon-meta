// Walking the white paths. The walker lives on the path skeleton and moves toward your fingertip
// along it, never across a ridge: that is what makes a print a labyrinth. Pure (no three.js).

const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export function createWalker(land, { speed = 110 } = {}) {
  const N = land.size, paths = land.paths;
  let x = -1, y = -1, budget = 0;
  const onPath = (px, py) => px >= 0 && py >= 0 && px < N && py < N && paths[py * N + px] === 1;

  return {
    get placed() { return x >= 0; },
    get x() { return x; },
    get y() { return y; },
    get level() { return x < 0 ? 0 : land.height[y * N + x]; },

    // put the walker on the path pixel nearest to (px, py), if one is within `capture` pixels
    place(px, py, capture) {
      let best = Infinity;
      const r = Math.ceil(capture);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const qx = Math.round(px) + dx, qy = Math.round(py) + dy, d = (qx - px) ** 2 + (qy - py) ** 2;
          if (d <= capture * capture && d < best && onPath(qx, qy)) { best = d; x = qx; y = qy; }
        }
      }
      return best < Infinity;
    },

    lift() { x = y = -1; },

    // follow the fingertip (px, py) along connected path pixels, at most `speed` pixels per second.
    // Returns the pixels stepped through this frame (for the glowing trail and the footsteps).
    step(px, py, dt) {
      if (x < 0) return [];
      budget = Math.min(budget + speed * dt, 8);
      const walked = [];
      while (budget >= 1) {
        const here = (x - px) ** 2 + (y - py) ** 2;
        let bx = -1, by = -1, best = here;
        for (const [dx, dy] of NEIGHBOURS) {
          const qx = x + dx, qy = y + dy;
          if (!onPath(qx, qy)) continue;
          const d = (qx - px) ** 2 + (qy - py) ** 2;
          if (d < best - 1e-6) { best = d; bx = qx; by = qy; }
        }
        // ponytail: greedy, one pixel at a time; a path that bends away first stops the walker
        // until the fingertip follows it round. That is how a finger labyrinth feels anyway.
        if (bx < 0) { budget = 0; break; }
        x = bx; y = by;
        walked.push([x, y]);
        budget -= 1;
      }
      return walked;
    },
  };
}

// Landmarks within `radius` pixels of the walker that have not woken yet.
export function nearby(landmarks, x, y, radius, woken) {
  const out = [];
  landmarks.forEach((m, i) => {
    if (!woken.has(i) && (m.x - x) ** 2 + (m.y - y) ** 2 <= radius * radius) out.push(i);
  });
  return out;
}

// The shortest walk along the paths from (x, y) to the path pixel nearest (tx, ty): the autopilot
// uses it for demos and tests. Returns [[x, y], ...] or [] if the target is not reachable.
export function route(land, x, y, tx, ty, maxSteps = 60000) {
  const N = land.size, paths = land.paths;
  const prev = new Int32Array(N * N).fill(-1);
  const start = y * N + x;
  if (paths[start] !== 1) return [];
  const queue = new Int32Array(N * N);
  let head = 0, tail = 0, best = start, bestD = Infinity;
  queue[tail++] = start;
  prev[start] = start;
  while (head < tail && head < maxSteps) {
    const i = queue[head++], ix = i % N, iy = (i / N) | 0;
    const d = (ix - tx) ** 2 + (iy - ty) ** 2;
    if (d < bestD) { bestD = d; best = i; }
    if (d < 1) break;
    for (const [dx, dy] of NEIGHBOURS) {
      const qx = ix + dx, qy = iy + dy, q = qy * N + qx;
      if (qx < 0 || qy < 0 || qx >= N || qy >= N || paths[q] !== 1 || prev[q] !== -1) continue;
      prev[q] = i;
      queue[tail++] = q;
    }
  }
  const out = [];
  for (let i = best; i !== start; i = prev[i]) out.push([i % N, (i / N) | 0]);
  return out.reverse();
}

// Where a new house goes as you walk: on the ridge beside the path, never closer than `gap` pixels
// to another house. Returns [x, y] on a ridge pixel, or null.
export function houseSpot(land, x, y, houses, gap, reach = 7) {
  for (const [hx, hy] of houses) if ((hx - x) ** 2 + (hy - y) ** 2 < gap * gap) return null;
  const N = land.size;
  let best = null, bd = Infinity;
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const qx = x + dx, qy = y + dy, d = dx * dx + dy * dy;
      if (qx < 0 || qy < 0 || qx >= N || qy >= N || d > reach * reach || d >= bd) continue;
      const i = qy * N + qx;
      if (land.ridge[i] > 0.3 && land.mask[i] > 0.6) { bd = d; best = [qx, qy]; }
    }
  }
  return best;
}
