// src/atelier/flow.js
// The read-by-eye route (spec 7.4), one step at a time: the pattern on each fingertip, then the main
// palm lines (traced, or the guide's), then a palette and a name. It ends with the Hand's DNA. Pure.
import { synthPrint, rng, packPalm, packPrint, unpackPalm, unpackPrint } from '../hand/dna.js';
import { templatePalm } from '../hand/shape.js';
import { nameFor } from '../world/names.js';

export const PICKS = ['arch', 'tented', 'ulnar', 'whorl', 'pocket', 'double']; // the six inked patterns
export const FINGER_NAMES = ['thumb', 'index finger', 'middle finger', 'ring finger', 'little finger'];
export const LINE_STEPS = [['heart', true], ['head', true], ['life', true], ['fate', false]]; // [line, everyone has one]
const LIKELY = ['whorl', 'ulnar', 'ulnar', 'whorl', 'ulnar']; // "not sure": each finger's most common pattern

export function createFlow(seed) {
  const rand = rng(seed), guide = templatePalm({ seed, fate: true }), printSeeds = [];
  const f = { step: 'prints', finger: 0, line: 0, prints: [], lines: [], palette: 2, name: nameFor(seed) };
  let phone = null; // { palm, prints } when the phone read the hand (route A): its DNA is kept as it came
  const next = () => { if (++f.line >= LINE_STEPS.length) f.step = 'palette'; };
  const guideOf = (kind) => guide.lines.find((l) => l.kind === kind);
  return Object.assign(f, {
    pick(cls) {
      if (f.step !== 'prints' || !PICKS.includes(cls)) return;
      f.prints.push(cls);
      printSeeds.push(Math.floor(rand() * 2 ** 32));
      if (++f.finger === 5) f.step = 'lines';
    },
    notSure() { f.pick(LIKELY[f.finger]); },
    guide() { return f.step === 'lines' ? guideOf(LINE_STEPS[f.line][0]).pts : null; },
    traced(pts) {
      if (f.step !== 'lines' || !pts) return false;
      f.lines.push({ kind: LINE_STEPS[f.line][0], strength: 2, pts });
      next();
      return true;
    },
    useGuide() {
      if (f.step !== 'lines') return;
      const g = guideOf(LINE_STEPS[f.line][0]);
      f.lines.push({ kind: g.kind, strength: g.strength, pts: g.pts.map((p) => p.slice()) });
      next();
    },
    noLine() { if (f.step === 'lines' && !LINE_STEPS[f.line][1]) next(); },
    typicalLines() { while (f.step === 'lines') f.useGuide(); },
    choosePalette(i) { if (f.step === 'palette' && i >= 0 && i < 6) f.palette = i; },
    reroll() { f.name = nameFor(Math.floor(rand() * 2 ** 32)); },
    done() { if (f.step === 'palette') f.step = 'merge'; },
    // route A: the phone's reading, straight to palette and name (spec 7.1: one result, whichever the route)
    fromPhone({ palm, prints, name = null }) {
      const p = unpackPalm(palm);
      phone = { palm: p, prints };
      f.prints = prints.map((b) => unpackPrint(b).cls);
      f.lines = p.lines.map((l) => ({ kind: l.kind, strength: l.strength, pts: l.pts }));
      f.palette = p.palette;
      if (name) f.name = name;
      f.finger = 5; f.line = LINE_STEPS.length;
      f.step = 'palette';
    },
    dna() {
      if (phone) return { palm: packPalm({ ...phone.palm, palette: f.palette }), prints: phone.prints };
      return {
        palm: packPalm({ ...guide, lines: f.lines, palette: f.palette }), // the guide's creases and triradii: route C can't read them
        prints: f.prints.map((cls, i) => packPrint(synthPrint(i, cls, printSeeds[i]))),
      };
    },
  });
}
