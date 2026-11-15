# M4–M6: the full game (multiplayer you can see, the atlas loop, the phone, the look) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every milestone of the Handbit Atlas spec in the game by the deadline (2026-11-18 12:00 PST): live players you can see and meet, charting and seals, the palm atlas with naming, pins and history, the Community Hand, postcards, the phone companion (route A), and a visual pass.

**Architecture:** Pure modules for every rule (charting, braid, names, community slots, phone image analysis) with node tests; `src/main.js` only wires them. Server additions go into the existing World Durable Object (D1 tables from spec 8.4) and Room (names relay). All new UI is canvas-on-a-plane cards, like `panel.js` and `gesturecard.js`, so it works the same in the headset and on a screen. Built in the order judges meet it, so the game stays submittable after every task.

**Tech Stack:** three.js 0.186 + WebXR (CDN importmap, no build), Cloudflare Workers + Durable Objects + D1, MediaPipe Tasks Vision 1.0.1 (already used for webcam hands), Blender 4 CLI for baked props, node:test.

**Spec:** `docs/superpowers/specs/2026-10-04-handbit-atlas-design.md` (sections 6.4, 7.1–7.3, 8.4, 9, 10, 11.3), `docs/superpowers/specs/2026-10-07-m3-server-design.md`.

## Global Constraints

- Hands first: every action has a hand gesture, a gaze + pinch alternative and a mouse/keyboard alternative (spec 11.2).
- Essential UI inside a 30° cone (24° on the glasses profile); panels 0.6–0.8 m away; smallest text ≥ 1.2° (spec 11.2).
- Colours: Ink `#16100e`, Parchment `#f3e4d2`, River `#2f5d7c`–`#7fa7b8`, Seal `#b8442e`, Gilt `#c9a35a` (spec 11.1).
- Nothing derived from tracked hand joints is stored or sent (Meta policy, spec 7.4). Photos never leave the phone (spec 7.2 step 7, 8.5).
- Camera routes are 16+; under 16 uses read-by-eye only (spec 8.5).
- Everything degrades to "playing alone" when the server is away; no feature may throw offline.
- 60 fps budget: no new per-frame allocations in `frame()`, one draw call per new card.
- No build step; new runtime libraries only from cdn.jsdelivr.net or esm.sh, pinned versions.

## Review Focus

1. **Offline:** every new server call (stats, names, community, events, pair) must resolve to an empty/neutral answer within 4 s with no server; the game plays on. Each server-touching task adds a `fetchFn` that rejects and asserts the neutral result.
2. **Storage refused** (private mode): charting and pins live in memory when `localStorage` throws. Task 4 tests `createChart(null)`.
3. **A Hand washed while you chart or pin it:** charting state for an unknown Hand id is ignored, pins to it are dropped. Task 4 and Task 7 test it.
4. **Hostile names:** names from other players pass the blocklist, are trimmed to 24 chars, and control characters are stripped before they reach a canvas. Task 8 tests `cleanName('\u0007a'.repeat(40))`.
5. **Two donors race for the last Community slot:** the World serialises donations; exactly one wins, the other gets the next Community Hand's slot. Task 9 tests it against the server.

---

### Task 1: Live players you can see — counts, names, online state

**Files:**
- Modify: `server/src/room.js` (names), `server/src/world.js` (`/stats`, room counts), `server/src/worker.js` (route `/stats`)
- Modify: `src/net.js` (`stats()`, `openRoom({ name, onNames })`), `src/others.js` (names), `src/main.js`, `index.html` (counter line), `style.css`
- Create: `src/labels.js` (a name tag sprite: canvas texture, scales with distance, faces the camera)
- Test: `tests/net.test.mjs` (extend), `tests/others.test.mjs` (create)

**Interfaces:**
- Produces: `net.stats(): Promise<{ hands: number, flying: number } | null>`; Room text frames `{ name: string }` in, `{ names: { [id]: string } }` out (full map on join, deltas after); `others.names: Map<id, string>`; `createLabel(text): { sprite, set(text), update(camPos) }`.

- [ ] Test: `net.stats()` with a rejecting fetch resolves `null`; with `{hands:12,flying:3}` resolves that object.
- [ ] Test: `others.apply` keeps a name given by `others.setNames({3:'Firath'})` and drops it when id 3 leaves.
- [ ] Implement: Room keeps `name` in the socket attachment (cleaned by `cleanName` from Task 8's `src/world/names.js`; write `cleanName` here and Task 8 reuses it), broadcasts `{names}`; every 10 s a Room POSTs its live count to World `/rooms/count`; World `/stats` = laid Hands + counts fresher than 30 s.
- [ ] Front door: `#status` line shows "1,284 Hands · 213 flying now" when stats answer, nothing otherwise. In flight a name tag floats over each other player; a toast "Firath joined your sky" on first sight.
- [ ] Run `node --test tests/*.test.mjs`; `SERVER=1 node --test tests/server.test.mjs`; `node tests/m3.mjs` (both browsers report a name for the other).
- [ ] Commit.

### Task 2: The greeting — swarms braid when two players meet

**Files:**
- Create: `src/braid.js` (pure), Test: `tests/braid.test.mjs`
- Modify: `src/creature.js` (an optional `pull(target: Float32Array, k)` that bends strands toward a shared line), `src/main.js`

**Interfaces:**
- Produces: `createBraid({ radius = 220, hold = 3, cooldown = 30 }) → { update(dt, me: [x,y,z], others: Iterable<{id, pos}>) → { id, k } | null }` where `k` rises 0→1 over 0.5 s, holds `hold` s, falls; one braid at a time; the same id not again within `cooldown` s.

- [ ] Test: two positions 150 m apart → `k` reaches 1 within 0.6 s; 400 m apart → null; after a braid, the same id within 30 s → null.
- Hatching (spec 9): a new scribble starts on its print land and peels up out of the ground over 2 s before it knots.
- [ ] Implement; in `frame()` both creatures pull toward the midline of the two spines with weight `k * 0.6`; panel "You met Firath". Reduced motion (`?calm`) skips the pull, keeps the toast.
- [ ] Run tests; headless check with `?api=` and two pages flown together (extend `tests/m3.mjs`: teleport B next to A with `?at=`, expect A's `__pwc.state.braid` truthy).
- [ ] Commit.

### Task 3: Handbit lookup on the CPU (shared by charting, the place card, the atlas)

**Files:**
- Modify: `src/hand/worker.js` (also post `cells: Int8Array` = handbit index per cell, -1 outside/water), `src/main.js` (keep `cells` and `handbits` in `hands[i].data`)
- Create: `src/world/where.js` (pure), Test: `tests/where.test.mjs`

**Interfaces:**
- Produces: `whereAt(hands, x, z) → { hand, handbit: { code, name, kind }, index } | null` using `toHand` and the cell grid (`x0, y0, cell, w, h`).

- [ ] Test: for founder 0 baked in the test (call `labelHand(handShape(unpackPalm(f.palm)), 0.75)` directly), the world point of `toWorld(f.pose, hb.cx, hb.cy)` for the first palm handbit returns that handbit's code; a point 20 km away returns null.
- [ ] Implement; run tests; commit.

### Task 4: Charting and seals

**Files:**
- Create: `src/world/chart.js` (pure), Test: `tests/chart.test.mjs`
- Modify: `src/world/surface.js` (uncharted handbits drawn as parchment with ink outline; charted ones in colour; a 1.2 s ink-on reveal), `src/main.js`

**Interfaces:**
- Consumes: `whereAt` (Task 3).
- Produces: `createChart(storage) → { visit(handId, index, total) → 'new' | 'sealed' | null, has(handId, index), count(handId), sealed(handId), mask(handId) → number (bit i = handbit i), forget(handId) }`, stored under `pwc.chart.v1`; surface `setCharted(layer, mask, revealIndex?)`.
- Rule: you chart a handbit by flying over it lower than 400 m above the ground. A Hand is sealed when every handbit is charted. Your own Hand starts fully charted.

- [ ] Test: `visit` returns 'new' once, null after; the last handbit returns 'sealed'; `createChart(null)` works in memory; state survives a new `createChart(storage)` on the same fake storage; `forget` removes a Hand.
- [ ] Shader: `uniform int uCharted[MAX_HANDS]`; handbit index from `info.g` (bake writes `L + 1`); uncharted → mix toward Parchment `#f3e4d2` 70% plus 2 px ink outline at handbit borders; reveal = per-layer `uReveal[layer]` (index, time) wiping outward from the plane's centre.
- [ ] Toasts: "Charted: Index tip · Yanida (7 of 22)"; seal: a Seal-red stamp card "Yanida sealed" (scale 1.15 → 1 in 80 ms).
- [ ] Run tests; screenshot a charted and an uncharted Hand side by side; commit.

### Task 5: Flight HUD — compass ribbon, place card, altitude

**Files:**
- Create: `src/hud.js` (one canvas card, top of view, child of the camera), Test: `tests/hud.test.mjs` (pure part: `bearings(me, yaw, markers) → [{ label, x: -1..1, dist }]`)
- Modify: `src/main.js`

**Interfaces:**
- Consumes: `whereAt`, `chart`, pins (Task 7 fills them; empty until then).
- Produces: `createHud() → { mesh, update(dt, { yaw, pos, altitude, place, markers, idle }) }`. Markers: your Hand, the Source, pins, the nearest player. Off-screen markers clamp to the ribbon's ends as arrows. Altitude in spans (1 span = 6000 m). Fades after 4 s without input changes; never in the atelier.

- [ ] Test `bearings`: a marker due ahead → x≈0; due right → x=1 clamped; behind → clamped with `behind: true`.
- [ ] Implement; check on the glasses profile that the ribbon sits inside 24°; commit.

### Task 6: The palm atlas — World map, My Hand, Journal

**Files:**
- Create: `src/atlas/map.js` (pure drawing into any 2D context: Hands as ink outlines from `handShape`, palm lines as rivers, charted fill, names in letter-spaced small caps, players as dots, you as an arrow, legend, compass rose, scale bar in spans), `src/atlas/card.js` (the card: tabs World, My Hand, Community, Journal; hit regions like `atelier/panel.js`), Test: `tests/atlas.test.mjs`
- Modify: `src/gesture.js` (`palmUp(frame)` check), `src/main.js`, retire `src/atlas.js` (table-era, unused)

**Interfaces:**
- Produces: `drawMap(g, { hands, chart, me, others, view: { cx, cz, scale }, w, h })`; `createAtlas() → { mesh, isOpen, open(), close(), paint(state), down(uv), move(uv), up(), wheel(d) }` returning actions `{ type: 'tab'|'pin'|'fly'|'name'|'donate'|'postcard', ... }`.
- Opening: left palm up (palm normal y > 0.6, raised, held 0.4 s) opens the card above the left palm and it follows the palm; on a screen the **M** key. Your right fingertip or a gaze + pinch taps; drag pans; two-hand spread or the mouse wheel zooms. While open the glider holds (as in the atelier).

- Layers (spec 6.4): toggles on the World tab for rivers, owners, print classes, live players, charted; Watersheds (Task 10) adds one.
- [ ] Test `drawMap` with a recording fake context: one outline path per Hand, one label per Hand, no throw with zero Hands.
- [ ] Test the hit regions: a tap on the "Journal" tab returns `{ type: 'tab', tab: 'journal' }`.
- [ ] Implement; screenshot each tab; commit.

### Task 7: Pins, Fly here, and the inspector

**Files:**
- Create: `src/world/pins.js` (pure, `pwc.pins.v1`), `src/autopilot.js` (pure: steering toward a target point, reused by the film script), Tests: `tests/pins.test.mjs`, `tests/autopilot.test.mjs`
- Modify: `src/atlas/card.js` (inspector: Hand name, owner/founder, handbit name, class glyph, charted x/y, Pin, Fly here), `src/main.js`

**Interfaces:**
- Produces: `createPins(storage) → { list(), add({ handId, code, x, z, label }), remove(i), prune(handIds) }` (max 5); `steerTo(glide, target, groundAt) → { turn, climb }`.
- Addresses (spec 6.4): the inspector shows `Yanida › Heart River › I1 › 3.2 spans NE of the Source`; `?go=<handId>.<code>` opens the game flying there.
- Merge by hand (spec 11.3 step 7): palm down over a ghost holds your Hand, it follows your palm and snaps to the ghost; pushing the palm down 8 cm lays it. Look + pinch stays as the alternative.
- Fly here: the autopilot steers until you are within 400 m or you steer yourself (any hand engaged or key pressed hands control back).

- [ ] Test pins: max 5, prune drops pins of washed Hands. Test autopilot: from 5 km away the simulated glide (`createGlide`) arrives within 400 m in under 60 s; never ends below the ground.
- [ ] Implement; commit.

### Task 8: Naming — handbits by owners, summits by the first charter

**Files:**
- Modify: `server/schema.sql` (`place_name` from spec 8.4: `hand_id, feature, name, by_player, at`), `server/src/world.js` (`GET /names`, `POST /names`), `server/src/worker.js`, `src/net.js`, `src/world/names.js` (`cleanName`, `placeName(seed)`), `src/atlas/card.js` (name picker: a generated name, ↻ Another, Keep — no keyboard), `src/main.js`
- Test: `tests/names.test.mjs`, `tests/server.test.mjs` (extend)

**Interfaces:**
- Produces: `cleanName(s) → string | null` (strip controls, trim, ≤ 24 chars, blocklist from `world.js` moved here); features: handbit codes (`I1`, `P3` …) for the owner, `summit:<finger>` for anyone, first come; `net.names() → { [handId]: { [feature]: name } }`, `net.nameIt({ handId, feature, name }) → { ok } | { error }`.

- [ ] Test `cleanName('\u0007' + 'a'.repeat(40))` → 24 a's; blocked word → null.
- [ ] Server test: owner names `I1` → 200; a stranger naming `I1` → 403; two names for `summit:0` → the first wins, the second 409.
- [ ] Place card and atlas show names before generated ones; commit.

### Task 9: The Community Hand

**Files:**
- Modify: `server/schema.sql` (`community_slot`, `event`), `server/src/world.js` (`GET /community`, `POST /community`), `server/src/worker.js`, `src/net.js`
- Create: `src/world/community.js` (pure: 22 slots = `T1..L3` + `P1..P7`, `slotFor(code)`, `isSealed(slots)`), `src/community-art.js` (a gilt map drawing of the Community Hand on a 5 km plane over the Source lake, filled slots in the donor's tones, "14 of 22 · sealed 3"), Tests: `tests/community.test.mjs`, server test
- Modify: `src/atlas/card.js` (Community tab; Donate in the inspector of your own handbits), `src/main.js`

**Interfaces:**
- Produces: `POST /community { token, code }` → `{ no, slot }` or `{ error }`; one donation per player per Community Hand; when the 22nd slot fills: `event { kind: 'sealed', data: { no } }`, rooms hear `{ sealed: no }`, every client plays the seal stamp.

- [ ] Test: `slotFor('P9')` → null (only P1–P7); `isSealed` true at 22.
- [ ] Server test: 22 donors seal Community Hand 1 and the 23rd lands in Community Hand 2 slot; two donations from one token → 409.
- [ ] Commit.

### Task 10: History — the Journal and the timeline

**Files:**
- Modify: `server/src/world.js` (write `event` rows for lay, wash, name, seal; `GET /events?since=` last 100), `src/net.js`, `src/atlas/card.js` (Journal tab: the feed; World tab: a timeline slider that draws only Hands with `placed_at ≤ t`)
- Test: server test (a lay appears in `/events`), `tests/atlas.test.mjs` (timeline filter)

- Watersheds: at a lay the World records confluences (`confluence` table, spec 8.4) from the fit's joined river mouths; the atlas Watersheds layer colours each connected river system, and the Journal says "Your Heart River now reaches Cadio".
- [ ] Implement; offline the Journal says "The journal needs the shared map"; commit.

### Task 11: Postcards and your data

**Files:**
- Create: `src/postcard.js` (2D canvas 1600×1100: parchment, your Hand from `drawMap` at Hand scale, handbit names, compass rose, scale bar, a Seal stamp with the date, your Hand's name), Test: `tests/postcard.test.mjs` (fake context: draws the name and the stamp)
- Modify: `src/atlas/card.js` (My Hand: Postcard, Export my data), `index.html` (Export next to Forget my Hand), `src/main.js`

- [ ] Postcard downloads as `<name>-postcard.png` (desktop and Quest Browser both download). Export downloads `{ palm, prints, pose, name, charted, pins }` as JSON (GDPR access, spec 8.5). Wash also clears charting and pins. Commit.

### Task 12: Pairing relay

**Files:**
- Modify: `server/src/world.js` (in-memory `pairs: Map<code, { dna?, at }>`, 10 min TTL, no storage), `server/src/worker.js` (`POST /pair` → `{ code }`, `POST /pair/:code { palm, prints, name? }`, `GET /pair/:code` → 200 with DNA once, 204 while waiting, 404 expired), `src/net.js`
- Test: server test

**Interfaces:**
- Produces: `net.pair() → { code } | null`, `net.waitPair(code, { signal }) → Promise<{ palm: Uint8Array, prints: Uint8Array[] } | null>` (polls every 2 s), codes 6 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`.
- DNA posted to a pair code passes `checkHand`'s DNA checks before it is kept.

- [ ] Server test: create, post, get once (then 404); a bad DNA → 400; an unknown code → 404. Commit.

### Task 13: The phone companion (route A)

**Files:**
- Create: `phone.html`, `src/phone/main.js` (screens: consent and age, palm photo, confirm lines by touch, five fingertip close-ups, palette and send), `src/phone/palm-lines.js` (pure: grey image → line polylines → labelled lines in palm units, spec 7.3 steps 2–4 and 7), `src/phone/print-class.js` (pure: grey image → orientation field on 16 px blocks via the gradient structure tensor, Poincaré index cores/deltas, class, ridge count band, spec 7.2 steps 2–6), Tests: `tests/palm-lines.test.mjs`, `tests/print-class.test.mjs`
- Modify: `src/atelier/flow.js` (`fromPhone({ palm, prints })` jumps to the palette step with the phone's lines and prints), `src/atelier/panel.js` (first card offers "Use my phone" with the code and a QR code, or "Read by eye"), `src/main.js`

**Interfaces:**
- Consumes: Task 12; MediaPipe Hand Landmarker on the photo for the canonical frame (not Meta tracking data).
- Produces: `classifyPrint(gray: Float32Array, w, h) → { cls, cores, deltas, ridgeCount, orient: Uint8Array(64), quality }`; `readPalmLines(gray, w, h, landmarks) → [{ kind, strength, pts: [[x,y]×8] }]`.

- [ ] Test print-class: render each of the six classes with `PATTERNS` from `src/print/phase.js` at 256×256 (cos(2π·RIDGES·phase)), classify → the same class for arch, tented, loop, whorl, double at least; pocket may read as whorl (assert one of the two).
- [ ] Test palm-lines: a synthetic 512×512 palm image with three dark curves along `templatePalm().lines` heart/head/life → three lines labelled heart, head, life, each control point within 0.08 palm units of the template.
- [ ] The phone shows each detected line over the photo; a finger trace replaces it; each print shows its class with the six glyphs to correct it. Only DNA is posted. A QR on the card encodes `<pages url>/phone.html#<code>`; the QR encoder is `qrcode-generator@1.4.4` from esm.sh.
- [ ] Headless check: phone page with a sample synthetic palm image (generated in the test, never a real photo) pairs with a headset page in the emulator, which then shows the palette step. Commit.

### Task 14: The look — water, light, and Blender-made props

**Files:**
- Modify: `src/world/scene.js` (`WATER_GLSL`: flow ripples along the river direction, shoreline foam band from `info.b` COAST bit, depth tint), `src/world/surface.js` (sun-facing warmth, crest sheen, cavity darkening from the height texture's Laplacian, a soft fake shadow on slopes facing away from the sun)
- Create: `tools/blender/source.py` (Blender CLI script: the Source as an ink-and-gilt sundial-like monument and four lighthouse beacons for seals, low poly, vertex colours, exported to `assets/source.glb` < 300 KB), `src/world/props.js` (loads the glb with GLTFLoader, places it at the Source)
- Test: screenshot comparison sheet before/after at four fixed `?at=` views (scratchpad), fps in the emulator ≥ the before value − 5

- [ ] Run `blender -b -P tools/blender/source.py -- assets/source.glb`; check the file size.
- [ ] Commit.

### Task 15: Quest pass, film, docs, ship

**Files:**
- Modify: `src/main.js` (`?perf` overlay: fps, draw calls, patches; `renderer.xr.setFramebufferScaleFactor(0.9)` when fps < 72 for 3 s in a session), `tools/film.mjs` (new beats: charting a handbit, the atlas, meeting another player via a second page, the Community Hand), `README.md`, `docs/devpost.md`, `docs/screenshots/`

- [ ] Re-film; refresh screenshots and copy (story trimmed to ≤ 500 words); unit tests, server tests, `tests/m3.mjs`.
- [ ] Hand to Tim: `wrangler login` + deploy steps (README), then merge to main and push for Pages. Commit.
