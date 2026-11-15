# Palm Whorl Cities: Devpost submission copy

Paste-ready text for the Meta VR Start Developer Competition 2026 form.
Fill in the `TODO` links once the video is up.

## Tagline (140 characters max)

Read your own hand and lay it into a shared world map: its lines become rivers, its fingerprints hills. Then glide over everyone's hands.

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

Then you fly as the Whorl, a creature of ink: point where you want to go, dive for speed. Fly low over
a Hand and you chart it, the ink spreading into each blank handbit until the Hand is sealed. Turn your
left palm up and the atlas opens: every Hand, its rivers and names, who is flying. Pin places, fly
there, name your handbits or a summit nobody has named, print a postcard. Other players fly beside
you with their names over them, and when you meet, your swarms braid. At the Source, under a gilt
spire, everyone builds the Community Hand together, a handbit each.

## How we built it

Plain three.js and WebXR in the Quest Browser, no build step. Hands are built from DNA in web
workers and drawn, with an endless skin wilderness, as one level-of-detail terrain in a single
shader. A Cloudflare Worker keeps the map: one Durable Object lays Hands one at a time in D1 and
keeps names, the Community Hand and the journal; rooms of 200 relay poses. The phone reads palm lines
from a valley map and print patterns from the ridge orientation field, in its own browser. The
Source was built by a Blender script.

## Challenges we ran into

We threw away our first table-top version two weeks in and made the hand itself the world. Steering
by tilting a palm drifted, so your fingers became an arrow, read where Quest tracking is steadiest.

## Accomplishments that we're proud of

A world map with no designed land in it, that a new player really extends, live. And we never need a
picture of your hand.

## What we learned

Designing around biometric data from day one made the game simpler, not weaker.

## What's next for Palm Whorl Cities

Walking a print hill at human scale, the headset's own cameras as a third way in, and sound made for
a shared world.

## How hand interactions are implemented

Everything is hands first. On the card you touch with your index fingertip (a press is the fingertip
crossing the card's plane, a drag draws a palm line), or look and pinch. You choose where your Hand
goes by looking at an outline and pinching, or by holding your palm down over it and pressing it 8 cm
lower until it comes to rest. Turning your left palm up opens the atlas above it, and it follows that
palm; your right fingertip taps it. You steer by pointing: the direction from wrist to
middle knuckle is the arrow, with a dead zone, and a hand engages only when it is raised, not a fist
and held for 0.4 seconds, so resting hands never steer. A card fixed in view shows which condition
is missing. The head steers when no hand is engaged. Hand data is used live only and never stored or
sent.

## Built With

three.js, WebXR, JavaScript, HTML, CSS, GLSL, WebXR Hand Input, Web Workers, Cloudflare Workers,
Durable Objects, Cloudflare D1, MediaPipe, Blender, glTF, Meta Quest, Meta Quest Browser, Passthrough,
IWER (Immersive Web Emulation Runtime), GitHub Pages, Node.js, Claude Code

## Try it out

- Live: https://hey-look-its-tim-dries.github.io/td-devpost-hackathon-meta/
- Code: https://github.com/hey-look-its-tim-dries/td-devpost-hackathon-meta
- Video: TODO (upload media/palm-whorl-cities-demo.mp4, 1:55, recorded in Meta's Quest 3 emulator)

## Track, division, launch

- Track: Gaming. Division: New Experience (built from 24 September 2026).
- Also in the running for: Boldest Original Concept, Best First Five Minutes.
- Target launch date: live on the web at submission (November 2026). Being a WebXR page, the submission is the launch.
