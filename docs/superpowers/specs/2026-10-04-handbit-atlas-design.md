# Palm Whorl Cities: the Handbit Atlas

Design spec, 2026-10-04. Replaces the table design. Status: draft for Tim's review.

## 1. The idea in one paragraph

Every player's hand becomes a piece of one shared world map. A hand is cut into **handbits**: three
per finger (15), plus the palm regions that its own lines enclose (usually 4 to 7). The lines
themselves are water: the heart, head and life lines become rivers in deep valleys, the finger creases
become canals, and the ridges of the fingerprints become terraced hills with footpaths. The world
starts as ten founding palms. Every new player scans their hand and lays it at the edge of the world,
where the game finds the spot where their rivers join the rivers already there. Black-ink scribbles,
hatched from the fingerprints, fly over it all, and the players who are online right now fly with
them.

## 2. Pillars

1. **Your hand is a piece of the map.** You can read your own hand in it: your lines, your prints.
   It shows who made it without showing who you are.
2. **The world only grows when people join.** No procedural filler. Ten founders, then only players.
3. **Lines are water.** Every crease is a waterway you can follow, so the geography is readable at a
   glance and every hand connects to the next.
4. **Hands first.** You scan your hand, you lay it into the world, and you open the atlas on it.
   You steer with it too.
5. **Private by construction.** Photos never leave the phone. The game keeps a coarse, shuffled
   "DNA" that is enough to build a map and too coarse to identify anyone.

## 3. Words we use (in the game and in the code)

| Term | Meaning |
|---|---|
| **Hand** | One player's map piece, built from one palm and its five prints. A player can add a second Hand later (the other side). |
| **Handbit** | One territory of a Hand. Finger handbits: `T1 T2 T3`, `I1 I2 I3`, `M1 M2 M3`, `R1 R2 R3`, `L1 L2 L3` (thumb, index, middle, ring, little; 1 = tip). Palm handbits: `P1..Pn`, numbered from the wrist up. |
| **Print land** | The tip handbits (`x1`): terraced hills grown from that finger's print. |
| **River** | A major palm line: Heart, Head, Life, Fate, plus Sun and Mercury when present. |
| **Canal** | A finger flexion crease. It cuts across the finger from coast to coast. |
| **Furrow** | The valley between two print ridges: a footpath, wide enough to walk at human scale. |
| **Seam** | A border between handbits. Inside a Hand the seams *are* the waterways. Between Hands they are stitched, like the patchwork in Tim's concept image. |
| **Paper Sea** | The flat parchment between Hands. |
| **The Source** | The lake at the world centre that the First Ten drain into. |
| **Confluence** | Your river joining another player's river across a seam. |
| **Watershed** | Every river connected to one river, across all the Hands it runs through. |
| **Scribble** | A creature: one long black ink line hatched from a print ridge (section 9). |
| **Swarm** | One player's scribbles flying together. Online players are swarms. |
| **Community Hand** | A Hand at the world centre whose 22 slots are filled with handbits donated by players. |
| **Span** | Map unit: one hand length (wrist to middle fingertip). In the world, 1 span = 600 m. |

## 4. Anatomy: how a hand becomes handbits

The diagram Tim drew (green lines) is the rule set.

```
               M1
          I1   ──   R1             Finger handbits (15)
          ──   M2   ──   L1          x1 = tip, carries the print
          I2   ──   R2   ──          canals (finger creases) split x1 | x2 | x3
          ──   M3   ──   L2          the base crease splits x3 from the palm
          I3        R3   ──
                         L3        Thumb: T1 tip | IP crease | T2 | MCP crease | T3 root
    T1    ─────────────────
    ──       P5  Crown              above the heart line
    T2   ~~~~~~~~~~~~~~~~~~~~~~~   Heart River (rises at the little-finger edge)
    ──  T3   P4  Heartland
     ~~~~~~~~~~~~~~~~~~~~~~~~      Head River (rises between thumb and index)
       (        P3  Plain    :
   P1   (  Life     Fate     :     P2  Luna
  Venus  (  River   River    :
  _______(___________________:____ wrist coast: rivers reach the Paper Sea here
```

- **Finger handbits** come from the finger creases. If a crease is faint or missing, the generator
  uses standard proportions (tip 0.24, middle 0.31, base 0.45 of the finger, thumb 0.45 / 0.55).
- **Palm handbits** come from the lines, the way a coastline and rivers carve up real land: the
  palm outline minus the lines, split into connected regions. A line that ends within 4% of another
  line or of the outline is extended to meet it. Regions under 3% of the palm area merge into their
  largest neighbour. So the number of palm handbits really depends on the hand:
  - a typical hand gives 5: Venus (thenar, inside the life line), Plain (centre), Luna (hypothenar),
    Crown (above the heart line), and the Heartland band between the heart and head lines;
  - a strong fate line splits the Plain, giving 6;
  - a single transverse palmar crease (the heart and head lines fused) gives 4;
  - long Sun or Mercury lines add one each, up to 8.
- Each palm handbit is named by the palmistry "mount" its centre sits on (Venus, Luna, Mars plain,
  Jupiter, Saturn, Apollo, Mercury), so the names are useful to players and not just lore.

## 5. Lines are water: the geography of one Hand

Elevation, from big to small:

1. **Island base.** The hand outline is an island in the Paper Sea: high inland, a soft beach along
   the outline. Fingers are long peninsulas with a ridge along each finger.
2. **Mounts.** Gaussian hills under each finger (Jupiter, Saturn, Apollo, Mercury), a big highland at
   Venus and a long rise at Luna. Their size is set by the seed, never by hand measurements.
3. **Rivers.** Every line is carved as a valley. Depth and width follow the line's strength from the
   scan (four bands), and rivers get wider downstream. They flow out to the nearest coast: the heart
   river drains to the little-finger edge, the life and fate rivers drain to the wrist coast, and the
   head river drains wherever it ends. Water surfaces are real geometry with flowing normals,
   reflections of the sky, wet darker banks and a delta where each river meets the sea.
4. **Canals.** Finger creases cross each finger from beach to beach. They are narrow straits that cut
   the peninsula into its three handbits, with a stitched bridge over each.
5. **Print lands.** Each tip grows its print with the existing engine (`src/print/land.js`). It is
   now driven by the Print DNA (section 7.2), not only by a class and a seed. Ridges become terrace
   walls and furrows become footpaths. Height is the ridge count to the core, so a whorl is a
   spiral mountain, a loop is a horseshoe valley and an arch is a rolling range.
6. **Dermal ridges everywhere.** The whole hand has friction ridges, as on a real palm: they run across
   the finger segments, and on the palm they flow around the triradii (the small deltas under the
   fingers). They are generated with the same zero-pole model as the prints, using the palm's
   triradii as deltas. This is the "super macro HD skin" layer: at low altitude you fly over a sea
   of fine parallel ridges with pores along the crests.
7. **Skin.** The colour comes from a palette the player picks. The game never reads skin colour from a
   photo: skin colour is personal data and can point to ethnicity.

Scale: 1 span = 600 m, a print land is about 80 m across with 22 ridges, so a furrow is about 3.5 m
wide and a ridge about 1 m high. You can walk the furrows at human height, glide over a palm at 100 m,
or see thirty Hands at once from 2 km up.

## 6. Building the world map: merging

### 6.1 The First Ten

The world opens with ten founding palms in a ring, wrists towards the centre, fingers pointing out
like the petals of a flower. Each one sits with its little-finger edge against the thumb edge of the
next, so their heart and head rivers continue into each other. That makes one ring river, which
drains through ten life rivers into **the Source**, a lake in the middle. The founders come from
synthetic DNA (or from team members who consent). They are labelled as founders, so no one mistakes
them for players.

### 6.2 Laying a new Hand: the fit finder

When a player's Hand is ready, the game proposes where it fits. The fit finder runs in a worker on a
rasterised copy of the frontier (4 m cells):

- Candidates: points along the frontier every 20 m, rotations every 7.5 degrees, the mirror fixed
  by which hand it is. About 20,000 poses, scored in under 200 ms.
- Score (higher is better):
  - **Overlap** is not allowed. More than 0.5% of the new Hand over existing land rules the pose out.
  - **Rivers joined:** for each river mouth of the new Hand, find an open mouth of the world within
    40 m that points the opposite way (within 35 degrees). +40 each. This is the main reward.
  - **Snug fit:** the share of the new coastline that lies within 30 m of existing coast. Interlocked
    fingers score high.
  - **Compactness:** the world stays roughly round, with a small penalty for distance from the
    Source.
  - **Fairness:** a small penalty for touching more than four Hands, so no area gets crowded.
- The three best poses are shown as glowing ghost outlines, each with badges: "2 rivers join",
  "fits 91%", "next to Yanida".

Two placement patterns come out of these rules naturally, and players will learn to aim for them:

- **Chain:** side by side, little-finger edge against the thumb edge, so the rivers continue. This is
  how long rivers form.
- **Clasp:** fingers slotted between another Hand's fingers. This makes snug coastlines and turns the
  canals into straits that line up.

### 6.3 Committing

1. The player picks a ghost, or grabs their Hand and adjusts it. The Hand snaps to the nearest valid
   pose and the badges update live.
2. Pushing down commits the Hand. The **World** Durable Object (section 10) re-checks for overlap,
   because two players might lay Hands at the same moment. If there is a conflict, the later player
   gets a fresh fit with no penalty and a friendly message.
3. Stitching: the seams sew themselves shut. River mouths that met are joined with a carved channel,
   and every confluence is announced: "Heart River now flows into Yanida's Head River. 7.4 km of
   river."
4. The Hand rises out of the Paper Sea over about 8 s, the print lands grow ridge by ridge, and its
   five scribbles hatch.

### 6.4 Everything that comes with map building

| System | What the player does | Why it matters |
|---|---|---|
| **Charting** | Every handbit starts as a blank parchment outline in your atlas and is inked in when you fly over it. Chart all of a Hand's handbits to earn its seal. | Reveal is the oldest pleasure in maps (Zelda towers, Hollow Knight's mapmaker). |
| **Naming** | Owners name their Hand, handbits and rivers. The first player to chart a summit (a print core) or a pass (a delta) can name it. Names pass a word filter and can be reported. Until named, places get a generated name from the DNA seed ("Yanida", "Cadio"). | Authorship is what makes a shared map feel lived in. |
| **Addresses** | Every place has an address: `Yanida › Heart River › I1 › 3.2 spans NE of the Source`. Links open the map at that spot. | Players can tell each other where to meet. |
| **Layers** | Rivers, owners, print classes, live players, events, charted or uncharted. | The same map answers different questions. |
| **Legend, compass, scale bar** | Always on in the atlas, hidden while flying. The scale bar is in spans. | It reads as a real map, not a screenshot. |
| **Zoom continuum** | World → Hand → handbit → furrow, without loading screens. | You see that the world really is made of hands. |
| **Pins and routes** | Pin a place and the swarm flies there. Follow a river downstream to glide along it. | Hands-free travel that teaches the river network. |
| **Watersheds** | Your river's length grows when others join it. The atlas shows each watershed and the hands it passes through. | A reason to come back: your river grew while you were away. |
| **Community Hand** | Donate one handbit to the Community Hand being built at the centre. When all 22 slots are filled it is sealed (an event with a stamp and a world chord) and the next one starts. | A shared goal for the whole world, and exactly Tim's concept image. |
| **History** | A world timeline: scrub it to watch the continent grow Hand by Hand, plus a feed of joins, confluences and seals. | The world tells its own story. |
| **Postcards** | Export a print of your Hand map with its labels, compass and stamp, as a PNG for sharing. Made from the map, never from the photo. | Players share it, and it costs nothing to make. |
| **Moderation** | Names only (there is no chat). Filter, report, owner review. | Low risk, low cost. |
| **Integrity** | The server owns placement. Hands never overlap. Generator versions are pinned per Hand, so a map never changes shape under its owner. | The map stays trustworthy. |

## 7. The readout: scanning a hand

### 7.1 Three ways in, one result

| Route | Who | What it captures |
|---|---|---|
| **A. Phone companion** (recommended) | Players with a phone | A palm photo and close-ups of five fingertips. |
| **B. Headset camera** | Quest 3 / 3S where the browser allows camera access (to verify: Quest Browser `getUserMedia` on the passthrough cameras) | The palm only, because the headset cameras cannot resolve fingerprint ridges. |
| **C. Read by eye** (always available, and the judges' route) | Everyone, including under-16s and anyone who declines the camera | You trace your main lines on a generic palm with your fingertip, then pick each finger's pattern from six inked icons while looking at your own fingers in passthrough. |

All three produce the same **Palm DNA** and **Print DNA**. C is not a lesser route: it has the same
map, the same rivers and the same merge.

### 7.2 Fingerprint readout (route A), on the phone

The capture screen asks for close-ups: "Hold your right index finger 5 cm from the lens. Torch on."

1. **Live guide**: a fingertip-shaped outline, distance cue (sharpness), and a quality meter that
   fills as ridges become clear. It shoots automatically when quality > 0.7 for 0.3 s.
2. **Enhance**: crop to the pad, normalise the contrast, estimate the ridge orientation with a
   gradient structure tensor on 16 px blocks, and the ridge frequency with x-signatures.
3. **Singular points**: Poincaré index on the smoothed orientation field gives the cores and deltas.
4. **Class**: arch, tented arch, ulnar loop, radial loop, whorl, central pocket loop, double loop,
   accidental (shown as "wild").
5. **Ridge count** from core to delta.
6. **Reduce and shuffle**: keep an 8×8 orientation field (16 directions), cores and deltas on an
   8×8 grid, the ridge-count band and the frequency band. Then add jitter: each direction moves by
   at most one step, each singular point by at most one cell, the ridge count by at most one.
7. **Discard**: the image, the enhanced image and anything finer. Minutiae are never computed at
   all. The map's minutiae are grown from a random seed.

### 7.3 Palm readout (routes A and B)

1. **Hand landmarks** come from MediaPipe Hand Landmarker (web, on device), run on the photo. This is
   not Meta hand-tracking data. It gives the wrist, finger joints and tips.
2. **Canonical frame**: rotate so the middle finger points up, mirror left hands to right, and scale
   so the distance from the index base to the little-finger base is 1. Absolute size is thrown away.
3. **Finger creases**: along each finger axis, find the dark bands near each joint. These are the
   handbit borders.
4. **Palm lines**: CLAHE, a multi-scale Hessian valley filter (Frangi), threshold, thin to a
   skeleton, trace polylines and link the gaps. Then label each line by where it starts and which way
   it runs: heart (upper, from the little-finger edge), head (from between thumb and index), life
   (arc around the thenar), fate (vertical), sun and mercury (short and vertical, under the ring and
   little fingers).
5. **Confirm in the headset**: each line is drawn in ink on your Hand map. "Is this your heart line?"
   You confirm with a pinch, or trace it yourself with your index fingertip and it snaps to your
   tracing. Wrong lines are cheap to fix, and players enjoy reading their own hand.
6. **Palmar dermatoglyphics** (if the photo is sharp enough): the triradii a, b, c, d and t, and the
   pattern type in the thenar, hypothenar and three interdigital areas. Without them the generator
   uses standard triradii.
7. **Reduce and shuffle**: 8 control points per line on a 64-step grid, one step of jitter, then
   discard the photo.

### 7.4 Route C, read by eye (headset only)

- **Lines**: a generic palm floats over your real hand in passthrough. Trace each line with your
  other index fingertip ("Trace your heart line"). The tracing is smoothed into the same 8 control
  points. You can skip a line; most hands have no strong fate line.
- **Prints**: six inked icons in the style of Tim's reference sheet. Look at your fingertip and tap
  the one that matches. "Not sure?" picks the most common class for that finger (loops for most
  fingers, whorls for thumbs and ring fingers), and you can change it later.
- Using tracked joints *live* to place the guide palm is allowed. Storing or deriving anything from
  them is not (Meta policy).

## 8. Data: what we keep, where, and in what form

### 8.1 Never stored, never sent

Photos and video frames, enhanced images, minutiae, hand-tracking joints, hand size, skin colour.
These exist only in memory on the device during capture, for seconds, and are released afterwards.

### 8.2 Print DNA v1 (44 bytes per finger)

| Bytes | Field |
|---|---|
| 0 | version = 1 |
| 1 | finger 0-9 (high nibble), class 0-7 (low nibble) |
| 2 | ridge count band 0-31 (5 bits), quality band (2 bits), source (1 bit: scanned or chosen) |
| 3 | ridge frequency band (4 bits), slant (4 bits) |
| 4-7 | up to 2 cores and 2 deltas on an 8×8 grid (6 bits each) plus presence flags |
| 8-39 | orientation field, 8×8 cells, 4 bits each |
| 40-43 | seed (32-bit random: picks the synthetic minutiae and the place names) |

Readable form (shown in the UI as a "DNA strand"): `R2 · UL · rc12 · f9 · c(3,3) · d(5,6) · #8f3a91c2`,
with the orientation field drawn as a strip of 64 small ink strokes.

### 8.3 Palm DNA v1 (28 + 13 bytes per line: 80 bytes for four lines)

| Field | Size |
|---|---|
| version, side (L/R), line count | 3 bytes |
| up to 8 lines: kind (4 bits), strength band (4 bits), 8 points × (x, y) at 6 bits | 13 bytes each |
| finger creases: 2 per finger, thumb included, along the axis, 6 bits | 8 bytes |
| finger proportion bands (3 levels per finger, coarse on purpose) | 2 bytes |
| triradii a, b, c, d, t (12 bits each) and 5 palmar pattern types (3 bits each) | 10 bytes |
| palette (chosen) and seed | 5 bytes |

### 8.4 Server storage (Cloudflare D1, EU jurisdiction)

```sql
create table player (
  id text primary key,          -- random UUID, never derived from biometrics
  token_hash text not null,     -- anonymous device token, hashed
  created_at integer not null,
  consent_version integer not null,
  age_band text not null,       -- '13-15' or '16+'; camera routes are 16+ only
  region text,                  -- continent, for picking live rooms; no IP stored
  name text,                    -- optional, moderated
  palette integer not null      -- chosen skin palette
);
create table hand (
  id text primary key,
  player_id text not null references player(id) on delete cascade,
  side text not null check (side in ('L', 'R')),
  palm_dna blob not null,       -- Palm DNA v1
  prints blob not null,         -- 5 × Print DNA v1
  route text not null,          -- 'phone' | 'headset' | 'eye'
  gen integer not null,         -- generator version, pinned
  x real, z real, rot real,     -- placement (metres, radians); null until laid
  placed_at integer,
  founder integer not null default 0
);
create table handbit_name (hand_id text, code text, name text, by_player text, at integer,
  primary key (hand_id, code));
create table place_name (hand_id text, feature text, name text, by_player text, at integer,
  primary key (hand_id, feature));   -- summits, passes, rivers
create table confluence (river_a text, river_b text, at integer, primary key (river_a, river_b));
create table charted (player_id text, hand_id text, code text, at integer,
  primary key (player_id, hand_id, code));
create table community_slot (community_no integer, slot text, hand_id text, code text, at integer,
  primary key (community_no, slot));
create table event (id integer primary key, at integer, kind text, hand_id text, data text);
```

Map geometry is **never stored**. Every client rebuilds it from the DNA with the generator version
pinned to that Hand, so 10,000 Hands are about 3 MB of DNA. Clients load the world in chunks of
4 × 4 spans with an ETag per chunk.

### 8.5 Consent, rights and deletion

- **Consent card** before any camera use, in plain words: "Your photos stay on your phone. We keep a
  simplified, shuffled version of your palm lines and print patterns. They become a map that other
  players can see. You can delete it any time."
- **Age**: camera routes are 16+. Under 16 uses route C only.
- **Region**: for Illinois, Texas and Washington (strict biometric laws), route C is the default and
  the camera routes need an extra written consent step, or are off at launch.
- **"Wash your hands"** (Settings): deletes your DNA, names and charting. Your Hand on the map becomes
  a blank parchment outline with no lines, so neighbours keep their coastlines, and nothing derived
  from your hand remains.
- **Export**: download your DNA and placement as JSON (GDPR access).
- **Test data**: only synthetic or consented fixtures. Real palm photos never go into the git repo.

## 9. Scribbles: the creatures

Following Tim's references (the fingerprint doodle sheet and the tangled one-line scribble):

- A scribble is **one continuous black ink line**, 40 to 80 m long in the world, thick in the middle
  and thin at both ends like a brush stroke.
- **The body follows the head's path exactly.** The head steers smoothly and the line slides along its
  own trail, so it always reads as a line being drawn in the air while the tail lifts off. This is
  what makes the motion elegant: the shape is the history of a smooth path.
- **Knot**: at rest, the head traces the owner's print pattern in a tilted plane (whorl spirals, loop
  hairpins, arch waves) with slow drift, so the trail tangles into a ball that looks like a scribbled
  fingerprint.
- **Stream**: in flight, the line unravels into a long wave with an occasional small loop, like the
  reference image.
- **Hatching**: a new scribble starts as a ridge of its print land. The head lifts off and the rest of
  the ridge peels out of the ground after it.
- **Swarms**: five scribbles per player, one per print. Swarms of offline players knot quietly over
  their Hands. Online players' swarms stream across the map. When two swarms meet, their lines braid
  for a few seconds and a two-note chord plays. That is the greeting.

## 10. Multiplayer and scale

- **Live rooms**: a Cloudflare Durable Object per room, at most 200 players, picked by continent
  (`eu-0`, `eu-1`, ...). A full room hands the client the next shard. Clients send their pose at
  5 Hz. The room sends one batched snapshot at 4 Hz (about 6 KB for 200 players). Nothing in a room
  is stored.
- **World**: a single World Durable Object serialises placements (overlap checks, confluences,
  Community Hand slots) and writes to D1. Reads go straight to D1 through the Worker, cached.
- **Pairing** (phone companion): the headset shows a 6-character code and a QR code. The phone
  page posts the finished DNA to `pair:<code>`, which is a 10-minute relay with no storage.
- **Rendering at scale**: about 60 Hands near you at full detail, generated in a worker from DNA.
  Further out, simplified meshes, and beyond 5 km a baked atlas texture. The world origin moves with
  you (floating origin) so the world can grow past 10 km without precision loss.
- **Thousands of players**: 10,000 Hands means 3 MB of DNA and 50 live rooms of 200. That is
  well inside one Worker + D1 + DO setup.

## 11. The interface

### 11.1 Visual language: the cartographer's atelier

| Token | Value | Use |
|---|---|---|
| Ink | `#16100e` | lines, text, scribbles |
| Parchment | `#f3e4d2` | cards, the Paper Sea, uncharted outlines |
| Skin palettes | 6 sets of 3 tones, from `#f1c7a8` to `#5a3524` | Hands (player's choice) |
| River | `#2f5d7c` to `#7fa7b8` | water: the only cool colour, so water always reads |
| Seal | `#b8442e` | stamps, confirmations, the "laid" moment |
| Gilt | `#c9a35a` | founders, the Community Hand |

- Type: a serif with small caps for place names (map labels, letter-spaced 8%), a humanist sans for
  UI text, a mono for DNA strands.
- Icons: hand-inked, like the doodle sheet. One icon per print class, also used as a map glyph.
- Motion: ink draws on along its path, never fades in. Confirmations are a stamp (scale 1.15 → 1,
  80 ms, with a soft thud).
- Sound: every UI action has a matching sound, so you can tell what happened without looking.

### 11.2 Rules for VR

- Essential UI stays inside a 30-degree cone around the gaze, and inside 24 degrees for the Meta VR
  Glasses profile.
- Panels sit 0.6 to 0.8 m away. The smallest text is 1.2 degrees tall (about 15 mm at 0.7 m).
- Poke targets are at least 32 mm with 8 mm gaps. A hover thickens the ink, a press stamps it.
- Everything works by poke and by pinch with gaze, and on desktop by mouse.
- Comfort: no forced camera moves, a vignette on fast turns, and a horizon lock while gliding.
- Accessibility: one-handed mode (every gesture has a pinch alternative), captions for sound cues,
  reduced motion (no braiding, slower ink), high-contrast labels.

### 11.3 Screens and states

1. **Front door (web page)**. Behind the text, the live world turns slowly. Live counters: "1,284
   Hands · 9 rivers over 10 km · 213 flying now". Buttons: Enter in headset, Preview in browser.
   It's a real page, so it also works as the share link.
2. **Arrival (headset)**. You hover 300 m above the world at dawn. Map labels fade in at altitude,
   then swarms stream past. Title card: *Palm Whorl Cities*, and below it "Lay your hand into the
   world". Room mode (passthrough) and World mode (immersive) are both offered: the atelier steps
   (3-6) happen in your real room, where your real hand and its map float side by side.
3. **Consent card**. The three routes as three cards (phone, headset camera, read by eye), each
   saying what is kept. Choosing one is the consent.
4. **Pairing (route A)**. Code and QR code in the headset, with a phone checklist: palm (1 photo),
   prints (5 close-ups). Each item ticks off live as the phone finishes it.
5. **Readout (the atelier)**. Your Hand map floats in front of you at 1:500, like a parchment model.
   Lines are inked on one by one and become rivers ("Heart line → Heart River"). You confirm or
   retrace each line. The 15 + n handbits get outlined and numbered, each with its print-class
   glyph. The DNA cards (one per print) line up below, with their strands. Missing data shows a
   dashed outline and a "read by eye" button.
6. **Palette and name**. Pick your skin palette (or ink, paper or river palettes; you don't have to
   look like your skin), and accept or reroll the generated Hand name.
7. **Merge**. You fly to the frontier. Three ghost fits glow with their badges. Palm down over a ghost
   to hold your Hand. It follows your palm and snaps as you move. Push down to lay it. Stitches,
   confluences, the Hand rises, the scribbles hatch.
8. **Flight HUD** (minimal, fades when idle). Top: a compass ribbon with markers (your Hand, pins,
   the Source, friends). Bottom left: the place card (handbit name, owner, class glyph, river). Bottom
   right: altitude in spans. Off-screen pings are edge arrows.
9. **Palm atlas** (turn your left palm up). The atlas opens just above your palm and follows it. Your
   right index taps; pinch-drag pans; spreading two hands zooms. Tabs: World, My Hand (the handbit
   checklist), Charted, Community, Journal (history), Settings. While the atlas is open, the swarm
   holds position.
10. **Handbit inspector**. Tap a handbit: name, owner, print card or palm region card, rivers, who
    charted it first, Pin, Fly here, Donate (your own handbits only).
11. **Community Hand**. A gilt Hand with 22 slots. Filled slots show the donor's handbit, with its
    tone and print. "14 of 22. Sealed hands: 3."
12. **Postcard**. A preview of your Hand map as a print, with a frame, stamp and compass. Save it to
    the phone via the pairing relay, or download it on desktop.
13. **Wash your hands**. A two-step confirm with a stamp. It shows exactly what will be deleted.

Error and empty states: camera blocked (switch to route C in one tap), poor photo (what to fix: light,
distance, focus), hands not tracked (ask for light, at most twice a minute), offline (the world still
opens from cache and your Hand is saved locally and laid when you are back online), room full (moved
to the next room without a message), placement conflict (a new fit with no penalty).

## 12. Fit with the hackathon judging

- **Hands first**: scan, trace, pick, lay, steer and the atlas are all hand gestures. Controllers are
  optional.
- **Passthrough matters**: the atelier (readout, palette, merge preview) happens in your real room
  with your real hand next to its map. Comparing the two is the point of that step. The world itself
  is immersive.
- **Headset-only route** for judges: route C, with no phone and no camera.
- **60 fps on Quest**: generation in workers, about 60 detailed Hands, one draw call for all
  scribbles, a fixed budget for water.
- **One bus stop test**: a returning player opens straight over their Hand. Two minutes is enough to
  chart a handbit or see who joined your river.

## 13. What changes in the code

| Keep | Change | New |
|---|---|---|
| `print/land.js` (driven by Print DNA), `gesture.js`, `audio.js`, `ink.js` (per-vertex width) | `main.js` rebuilt around atelier → merge → world; `birds.js` replaced by scribbles | `dna.js` (pack/unpack/jitter, tested), `handmap.js` (DNA → handbits, rivers, heights), `fit.js` (fit finder, tested), `world.js` (chunks, floating origin), `water.js`, `scribble.js`, `atlas-ui.js`, `net.js`, `phone.html` + `phone/` (capture), `server/` (Worker, D1, Durable Objects) |

The table-era modules (`terrain.js`, `walk.js`, `city.js`, `chooser.js`, `guide.js`, `room.js`,
`desert.js`, `flight.js`, `director.js`) are kept under the tag `table-prototype`. They are removed
from `main` only with Tim's OK.

## 14. Milestones to the deadline (2026-11-18)

| Week | Milestone | Done when |
|---|---|---|
| 1 (to Oct 12) | **World**: First Ten from synthetic DNA, handbits, rivers as 3D water, stitched seams, macro skin, scribbles, gliding | Desktop and emulator show the ring of ten Hands at 60 fps |
| 2 (to Oct 19) | **Atelier, route C** and **merge**: trace lines, pick prints, DNA, fit finder, lay your Hand | A new player extends the world in the emulator |
| 3 (to Oct 26) | **Server**: D1, World DO, live rooms, pairing relay | Two browsers see each other's swarms and Hands |
| 4 (to Nov 2) | **Phone companion**: palm lines, print close-ups | A real palm photo gives sensible rivers |
| 5 (to Nov 9) | **Palm atlas**, charting, naming, Community Hand, postcards | The full loop works end to end |
| 6 (to Nov 16) | Quest performance, video, Devpost | Submitted |

## 15. Open decisions for Tim

1. **Headset camera** (route B) depends on Quest Browser exposing the passthrough cameras. Should we
   plan on phone + read-by-eye only and add B if it works?
2. **Placement**: the game proposes three fits and the player chooses or adjusts (recommended), or
   fully automatic.
3. **Founders**: synthetic DNA, or real hands from people who consent (the team)?
4. **Both hands** per player (two Hands, 10 prints), or one Hand first and the other one later as a
   second piece? The design assumes one first.
5. **Walking**: the furrow walk at human scale returns as the way to explore a print land (design
   ready, scheduled after week 5)?
