// src/world/cdlod.js
// Continuous level of detail (after Strugar's CDLOD): a quadtree of square patches round you. Near
// patches are small (fine grids), far ones large. Each level reaches out to a range, and vertices
// slide onto the next level's grid as they near that range, so levels meet without cracks or
// popping. The tree is re-centred under you in steps of half its size, so the ground never ends.
// Pure.

export function selectNodes(cam, { leaf = 48, levels = 12, k = 2.3, minY = -120, maxY = 750 } = {}) {
  const ranges = Array.from({ length: levels }, (_, l) => leaf * 2 ** l * k);
  const morphStart = ranges.map((r, l) => r - 0.35 * (r - (l ? ranges[l - 1] : 0)));
  const root = leaf * 2 ** (levels - 1), half = root / 2;
  const ox = Math.round(cam[0] / half) * half - half, oz = Math.round(cam[2] / half) * half - half;
  const dy = Math.max(minY - cam[1], 0, cam[1] - maxY);
  const dist2 = (x, z, size) => {
    const dx = Math.max(x - cam[0], 0, cam[0] - (x + size)), dz = Math.max(z - cam[2], 0, cam[2] - (z + size));
    return dx * dx + dy * dy + dz * dz;
  };
  const nodes = [];
  // true when this patch (at this level or finer) is drawn; false leaves it to the parent
  function visit(x, z, size, level) {
    if (dist2(x, z, size) > ranges[level] ** 2) return false;
    if (level === 0 || dist2(x, z, size) > ranges[level - 1] ** 2) {
      nodes.push({ x, z, size, level, part: false });
      return true;
    }
    const h = size / 2;
    for (const [cx, cz] of [[x, z], [x + h, z], [x, z + h], [x + h, z + h]]) {
      if (!visit(cx, cz, h, level - 1)) nodes.push({ x: cx, z: cz, size: h, level, part: true });
    }
    return true;
  }
  if (!visit(ox, oz, root, levels - 1)) nodes.push({ x: ox, z: oz, size: root, level: levels - 1, part: false });
  return { nodes, ranges, morphStart, root };
}
