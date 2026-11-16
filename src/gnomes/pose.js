// src/gnomes/pose.js
// How a gnome holds itself: every animation is a function of time that gives the joints' angles (radians).
// The gnome faces +Z, Y is up. Arms and legs hang down at rest: a negative x angle swings one forward, a z
// angle lifts an arm sideways (left arm: negative lifts it; right arm: positive). headX nods forward,
// headY turns. y is a bob in gnome heights, tilt leans the whole gnome forward, roll leans it sideways.
// Pure: the renderer turns a pose into matrices (render.js).
export const CLIPS = ['sit', 'sleep', 'potter', 'wave', 'shout', 'hang', 'cheer', 'ride', 'sulk', 'swim', 'jump', 'gaze', 'twist', 'disco', 'cancan', 'whirl', 'stomp', 'fall'];
// elbowL/R bend the forearm forward (negative, like an arm's x), kneeL/R bend the shin back (positive); spin turns the whole gnome
const rest = () => ({ y: 0, tilt: 0, roll: 0, spin: 0, headX: 0, headY: 0, armLx: 0, armLz: -0.12, armRx: 0, armRz: 0.12, elbowL: 0, elbowR: 0, legL: 0, legR: 0, kneeL: 0, kneeR: 0 });
export const DANCES = ['twist', 'disco', 'cancan', 'whirl', 'stomp'];
const BEAT = Math.PI * 2 * 2; // 120 beats a minute: every dance is cut to it
const s = Math.sin;

// m (for 'hang'): how the flight throws it about: { swing (rad to the side), lift 0..1 (streaming out behind), joy 0..1 }
export function pose(clip, t, seed = 0, m = null) {
  const p = rest(), ph = (seed % 97) * 0.37;
  switch (clip) {
    case 'sit': // on the cap, legs out, looking about
      p.legL = -1.45; p.legR = -1.35; p.y = -0.2 + 0.008 * s(t * 1.7 + ph); p.armLx = -0.35; p.armRx = -0.35; p.headY = 0.5 * s(t * 0.45 + ph); p.headX = 0.08 * s(t * 0.8 + ph);
      break;
    case 'sleep': // slumped, the head nodding down and jerking up
      p.legL = -1.45; p.legR = -1.4; p.y = -0.2; p.tilt = 0.18; p.headX = 0.55 + 0.12 * s(t * 0.9 + ph); p.armLx = -0.2; p.armRx = -0.2;
      break;
    case 'potter': // a busy little walk
      p.legL = 0.75 * s(t * 9 + ph); p.legR = -p.legL; p.armLx = -0.6 * s(t * 9 + ph); p.armRx = -p.armLx; p.y = 0.03 * Math.abs(s(t * 9 + ph)); p.roll = 0.06 * s(t * 9 + ph); p.headY = 0.2 * s(t * 1.3 + ph);
      break;
    case 'wave': // one arm high, waving; a little bounce on the toes
      p.armRz = 2.45 + 0.45 * s(t * 11); p.armLz = -0.3; p.y = 0.03 * Math.abs(s(t * 5.5)); p.headX = -0.25; p.roll = 0.05 * s(t * 5.5);
      break;
    case 'shout': // cross: both fists up and shaking, stamping
      p.armLz = -2.3 - 0.3 * s(t * 17); p.armRz = 2.3 + 0.3 * s(t * 17 + 1); p.y = 0.05 * Math.abs(s(t * 8)); p.tilt = 0.2; p.headX = -0.2; p.legL = 0.3 * Math.max(0, s(t * 8)); p.legR = 0.3 * Math.max(0, -s(t * 8));
      break;
    case 'hang': // holding on overhead, legs trailing and kicking
      { const swing = m?.swing ?? 0, lift = m?.lift ?? 0, joy = m?.joy ?? 0, rate = 4 + 9 * joy; // the body follows the flight; the legs kick, wildly when it is having fun
        p.armLz = -3.0; p.armRz = 3.0; p.armLx = 0.1 * joy * s(t * 11 + ph); p.armRx = -p.armLx; // both arms straight up, both hands on the strand, always
        p.legL = 0.55 + 0.6 * lift + (0.35 + 0.55 * joy) * s(t * rate + ph); p.legR = 0.55 + 0.6 * lift + (0.35 + 0.55 * joy) * s(t * rate + ph + 2);
        p.tilt = 0.25 + 0.75 * lift + 0.08 * joy * s(t * 6); p.roll = swing + 0.18 * s(t * 2.2 + ph); p.headX = -0.35 - 0.3 * lift; p.headY = 0.5 * swing + 0.25 * joy * s(t * 3.1); p.y = 0.04 * joy * s(t * 12); }
      break;
    case 'gaze': // standing, head thrown back to watch something pass overhead (m.up: how steeply, rad); one in three waves
      { const up = Math.min(1.15, Math.max(0, m?.up ?? 0.5));
        p.headX = -up; p.tilt = -0.18 * up; p.headY = 0.12 * s(t * 0.7 + ph); p.y = 0.012 * s(t * 1.6 + ph);
        if (seed % 3 === 0) { p.armRz = 2.5 + 0.35 * s(t * 7 + ph); p.elbowR = -0.5 - 0.4 * s(t * 7 + ph + 1); p.armLz = -0.3; p.roll = 0.06 * s(t * 3.5 + ph); p.y += 0.03 * Math.abs(s(t * 3.5 + ph)); } // a big wave from the shoulder, the forearm flapping, up on the toes
        else if (seed % 3 === 1) { p.armLz = -1.5; p.armLx = -0.9; p.elbowL = -2.0; p.armRz = 0.5; p.elbowR = -1.4; } // a hand shading the eyes, the other fist on the hip
        else { p.armLz = -2.6 + 0.3 * s(t * 2.2 + ph); p.armRz = 2.6 + 0.3 * s(t * 2.2 + ph); p.elbowL = -0.3; p.elbowR = -0.3; p.roll = 0.12 * s(t * 2.2 + ph); } } // both arms up, swaying like a crowd // (a wave, or a hand shading the eyes)
      break;
    case 'twist': { // the twist: hips one way, shoulders the other, sinking on bent knees and coming up again
      const b = t * BEAT, w = s(b / 2), down = 0.5 + 0.5 * s(b / 4);
      p.roll = 0.16 * w; p.spin = 0.45 * w; p.headY = -0.5 * w; p.headX = -0.15;
      p.kneeL = 0.5 + 0.55 * down + 0.2 * w; p.kneeR = 0.5 + 0.55 * down - 0.2 * w; p.legL = -0.3 - 0.3 * down; p.legR = -0.3 - 0.3 * down; p.y = -0.05 - 0.07 * down;
      p.armLx = -0.5 - 0.5 * w; p.armRx = -0.5 + 0.5 * w; p.armLz = -0.35; p.armRz = 0.35; p.elbowL = -1.5; p.elbowR = -1.5;
      break; }
    case 'disco': { // one arm points at the sky and then across at the ground, the other fist on the hip; a bounce on every beat
      const b = t * BEAT, hi = s(b / 4) > 0, k = Math.abs(s(b / 2));
      p.y = 0.07 * k; p.kneeL = 0.5 * (1 - k); p.kneeR = 0.5 * (1 - k); p.legL = -0.25 * (1 - k); p.legR = -0.25 * (1 - k);
      p.armRz = hi ? 2.5 : 0.5; p.armRx = hi ? 0 : -0.9; p.elbowR = hi ? -0.25 : -0.5; p.armLz = -0.75; p.elbowL = -1.9;
      p.roll = (hi ? -0.14 : 0.14) + 0.05 * s(b); p.headY = hi ? 0.4 : -0.4; p.headX = hi ? -0.35 : 0.15; p.spin = hi ? 0.25 : -0.25;
      break; }
    case 'cancan': { // high kicks, left and right in turn, skirts of the coat held out
      const b = t * BEAT, kick = s(b / 2), l = Math.max(0, kick), r = Math.max(0, -kick);
      p.legL = -1.7 * l; p.kneeL = 0.9 * l * (1 - l) * 2; p.legR = -1.7 * r; p.kneeR = 0.9 * r * (1 - r) * 2;
      p.y = 0.05 * Math.abs(s(b)); p.tilt = -0.12; p.roll = 0.1 * kick; p.headX = -0.2; p.headY = 0.25 * kick;
      p.armLz = -1.25; p.armRz = 1.25; p.elbowL = -0.9 - 0.3 * s(b); p.elbowR = -0.9 - 0.3 * s(b);
      break; }
    case 'whirl': { // arms flung wide, round and round on one foot, the other knee tucked up; then the other way
      const b = t * BEAT, turn = b / 4;
      p.spin = 2.2 * s(turn) * Math.PI; p.armLz = -1.5 - 0.2 * s(b); p.armRz = 1.5 + 0.2 * s(b); p.elbowL = -0.35; p.elbowR = -0.35;
      p.legR = -0.9; p.kneeR = 1.5; p.kneeL = 0.2 + 0.15 * s(b); p.y = 0.03 + 0.03 * s(b); p.tilt = 0.08; p.headX = -0.25; p.roll = 0.1 * Math.cos(turn);
      break; }
    case 'stomp': { // a slow heavy stomp: knee up high, down hard, fists pumping, the whole gnome rocking
      const b = t * BEAT / 2, l = Math.max(0, s(b)), r = Math.max(0, -s(b));
      p.legL = -1.2 * l; p.kneeL = 1.4 * l; p.legR = -1.2 * r; p.kneeR = 1.4 * r; p.roll = 0.22 * (r - l); p.y = 0.04 * Math.abs(Math.cos(b)); p.tilt = 0.12;
      p.armLx = -1.0 + 0.9 * r; p.armRx = -1.0 + 0.9 * l; p.elbowL = -1.7 + 0.8 * r; p.elbowR = -1.7 + 0.8 * l; p.armLz = -0.3; p.armRz = 0.3; p.headX = 0.1 - 0.35 * Math.abs(s(b)); p.headY = 0.3 * s(b);
      break; }
    case 'fall': { // dropped: arms windmilling over its head, legs bicycling, the whole gnome tumbling head over heels (m.tumble, rad)
      const w = t * 19;
      p.armLz = -2.3 + 0.7 * s(w); p.armRz = 2.3 + 0.7 * s(w + 1.7); p.armLx = 0.8 * s(w * 0.9); p.armRx = -0.8 * s(w * 0.9 + 1); p.elbowL = -0.6 - 0.5 * s(w + 2); p.elbowR = -0.6 - 0.5 * s(w + 3);
      p.legL = -0.9 + 0.8 * s(w * 0.8); p.legR = -0.9 - 0.8 * s(w * 0.8); p.kneeL = 0.9 + 0.6 * s(w * 0.8 + 1); p.kneeR = 0.9 - 0.6 * s(w * 0.8 + 1);
      p.tilt = m?.tumble ?? t * 3; p.roll = 0.3 * s(t * 5); p.headX = -0.5; p.headY = 0.5 * s(w * 0.5);
      break; }
    case 'cheer': // arms up, jumping
      p.armLz = -2.6 + 0.3 * s(t * 13); p.armRz = 2.6 - 0.3 * s(t * 13); p.y = 0.16 * Math.abs(s(t * 7)); p.legL = -0.5 * Math.max(0, s(t * 7)); p.legR = -0.5 * Math.max(0, s(t * 7)); p.headX = -0.3;
      break;
    case 'ride': // astride, holding on, bouncing with the beast
      p.legL = -0.95; p.legR = -0.95; p.armLx = -1.05; p.armRx = -1.05; p.y = -0.12 + 0.05 * Math.abs(s(t * 8 + ph)); p.tilt = 0.14 + 0.06 * s(t * 8 + ph); p.headX = -0.1;
      break;
    case 'sulk': // arms down, head down, shaking it slowly
      p.headX = 0.6; p.headY = 0.35 * s(t * 1.6); p.tilt = 0.12; p.armLz = -0.05; p.armRz = 0.05;
      break;
    case 'swim': // flat in the water, paddling
      p.tilt = 1.25; p.armLx = -1.6 + 1.2 * s(t * 6); p.armRx = -1.6 - 1.2 * s(t * 6); p.legL = 0.5 * s(t * 9); p.legR = -0.5 * s(t * 9); p.headX = -0.9; p.y = -0.35 + 0.03 * s(t * 3);
      break;
    case 'jump': { // the leap onto a whorl: t runs 0..1 over the jump
      const k = Math.max(0, Math.min(1, t));
      p.armLz = -2.8 * k; p.armRz = 2.8 * k; p.legL = -0.6 * (1 - k); p.legR = -0.6 * (1 - k); p.headX = -0.4;
      break;
    }
    default: // standing about
      p.y = 0.01 * s(t * 1.8 + ph); p.headY = 0.3 * s(t * 0.6 + ph);
  }
  return p;
}
