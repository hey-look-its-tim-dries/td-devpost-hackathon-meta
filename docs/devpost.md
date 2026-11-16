# Palm Whorl Cities: Devpost submission copy

Paste-ready text for the Meta VR Start Developer Competition 2026 form.
Fill in the `TODO` links once the video is up. This copy describes the game WITH the garden (Bloom): paste it only
once that version is live, and re-record the video first (the old one shows the game before the garden).

## Tagline (140 characters max)

A desert made of players' hands. Fly over it as an ink whorl, sow 688 kinds of flowers and trees together, and become a flying bouquet.

## About the project

## Inspiration

A palm already looks like a map: the heart, head and life lines are rivers, a fingerprint is a hill in
contour lines. We wanted a world with no designed levels: ten founding hands, then only the hands of
the people who play.

## What it does

You read your own hand in your room, in passthrough: by eye (touch the pattern on each fingertip,
trace your lines) or with your phone, which reads the photos and deletes them. That makes a Hand, a
few hundred bytes of map DNA. The world proposes three places where it fits; you pinch one, or press
it down with your palm, and your Hand rises out of the wilderness for every player.

Then you fly as the Whorl, a creature of ink: point where you want to go, dive for speed. And you garden.
Seed drifts on the wind in swirls: 688 real species, each with its own look, some pixel art, some painted,
some 3D, mixed on purpose. Hold a pinch over a Hand and you sow; sweep an open hand and you scatter; skim a
river for water and pour it with a flat palm, and groves grow through four stages. Plots bloom, and wildlife
moves in: insects, then birds and fish, then animals. Pixel flowers lay mosaic tiles on the sand, and in a
ten-second hyper sow you draw with flowers. Every ten minutes a sandstorm crosses the world and parches what
it passes, until someone waters it; every four, one golden seed appears and everyone races for it.

It is one garden for all players, live. Anyone can water anyone's grove. And you are what you have sown:
your whorl wears your whole sowing history as a bouquet, first-sown at the head, so no two players look
alike and a sky of players is a sky of flying bouquets. The palm atlas (left palm up) holds the world map,
your herbarium, pins, names and the journal; at the Source everyone builds the Community Hand together.

## How we built it

Plain three.js and WebXR in the Quest Browser, no build step. Hands are built from DNA in web
workers and drawn, with an endless skin wilderness, as one level-of-detail terrain in a single
shader. The garden is instanced: two sprite draws, one for mosaic tiles, a few for 3D flowers and trees,
four for all wildlife. A Cloudflare Worker keeps the map: a Durable Object writes Hands and groves to D1
one at a time; the garden is read Hand by Hand as you fly near, so a download never grows with the world;
rooms of 200 relay poses, plantings and each player's bouquet. Seed clouds, the golden seed and the sandstorm
come from the clock alone, so every player sees the same ones with nothing stored. The phone reads palm lines
and print patterns in its own browser. Flower art includes CC0 and CC-BY packs, credited in the repo.

## Challenges we ran into

We threw away our first table-top version two weeks in and made the hand itself the world. Steering
by tilting a palm drifted, so your fingers became an arrow, read where Quest tracking is steadiest.

## Accomplishments that we're proud of

A world map with no designed land in it, that a new player really extends, live. And we never need a
picture of your hand.

## What we learned

Designing around biometric data from day one made the game simpler, not weaker.

## What's next for Palm Whorl Cities

Seasons, trading seeds hand to hand, sound made for a shared world, and walking your own garden at human scale.

## How hand interactions are implemented

Everything is hands first. On the card you touch with your index fingertip (a press is the fingertip
crossing the card's plane, a drag draws a palm line), or look and pinch. You choose where your Hand
goes by looking at an outline and pinching, or by holding your palm down over it and pressing it 8 cm
lower until it comes to rest. Turning your left palm up opens the atlas above it, and it follows that
palm; your right fingertip taps it. You steer by pointing: the direction from wrist to
middle knuckle is the arrow, with a dead zone, and a hand engages only when it is raised, not a fist
and held for 0.4 seconds, so resting hands never steer. A card fixed in view shows which condition
is missing. The head steers when no hand is engaged. Gardening uses the oldest sowing movements: pinch and
hold drills seed along your path (and slows you), an open hand swept to a side broadcasts five groves that
way, thrown forward it casts them far ahead, a flat palm pressed down pours water, a short left pinch picks
the next seed and a held one starts the hyper sow. The hand that steers never sows. Hand data is used live only and never stored or
sent.

## Built With

three.js, WebXR, JavaScript, HTML, CSS, GLSL, WebXR Hand Input, Web Workers, Cloudflare Workers,
Durable Objects, Cloudflare D1, MediaPipe, Blender, glTF, Meta Quest, Meta Quest Browser, Passthrough,
IWER (Immersive Web Emulation Runtime), GitHub Pages, Node.js, Claude Code

## Try it out

- Live: https://hey-look-its-tim-dries.github.io/td-devpost-hackathon-meta/
- Code: https://github.com/hey-look-its-tim-dries/td-devpost-hackathon-meta
- Video: TODO (re-record with the garden: `node tools/film.mjs` shows only the game before it)

## Track, division, launch

- Track: Gaming. Division: New Experience (built from 24 September 2026).
- Also in the running for: Boldest Original Concept, Best First Five Minutes, Best Social & Multiplayer, Best Reason to Come Back (check these names against the form).
- Target launch date: live on the web at submission (November 2026). Being a WebXR page, the submission is the launch.
