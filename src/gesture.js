// Hand gestures from WebXR joint positions. Pure (no three.js): vectors are [x, y, z] arrays and a
// hand is { jointName: [x, y, z] } or null. Hand data is used live for interaction only, never kept
// or sent (Meta policy), so the only state here is a few seconds of hysteresis and filtering.

const FINGERS = ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
export const JOINTS = [
  'wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  ...FINGERS.flatMap((f) => ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map((p) => `${f}-${p}`)),
];

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dist = (a, b) => len(sub(a, b));
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// The palm as a frame: centre, normal out of the palm side, forward (wrist to middle knuckle),
// side (forward x normal), how straight the four fingers are (0..1) and how far they fan out.
export function palmFrame(j, handedness) {
  if (!j) return null;
  const knuckles = FINGERS.map((f) => j[`${f}-phalanx-proximal`]);
  const center = [0, 1, 2].map((k) => (j.wrist[k] + knuckles.reduce((s, q) => s + q[k], 0)) / 5);
  const forward = norm(sub(j['middle-finger-phalanx-proximal'], j.wrist));
  const across = sub(j['index-finger-phalanx-proximal'], j['pinky-finger-phalanx-proximal']);
  let normal = cross(forward, across);
  if (handedness !== 'left') normal = normal.map((v) => -v); // mirror hands, mirror cross product
  normal = norm(sub(normal, forward.map((v) => v * dot(normal, forward))));
  const side = norm(cross(forward, normal));
  // straightness: knuckle-to-tip distance against the length of the bones in between
  const extension = FINGERS.reduce((s, f) => {
    const p = j[`${f}-phalanx-proximal`], m = j[`${f}-phalanx-intermediate`], d = j[`${f}-phalanx-distal`], t = j[`${f}-tip`];
    const ratio = dist(p, t) / (dist(p, m) + dist(m, d) + dist(d, t) || 1);
    return s + clamp01((ratio - 0.62) / 0.36);
  }, 0) / 4;
  const dirs = FINGERS.map((f) => norm(sub(j[`${f}-tip`], j[`${f}-phalanx-proximal`])));
  let spread = 0;
  for (let i = 1; i < 4; i++) spread += Math.acos(Math.max(-1, Math.min(1, dot(dirs[i - 1], dirs[i]))));
  return { center, normal, forward, side, extension, spread: spread / 3 };
}

// One Euro filter (Casiez et al.): smooth when still, quick when moving. Numbers or arrays.
export class OneEuro {
  constructor({ minCutoff = 1.0, beta = 0.02, dCutoff = 1.0 } = {}) {
    Object.assign(this, { minCutoff, beta, dCutoff });
    this.reset();
  }
  reset() { this.x = this.dx = null; }
  filter(value, dt) {
    const arr = Array.isArray(value), v = arr ? value : [value];
    if (!this.x || dt <= 0) {
      this.x = v.slice();
      this.dx = v.map(() => 0);
    } else {
      const alpha = (cutoff) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
      const ad = alpha(this.dCutoff);
      this.dx = v.map((q, i) => this.dx[i] + ad * ((q - this.x[i]) / dt - this.dx[i]));
      const speed = Math.hypot(...this.dx);
      const a = alpha(this.minCutoff + this.beta * speed);
      this.x = v.map((q, i) => this.x[i] + a * (q - this.x[i]));
    }
    return arr ? this.x.slice() : this.x[0];
  }
}

// A condition that must hold `on` seconds to switch on and fail `off` seconds to switch off;
// a lost hand shorter than `drop` seconds changes nothing.
function latch(on, off, drop) {
  let active = false, t = 0, lost = 0;
  return {
    get active() { return active; },
    update(ok, dt) {
      if (ok === null) {
        lost += dt;
        if (lost > drop) { active = false; t = 0; }
        return active;
      }
      lost = 0;
      if (ok === active) t = 0;
      else if ((t += dt) >= (active ? off : on)) { active = ok; t = 0; }
      return active;
    },
  };
}

// Take-off: palm facing down, fingers straight and spread, lifted off the table, held a moment.
export function createPalmDown({ holdOn = 0.5, holdOff = 0.3, minHeight = 0.08, dropTolerance = 0.25 } = {}) {
  const l = latch(holdOn, holdOff, dropTolerance);
  return {
    get active() { return l.active; },
    update(frame, tableY, dt) {
      if (!frame) return l.update(null, dt);
      const ok = -frame.normal[1] > 0.7 && frame.extension > 0.75 && frame.spread > 0.12 && frame.center[1] - tableY >= minHeight;
      return l.update(ok, dt);
    },
  };
}

// A fingertip on the table: 'touch' below 1.5 cm (released above 3 cm), 'hover' below 4 cm.
export function createTouch({ touchOn = 0.015, touchOff = 0.03, hover = 0.04, offTime = 0.1 } = {}) {
  let state = 'none', above = 0;
  return {
    update(tip, tableY, dt) {
      if (!tip) {
        above += dt;
        if (above > offTime) state = 'none';
        return state;
      }
      const h = tip[1] - tableY;
      if (state === 'touch') {
        above = h > touchOff ? above + dt : 0;
        if (above > offTime) state = h < hover ? 'hover' : 'none';
      } else if (h < touchOn) {
        state = 'touch';
        above = 0;
      } else {
        state = h < (state === 'hover' ? hover + 0.01 : hover) ? 'hover' : 'none';
      }
      return state;
    },
  };
}

// Tilt of the palm against the pose it had at take-off. roll > 0 banks right, pitch > 0 is fingers
// up. Both hands read the same, because side comes from forward and normal, not from handedness.
export function palmTilt(frame, ref) {
  const roll = Math.atan2(dot(frame.normal, ref.side), dot(frame.normal, ref.normal));
  const pitch = Math.atan2(dot(frame.forward, ref.normal.map((v) => -v)), dot(frame.forward, ref.forward));
  return { roll, pitch };
}

// The two-hand shadow bird: wrists crossed and close, palms parallel, raised. Quest tracks crossed
// hands badly, so this is loose: a hand vanishing while the wrists were close still counts.
export function createShadowBird({ maxWristGap = 0.12, holdOn = 0.5, exitGap = 0.2, holdOff = 0.3, minHeight = 0.15 } = {}) {
  let active = false, t = 0, wasClose = false, lostBoth = 0;
  return {
    update(lf, rf, lj, rj, tableY, dt) {
      if (!lf && !rf) {
        lostBoth += dt;
        if (lostBoth > 0.5) { active = false; t = 0; wasClose = false; }
        return active;
      }
      lostBoth = 0;
      let pose;
      if (lf && rf) {
        const gap = dist(lj.wrist, rj.wrist);
        // crossed: seen along the right hand's side axis, the left wrist sits on the right hand's side
        const crossed = dot(sub(lj.wrist, rj.wrist), rf.side) < 0.02 || gap < 0.05;
        const parallel = Math.abs(dot(lf.normal, rf.normal)) > 0.6;
        const high = Math.min(lf.center[1], rf.center[1]) - tableY >= minHeight;
        wasClose = gap < maxWristGap;
        pose = wasClose && crossed && parallel && high;
        if (active && gap > exitGap) pose = false;
        else if (active) pose = true;
      } else {
        pose = wasClose; // one hand dropped out mid-pose: evidence, not failure
      }
      if (pose === active) t = 0;
      else if ((t += dt) >= (active ? holdOff : holdOn)) { active = pose; t = 0; }
      return active;
    },
  };
}
