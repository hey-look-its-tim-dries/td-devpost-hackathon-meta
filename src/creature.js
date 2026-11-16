// src/creature.js
// Your creature, the Whorl: ink strands spiralling round your own flight path. The spine is the path
// the head has flown, kept as points `spacing` apart (head first); every strand winds round it, and
// the whole shape keeps adapting to how you fly: wide wings while gliding, a slim spear in a dive, a
// fan when climbing, leaning into turns, and always breathing. A few strands are bold and wide, most
// are fine lines close to the spine, and a wave swims down the body. Pure (arrays only).
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const clamp1 = (v) => Math.max(-1, Math.min(1, v));

// What each fingerprint class gives the strands of its finger (thumb to little finger, strand k takes finger k % 5):
// spin: how tightly, and which way, it winds; reach: how far out; side: how far it leans to one side of the spine;
// peak: a swelling a third of the way down. Plain (no prints, or a class nobody knows): { 1, 1, 0, 0 }.
export const STYLES = {
  arch: { spin: 0.35, reach: 0.85, side: 0, peak: 0 }, // long open waves
  tented: { spin: 0.5, reach: 0.9, side: 0, peak: 1 }, // a tent: one sharp swelling
  ulnar: { spin: 0.9, reach: 1, side: -0.8, peak: 0 }, // a loop: swept to one side
  radial: { spin: 0.9, reach: 1, side: 0.8, peak: 0 }, // a loop the other way
  whorl: { spin: 2, reach: 1.05, side: 0, peak: 0 }, // a tight spiral
  pocket: { spin: 1.5, reach: 0.7, side: 0.3, peak: 0.5 }, // a small spiral in a loop
  double: { spin: -1.4, reach: 1.1, side: 0, peak: 0 }, // two spirals: this strand winds against the others
  accidental: { spin: 1.2, reach: 0.9, side: -0.3, peak: 0.7 },
};
const PLAIN = { spin: 1, reach: 1, side: 0, peak: 0 };

export function createCreature({ strands = 5, points = 40, spacing = 5, radius = 18 } = {}) {
  const trail = new Float32Array(points * 3), spine = new Float32Array((points + 1) * 3);
  const lines = Array.from({ length: strands }, () => new Float32Array((points + 1) * 3));
  const shape = { spread: 1, fan: 0, twist: 1.2, lean: 0, split: 0, size: 1 }; // eased towards what the flying asks for
  let styled = null; // the print classes it is shaped by
  let growth = 0, flare = 0; // how far the whorl has grown (0 young .. 1 full), and the flare of a burst
  // each strand its own character: how far out it winds, how fast it twists, how heavy its line is
  const golden = 0.618034;
  const kind = Array.from({ length: strands }, (_, k) => {
    const h = (k * golden) % 1, bold = k % 3 === 0;
    return { reach: bold ? 0.9 + 0.3 * h : 0.25 + 0.45 * h, twist: 0.7 + 0.8 * ((k * 0.381966) % 1), weight: bold ? 1 : 0.28 + 0.2 * h, phase: k * 2.399963, now: { ...PLAIN }, want: PLAIN }; // now: its print's style as it is this moment, growing towards want
  });
  let newest = -1, filled = 0, count = 0, t = 0;
  let pullTo = null, pullK = 0; // the greeting: strands reach toward another player
  const push = (x, y, z) => {
    newest = (newest + 1) % points;
    trail[newest * 3] = x;
    trail[newest * 3 + 1] = y;
    trail[newest * 3 + 2] = z;
    filled = Math.min(points, filled + 1);
  };

  function build() {
    count = filled + 1;
    for (let i = 1; i < count; i++) {
      const j = ((newest - (i - 1) + points) % points) * 3;
      spine[i * 3] = trail[j];
      spine[i * 3 + 1] = trail[j + 1];
      spine[i * 3 + 2] = trail[j + 2];
    }
    const K = strands, L = shape.lean * 0.7, cl = Math.cos(L), sl = Math.sin(L);
    const wide = 1 + 0.8 * (1 - shape.fan) * shape.spread, flat = 0.5;
    for (let i = 0; i < count; i++) {
      // a frame along the spine: T towards the head, N as near to up as it can be, B to the side
      const a = Math.max(0, i - 1) * 3, b = Math.min(count - 1, i + 1) * 3;
      let tx = spine[a] - spine[b], ty = spine[a + 1] - spine[b + 1], tz = spine[a + 2] - spine[b + 2];
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      let nx = -ty * tx, ny = 1 - ty * ty, nz = -ty * tz;
      const nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-4) { nx = 1; ny = 0; nz = 0; } else { nx /= nl; ny /= nl; nz /= nl; }
      const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
      const s = count > 1 ? i / (count - 1) : 0;
      const e = Math.pow(Math.sin(Math.PI * Math.pow(s, 0.75)), 1.3); // 0 at the head and at the tail
      // a wave swims down the body, side to side and a little up and down
      const sway = radius * 0.6 * e * Math.sin(t * 2.1 - s * 9), bob = radius * 0.25 * e * Math.sin(t * 1.7 - s * 7 + 1);
      for (let k = 0; k < K; k++) {
        const c = kind[k];
        const y = c.now, th = c.phase + shape.twist * c.twist * y.spin * 2 * Math.PI * s + t * (0.6 + 0.5 * c.twist) * Math.sign(y.spin || 1) + 0.6 * Math.sin(t * 0.37 + k);
        const swell = 1 + 1.3 * y.peak * Math.exp(-(((s - 0.33) / 0.12) ** 2)), lean = y.side * radius * shape.size * 0.7 * e; // the print's swelling and its lean
        const r = radius * shape.size * (1 + 0.9 * flare) * c.reach * y.reach * swell * shape.spread * e * (1 + 1.6 * shape.fan * s) * (1 + 0.22 * Math.sin(t * 1.3 + k * 2.1 + s * 7));
        const apart = (k % 2 ? 1 : -1) * radius * shape.size * 1.7 * shape.split * e; // flat out, the whorl flies as two bodies side by side
        const u = Math.cos(th) * wide, v = Math.sin(th) * flat; // wider than tall: wings
        const p = u * cl - v * sl, q = u * sl + v * cl; // leaning into the turn
        const o = lines[k], m = i * 3;
        o[m] = spine[m] + r * (p * bx + q * nx) + (sway + apart + lean) * bx + bob * nx;
        o[m + 1] = spine[m + 1] + r * (p * by + q * ny) + (sway + apart + lean) * by + bob * ny;
        o[m + 2] = spine[m + 2] + r * (p * bz + q * nz) + (sway + apart + lean) * bz + bob * nz;
        if (pullK > 0) { const w = pullK * e * (c.weight > 0.9 ? 0.55 : 0.25); o[m] += (pullTo[0] - o[m]) * w; o[m + 1] += (pullTo[1] - o[m + 1]) * w; o[m + 2] += (pullTo[2] - o[m + 2]) * w; } // bold strands reach furthest
      }
    }
  }

  return {
    strands,
    // the strands to draw: a young whorl has five, a full-grown one all of them
    get active() { return Math.min(strands, 5 + Math.floor(growth * (strands - 5))); },
    get split() { return shape.split; },
    get flare() { return flare; },
    grow(k) { growth = clamp01(k); },
    burst() { flare = 1; }, // a moment of joy: seeds gathered, a grove planted
    // the player's five print classes (thumb to little finger), or null for the plain whorl: the strands grow into them
    style(classes) { styled = Array.isArray(classes) && classes.some((c) => STYLES[c]) ? classes.slice(0, 5) : null; kind.forEach((c, k) => { c.want = (styled && STYLES[styled[k % styled.length]]) || PLAIN; }); },
    get styled() { return styled; },
    // pos: where the head is now; speed (m/s), pitch (rad, + climbing) and turn (-1..1) shape it
    update(dt, pos, { speed = 70, pitch = 0, turn = 0 } = {}) {
      t += dt;
      spine[0] = pos[0];
      spine[1] = pos[1];
      spine[2] = pos[2];
      if (!filled) push(pos[0], pos[1], pos[2]);
      let lx = trail[newest * 3], ly = trail[newest * 3 + 1], lz = trail[newest * 3 + 2];
      let g = Math.hypot(pos[0] - lx, pos[1] - ly, pos[2] - lz);
      while (g >= spacing) { // trail points exactly `spacing` apart, however far this step went
        lx += ((pos[0] - lx) / g) * spacing;
        ly += ((pos[1] - ly) / g) * spacing;
        lz += ((pos[2] - lz) / g) * spacing;
        push(lx, ly, lz);
        g = Math.hypot(pos[0] - lx, pos[1] - ly, pos[2] - lz);
      }
      const dive = clamp01(-pitch / 0.6), climb = clamp01(pitch / 0.6), fast = clamp01((speed - 70) / 200);
      const want = { spread: (1 - 0.8 * dive) * (1 - 0.35 * fast), fan: climb, twist: 1.2 + 2.5 * dive + 1.5 * fast, lean: clamp1(turn), split: fast > 0.8 && dive < 0.3 ? 1 : 0, size: 1 + 0.6 * growth };
      flare *= Math.exp(-dt * 2.5);
      const k = 1 - Math.exp(-dt * 3);
      for (const key in want) shape[key] += (want[key] - shape[key]) * k;
      const grow = 1 - Math.exp(-dt * 1.6); // a new style is grown into over a second or two
      for (const c of kind) for (const key in PLAIN) c.now[key] += (c.want[key] - c.now[key]) * grow;
      build();
    },
    spine() { return { xyz: spine, count }; },
    strand(k) { return { xyz: lines[k], count }; },
    // braid toward a world point with weight k (0..1); pull(null, 0) lets go
    pull(to, k) { pullTo = to; pullK = to ? Math.max(0, Math.min(1, k)) : 0; },
    weight(k) { return kind[k].weight; }, // how heavy strand k's line is, 0..1
  };
}
