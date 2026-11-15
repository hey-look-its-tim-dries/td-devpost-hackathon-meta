// src/others.js
// Other players in your room, each an ink creature like yours but lighter (5 strands), moved by the
// room's snapshots through a One Euro filter so 4 Hz looks like flight. Nearest `max` only. Pure.
import { createCreature } from './creature.js';
import { OneEuro } from './gesture.js';

export function createOthers({ max = 60 } = {}) {
  const live = new Map(); // id -> { creature, filter, pos, target, pitch, speed, missed }
  const names = new Map(); // id -> name, as the room said
  const far = (from) => (p) => Math.hypot(p.pose.x - from[0], p.pose.z - from[2]);
  return {
    get count() { return live.size; },
    // a snapshot: creatures for the nearest players but me; one missing from two snapshots in a row is freed
    apply(snapshot, me, from = [0, 0, 0]) {
      const d = far(from), seen = new Set();
      for (const { id, pose } of snapshot.filter((p) => p.id !== me).sort((a, b) => d(a) - d(b)).slice(0, max)) {
        seen.add(id);
        let e = live.get(id);
        if (!e) live.set(id, (e = { creature: createCreature({ strands: 5, points: 40, spacing: 2, radius: 13 }), filter: new OneEuro({ minCutoff: 1.0, beta: 0.3 }), pos: [pose.x, pose.y, pose.z], speed: 70 }));
        e.target = [pose.x, pose.y, pose.z];
        e.pitch = pose.pitch;
        e.missed = 0;
      }
      for (const [id, e] of live) if (!seen.has(id) && ++e.missed >= 2) { live.delete(id); names.delete(id); }
    },
    update(dt) {
      for (const e of live.values()) {
        const p = e.filter.filter(e.target, dt), moved = Math.hypot(p[0] - e.pos[0], p[1] - e.pos[1], p[2] - e.pos[2]);
        if (dt > 0) e.speed += (moved / dt - e.speed) * 0.2;
        e.pos = p;
        e.creature.update(dt, e.pos, { speed: e.speed, pitch: e.pitch, turn: 0 });
      }
    },
    each(fn) { for (const [id, e] of live) fn(e.creature, id, e.pos); },
    setNames(map) { for (const [id, n] of Object.entries(map)) names.set(+id, n); },
    nameOf(id) { return names.get(+id) ?? null; },
  };
}
