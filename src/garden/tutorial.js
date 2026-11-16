// src/garden/tutorial.js
// The tutorial: one move at a time, flying first, each shown on a card until you have done it (not until time has
// passed). The game feeds it what you are doing; it says which step you are on and how far along. Pure.
// sig: { turn, climb (what you steer, -1..1), sown (groves so far), water (pours carried), atlas (open),
//        acts: { next, scatter, pour, hyper } (how often each was asked for) }
const held = (pick, seconds) => (sig, st, dt) => { st.t = (st.t ?? 0) + (Math.abs(pick(sig)) > 0.3 ? dt : 0); return st.t / seconds; };
const count = (pick, n) => (sig, st) => { st.from ??= pick(sig); return (pick(sig) - st.from) / n; };
export const STEPS = [
  { id: 'turn', icon: 'turn', title: 'Turn', hand: 'Raise a hand and point left or right', keys: 'Press A and D to turn', test: held((s) => s.turn, 1.5) },
  { id: 'climb', icon: 'climb', title: 'Climb and dive', hand: 'Point your fingers up to climb, down to dive', keys: 'Press W to climb, S to dive', test: held((s) => s.climb, 1.5) },
  { id: 'sow', icon: 'sow', title: 'Sow', hand: 'Fly low over a Hand, then pinch and hold', keys: 'Fly low over a Hand, then hold SPACE', test: count((s) => s.sown, 3) },
  { id: 'seed', icon: 'seed', title: 'Choose a seed', hand: 'A short pinch of your left hand: the next seed', keys: 'Press Q or E for another seed', test: count((s) => s.acts.next, 1) },
  { id: 'scatter', icon: 'scatter', title: 'Scatter', hand: 'Low over a Hand, sweep an open hand to the side', keys: 'Low over a Hand, press Z or C', test: count((s) => s.acts.scatter, 1) },
  { id: 'water', icon: 'river', title: 'Fetch water', hand: 'Skim low over a river', keys: 'Skim low over a river', test: (s) => (s.water > 0 ? 1 : 0) },
  { id: 'pour', icon: 'pour', title: 'Pour', hand: 'Over young groves, press a flat palm down', keys: 'Over young groves, press T', test: count((s) => s.acts.pour, 1) },
  { id: 'hyper', icon: 'hyper', title: 'Hyper sow', hand: 'Hold a left pinch for a second, then fly low', keys: 'Press F, then fly low over a Hand', test: count((s) => s.acts.hyper, 1) },
  { id: 'atlas', icon: 'atlas', title: 'The atlas', hand: 'Turn your left palm up', keys: 'Press M', test: (s) => (s.atlas ? 1 : 0) },
];
export function createTutorial({ done = false } = {}) {
  let i = done ? -1 : 0, st = {}, progress = 0;
  return {
    get active() { return i >= 0; },
    get index() { return i; },
    get step() { return i >= 0 ? STEPS[i] : null; },
    get progress() { return progress; },
    start() { i = 0; st = {}; progress = 0; },
    stop() { i = -1; },
    // 'next' when a step was just done, 'done' when the last one was, otherwise null
    update(sig, dt) {
      if (i < 0) return null;
      progress = Math.max(0, Math.min(1, STEPS[i].test(sig, st, dt)));
      if (progress < 1) return null;
      st = {}; progress = 0;
      if (++i < STEPS.length) return 'next';
      i = -1;
      return 'done';
    },
  };
}

// What is still missing before the step can be done where you are, or null when you are in place.
// at: { onHand (sand under you), onWater (a river under you), alt (metres over the ground), limit (how low sowing needs you) }
export function coach(id, at) {
  if (id === 'water') return !at.onWater ? 'Find a river: the blue lines across a Hand' : at.alt > 140 ? 'Lower: skim just over the water' : null;
  if (!['sow', 'scatter', 'pour', 'hyper'].includes(id)) return null;
  if (at.onWater) return 'This is a river: move over the sand beside it';
  if (!at.onHand) return 'Not over a Hand yet: follow NEAREST HAND on the compass';
  return at.alt > at.limit ? 'Too high: dive until you are close to the ground' : null;
}
