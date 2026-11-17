// src/atelier/table.js
// Your real room, read: in passthrough the headset finds the surfaces around you (WebXR plane detection; on
// Quest, the planes of your room setup, labelled table, floor, wall...). The palm you read is laid on your
// table when one is within a seated arm's reach, else on your floor, sized to the surface, and held there by
// an anchor. A persistent anchor brings it back to the same spot on your desk next time.

const REACH = 1.1; // metres from your head, across: a table you can touch without getting up

// planes: [{ horizontal, label, x, y, z (centre, in the rig's space), w, d (its extent) }], head: { x, y, z }
// -> the surface to lay the palm on, with r (the palm's radius on it), or null
export function pickSurface(planes, head) {
  const flat = planes.filter((p) => p.horizontal);
  const across = (p) => Math.hypot(p.x - head.x, p.z - head.z);
  const tableish = (p) => p.label === 'table' || p.label === 'desk' || ((!p.label || p.label === 'other') && p.y > head.y - 1.0 && p.y < head.y - 0.25);
  const table = flat.filter((p) => tableish(p) && across(p) < REACH + Math.max(p.w, p.d) / 2).sort((a, b) => across(a) - across(b))[0];
  if (table) return { ...table, r: Math.min(0.35, Math.min(table.w, table.d) / 2 - 0.02) };
  const floor = flat.filter((p) => p.label === 'floor' || p.y < head.y - 1.0).sort((a, b) => a.y - b.y)[0];
  return floor ? { ...floor, r: Math.min(2.2, Math.max(0.8, Math.min(floor.w, floor.d) / 2)) } : null;
}

const KEY = 'pwc.desk.v1'; // the persistent anchor's id: your palm's spot in your room

// The live part: every frame in passthrough, given the XR frame and reference space, returns the surface the
// palm sits on ({ x, y, z, r, label }) or null. Settles after a second and anchors there; never throws.
export function createTable(storage) {
  let chosen = null, anchor = null, asked = false, since = 0, restoring = false;
  const planesOf = (frame, ref) => {
    const out = [];
    for (const p of frame.detectedPlanes ?? []) {
      const pose = frame.getPose(p.planeSpace, ref);
      if (!pose) continue;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const q of p.polygon) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z); }
      const t = pose.transform.position;
      out.push({ horizontal: p.orientation === 'horizontal', label: p.semanticLabel, x: t.x, y: t.y, z: t.z, w: x1 - x0, d: z1 - z0 });
    }
    return out;
  };
  return {
    reset() { chosen = null; anchor = null; asked = false; since = 0; },
    update(frame, ref, head, dt) {
      try {
        if (!frame || !ref) return chosen;
        const session = frame.session;
        // back from last time: the palm where you left it
        if (!anchor && !restoring && session.restorePersistentAnchor && storage?.getItem(KEY)) {
          restoring = true;
          session.restorePersistentAnchor(storage.getItem(KEY)).then((a) => { anchor = a; }).catch(() => { try { storage.removeItem(KEY); } catch {} });
        }
        if (anchor) {
          const pose = frame.getPose(anchor.anchorSpace, ref);
          if (pose) { const t = pose.transform.position; chosen = { ...(chosen ?? { r: 0.3, label: 'table' }), x: t.x, y: t.y, z: t.z }; }
          if (chosen?.w) return chosen;
        }
        const s = pickSurface(planesOf(frame, ref), head);
        if (s) { chosen = anchor ? { ...s, x: chosen.x, y: chosen.y, z: chosen.z } : s; since += dt; }
        // settled for a second: pin it there
        if (s && !anchor && !asked && since > 1 && frame.createAnchor) {
          asked = true;
          const at = new XRRigidTransform({ x: s.x, y: s.y, z: s.z });
          frame.createAnchor(at, ref).then(async (a) => {
            anchor = a;
            if (a.requestPersistentHandle && s.label !== 'floor') { const id = await a.requestPersistentHandle().catch(() => null); if (id) try { storage?.setItem(KEY, id); } catch {} }
          }).catch(() => {});
        }
      } catch { /* a headset without plane detection: the palm stays where it always was */ }
      return chosen;
    },
  };
}
