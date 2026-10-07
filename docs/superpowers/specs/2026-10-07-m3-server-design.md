# M3: the server. Other people's Hands join yours

Date: 2026-10-07. Parent spec: `2026-10-04-handbit-atlas-design.md` (sections 6.2, 6.3, 8.4, 10, 11.3). Builds on M2 (the atelier, the fit finder, the laid Hand).

**Goal.** Two browsers see each other's Hands and swarms. A Hand laid in one browser rises in every other one; players flying the same region see each other as ink creatures.

**Cut.** Hands registry, placement with a server-side overlap check, live rooms. The phone pairing relay waits for M4 (the phone page that needs it). Confluences, charting, naming and the Community Hand wait for M5.

## 1. Shape

- `server/`: one Cloudflare Worker (`server/src/worker.js`), a `World` Durable Object (placements), a `Room` Durable Object class (presence), one D1 database (EU jurisdiction), `wrangler.toml`, `schema.sql`, `seed.mjs`. Plain JavaScript, ES modules. `wrangler` is the only dev dependency, in `server/package.json`. The game itself keeps no build step and no dependencies.
- The server imports the game's pure modules by relative path (`../../src/world/fit.js`, `../../src/hand/shape.js`, `../../src/hand/dna.js`, `../../src/world/founders.js`), so the overlap check on the server is the client's check. Those modules never import three.js; that stays a rule.
- The game stays static on GitHub Pages and talks to the Worker at `API` in `src/net.js` (`https://<name>.workers.dev`), overridable with `?api=http://localhost:8787` for `wrangler dev`.
- Deploying and `wrangler login` are Tim's steps. Everything else runs and is tested locally.

## 2. Data (D1)

Tables `player` and `hand` from the parent spec 8.4, nothing else yet.

- `player.id`: random UUID. `player.token_hash`: SHA-256 of a random 32-byte device token the client makes once and keeps in `localStorage` under `pwc.token.v1`. `age_band` is `'16+'` for now (route C only; the consent card is M4's). `region` is not stored. `name` is the Hand name (one Hand per player in M3).
- `hand`: `palm_dna`, `prints` (5 x 44 bytes, concatenated), `route = 'eye'`, `gen = 1`, `x z rot`, `placed_at`, `founder`.
- Founders are rows with `founder = 1`, written by `seed.mjs` from `founders()`, so the world has one source of truth. The bundled `founders()` stays in the client as the offline fallback and must produce the same DNA (`gen` pins it).
- Never stored: IPs, regions, hand-tracking data, images, map geometry. Clients rebuild geometry from DNA.

## 3. HTTP

All responses JSON, CORS open for GET, the Pages origin and localhost for POST/DELETE.

- `GET /world` -> `{ gen, hands: [{ id, name, palette, side, palm, prints: [5], pose: { x, z, rot, mirror }, founder, placed_at }] }`. DNA as base64url, the form `mine.js` already stores. `ETag` is the latest `placed_at`; the Worker caches the body for 10 s. One response for the whole world (10,000 Hands is about 3 MB; chunking is not needed for the competition).
- `POST /hands` `{ token, name, palm, prints, pose }` -> the World DO:
  1. validates with the same rules as `loadHand` (lengths, DNA versions, known class and line kind indices, name 1 to 40 characters after trimming, pose finite and within 100 km of the Source, `mirror` false in M3), else 400;
  2. one Hand per token: a second lay with the same token answers 409 with the existing Hand (the client treats that as success, so a lost response or an offline retry cannot lay twice);
  3. loads every laid Hand, runs the overlap test of `fit.js` on the proposed pose alone (at most one sample within one 60 m cell of land, the Source stays water);
  4. if it fits: inserts player (if new) and hand, broadcasts `laid` to every Room, returns `{ id, pose }`;
  5. if it no longer fits (someone laid there moments ago): returns `{ conflict: true, fits: [up to 3] }` from `findFits` against the current world, the parent spec's "fresh fit with no penalty".
- `DELETE /hands/:id` `{ token }`: deletes the row (cascade from player) and broadcasts `{ left: id }`. This is "Wash your hands" for what exists in M3; the parchment-outline version waits for the palm atlas.
- Limits, kept in the World DO's memory: one `POST /hands` per token ever (see 2), and at most one `POST` per IP per minute. Bodies over 8 KB are refused before parsing.

## 4. Live rooms

- `GET /room` upgrades to a WebSocket. The Worker picks the room name from `CF-IPCountry` mapped to a continent (`eu`, `na`, `sa`, `as`, `af`, `oc`, else `eu`) and a shard number; a Room past 200 sockets replies `{ full: '<region>-<n+1>' }` and closes, the client reconnects there. Hibernatable WebSockets, so idle rooms cost nothing. Nothing in a room is stored.
- Client -> room every 200 ms, binary: `float32 x, y, z, yaw, pitch` + `uint8 mode` (21 bytes). The room ignores anything else and drops a socket that sends over 20 messages per second.
- Room -> every socket every 250 ms, one binary snapshot: `uint16 count`, then per player `uint16 id` + the same 21 bytes. Ids are per-room session numbers, not player ids. Players who sent nothing for 5 s are dropped from the snapshot; a closed socket is removed.
- JSON text frames on the same socket: `{ hello: id, you: id }` on join, `{ laid: hand }` (the `GET /world` row shape) relayed from the World DO, `{ left: handId }`. A client that joins mid-flight first does `GET /world`, then opens the room, then applies any `laid` it receives, so nothing is missed.
- The World DO reaches the Rooms through a tiny registry: every Room registers its name with the World DO on first connect; `laid` is sent to each registered Room with `fetch`; a Room that fails twice is forgotten.

## 5. Client

- `src/net/wire.js` (pure, tested): encode and decode the pose message and the snapshot. `src/net.js`: `fetchWorld()`, `layHand()`, `forgetHand()`, `openRoom({ onSnapshot, onLaid, onLeft })` with reconnect and backoff (1 s doubling to 30 s), `sendPose()` throttled to 5 Hz. The device token is created and kept here.
- `src/main.js`:
  - at start, `fetchWorld()` is the list of Hands to bake; on failure the bundled `founders()` plus the local Hand (the "Playing alone" line in the panel).
  - `hands` becomes keyed by Hand id; layers are allocated from a free list; `MINE` is whatever layer your Hand got. `MAX_HANDS` in `surface.js` goes from 16 to 64 (enough for the competition; the Quest LOD budget is M6's).
  - `merge()` still proposes three fits locally; `choose()` sends `POST /hands` and only on `{ id, pose }` saves and starts the rise (the saved record gains `id`). On `conflict` the ghosts show the fresh fits with "Someone just laid a Hand there: three new places". Offline: the Hand is laid locally and marked `pending`; the next start retries `POST /hands` before baking.
  - a `laid` event bakes that Hand into a free layer with `rise` 0 and rises it over 8 s, like your own, and hatches its scribbles.
  - other players: one lighter `createCreature({ strands: 5, points: 40 })` per visible player, capped at the 60 nearest, fed from the snapshot with a `OneEuro` filter per player, drawn with the same ink. Their name is not shown in M3 (rooms carry no names).
  - the gesture card and the atelier are untouched.
- `index.html`'s small print gains "and its place on the shared map".

## 6. Failure

- Worker unreachable: founders + local Hand, no room, a quiet "Playing alone" line, nothing else changes. Laying still works locally and is retried on the next start.
- A Room socket drops: reconnect with backoff; poses are just lost.
- `laid` for a Hand that fails to bake (worker error): logged, the layer is freed.
- Tampered bodies: 400 from validation; the client treats any non-2xx on lay as "try again later" and keeps the local Hand pending.
- No secrets, no accounts, no email. Abuse of names: length cap plus a short blocklist in the DO; it is a Hand name, shown only on badges.

## 7. Tests

- Pure (`node --test`): wire round trip (pose, snapshot, 200 players); placement check against the First Ten (an overlapping pose refused, a frontier pose from `findFits` accepted, a Source pose refused); validation (each `loadHand` tamper case gets 400); token hashing is stable.
- Server (`tests/server.test.mjs`, needs `wrangler dev` with local D1 and DOs): seed -> `GET /world` has 10 founders -> lay -> 11 -> lay the same pose again -> `conflict` with 3 fits -> `DELETE` -> 10. Two WebSocket clients: each sees the other's pose in a snapshot within 1 s; a `laid` reaches both.
- Browser: the existing headless `?play` flow with `?api=http://localhost:8787`. Done when two headless browsers each see 11 Hands after one lays, and each sees the other's creature (`__pwc.state.others === 1`).

## 8. Not in M3

Phone pairing relay (M4). Confluence carving and announcements, charting, naming, Community Hand, postcards (M5). Chunked world loading, floating origin, far-mesh simplification, Quest LOD budget (M6). Names of other players in rooms. Both hands per player.
