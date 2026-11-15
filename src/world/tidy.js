// src/world/tidy.js
// Hands that left the world take your charting and pins with them (spec 8.5; review finding 1). Pure.
export function forgetGone(liveIds, chart, pins) {
  const live = new Set(liveIds);
  for (const id of chart.ids()) if (!live.has(id)) chart.forget(id);
  pins.prune(live);
}
