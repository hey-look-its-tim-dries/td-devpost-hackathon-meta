# Palm Whorl Cities: Devpost submission copy

Paste-ready text for the Meta VR Start Developer Competition 2026 form.
Fill in the `TODO` links once the video is up.

## Tagline (140 characters max)

Read your own hand and lay it into a shared world map: its lines become rivers, its fingerprints hills. Then glide over everyone's hands.

## About the project

## Inspiration

A palm already looks like a map. The heart, head and life lines are rivers, and a fingerprint is a
hill drawn in contour lines. Everyone carries one of these maps around and almost nobody has really
looked at it. We wanted a world with no designed levels at all: ten founding hands, and after that
only the hands of the people who play.

## What it does

The game opens over the First Ten: ten founding Hands lying in a ring, their palm lines cut in as
rivers, their fingertips rising as terraced print hills, and black-ink scribbles knotting above them.

First you read your own hand, in your room, in passthrough. A card floats beside your real hand. You
look at each fingertip and touch the pattern that matches, trace your heart, head and life lines on
a drawn palm, choose a skin palette and get a name. That is your Hand: a few hundred bytes of map
DNA, with no camera involved.

Then you lay it. The game finds three places on the frontier where your Hand fits against its
neighbours and shows them as ink outlines on the land. You look at one and pinch, and your Hand rises
out of the wilderness. Its five scribbles hatch and start to circle it.

Then you fly. You are the Whorl, a creature of nine ink strands. Raise a relaxed hand and point:
fingers up climbs, fingers down dives, and diving builds speed. Other players in your room fly
beside you, and when someone anywhere lays a Hand, it rises in your world while you watch. No timer,
no score, nothing to fail.

## How we built it

Plain three.js and WebXR in the Quest Browser, no build step. A Hand is built from its DNA in web
workers: DNA to an outline, the outline cut into handbits by its own lines, rivers and print
terraces baked into two texture arrays. One level-of-detail terrain draws every Hand and the endless
skin wilderness around them in a single shader. All ink (your creature, the scribbles, other
players) is ribbons in one draw call. The shared map is a Cloudflare Worker: one Durable Object
owns the world and lays one Hand at a time in D1, refusing overlaps; live rooms of up to 200 players
relay poses at 5 Hz in a small binary format.

## Challenges we ran into

Our first version grew one fingerprint on a real table. It was pretty and small. Two weeks in we
threw the table away and made the hand itself the world, ten times larger, which meant a new
terrain, a new scale and a new way to fly. Steering was the other one: tilting a palm drifted, so
now your fingers are an arrow, read from the wrist and middle knuckle where Quest tracking is
steadiest, and a hand only steers when it is raised, open and held for a moment.

## Accomplishments that we're proud of

A world map with no designed land in it. A new player really does extend it, for everyone, live.
And a privacy story we can stand behind: we never need a picture of your hand.

## What we learned

Palms and fingerprints are biometric data, and hand-tracking data identifies people too. Designing
around that from day one (read by eye, keep only coarse map DNA, regrow the prints from a class and
a random seed, use hand data live only) made the game simpler, not weaker.

## What's next for Palm Whorl Cities

An optional phone page that reads your real palm lines and deletes the photo, an atlas you open on
your own palm to chart its regions and follow a river to its neighbours, and walking a print hill at
human scale along the furrows between its ridges.

## How hand interactions are implemented

Everything is hands first. On the card you touch with your index fingertip (a press is the fingertip
crossing the card's plane, a drag draws a palm line), or look and pinch. You choose where your Hand
goes by looking at an outline and pinching. You steer by pointing: the direction from wrist to
middle knuckle is the arrow, with a dead zone, and a hand engages only when it is raised, not a fist
and held for 0.4 seconds, so resting hands never steer. A card fixed in view shows which condition
is missing. The head steers when no hand is engaged. Hand data is used live only and never stored or
sent.

## Built With

three.js, WebXR, JavaScript, HTML, CSS, GLSL, WebXR Hand Input, Web Workers, Cloudflare Workers,
Durable Objects, Cloudflare D1, MediaPipe, Meta Quest, Meta Quest Browser, Passthrough,
IWER (Immersive Web Emulation Runtime), GitHub Pages, Node.js, Claude Code

## Try it out

- Live: https://hey-look-its-tim-dries.github.io/td-devpost-hackathon-meta/
- Code: https://github.com/hey-look-its-tim-dries/td-devpost-hackathon-meta
- Video: TODO

## Track, division, launch

- Track: Gaming. Division: New Experience (built from 24 September 2026).
- Also in the running for: Boldest Original Concept, Best First Five Minutes.
- Target launch date: live on the web at submission (November 2026). Being a WebXR page, the submission is the launch.
