// src/gnomes/pose.js
// How a gnome holds itself: every animation is a function of time that gives the joints' angles (radians).
// The gnome faces +Z, Y is up. Arms and legs hang down at rest: a negative x angle swings one forward, a z
// angle lifts an arm sideways (left arm: negative lifts it; right arm: positive). headX nods forward,
// headY turns. y is a bob in gnome heights, tilt leans the whole gnome forward, roll leans it sideways.
// Pure: the renderer turns a pose into matrices (render.js).
export const CLIPS = ['sit', 'sleep', 'potter', 'wave', 'shout', 'hang', 'cheer', 'ride', 'sulk', 'swim', 'jump'];
const rest = () => ({ y: 0, tilt: 0, roll: 0, headX: 0, headY: 0, armLx: 0, armLz: -0.12, armRx: 0, armRz: 0.12, legL: 0, legR: 0 });
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
