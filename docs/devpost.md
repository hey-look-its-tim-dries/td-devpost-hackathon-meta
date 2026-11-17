# Palm Whorl Cities: Devpost submission copy

Paste-ready text for the Meta VR Start Developer Competition 2026 form, in the order the form asks for it.
Two things are still to fill in: the video link (upload `media/palm-whorl-cities-pitch.mp4` to YouTube) and the
gallery artwork (made with Veo, see the end of this file).

## Tagline (140 characters max)

A living world made of players' hands. Read yours, it becomes land; fly over it as an ink whorl and sow it into bloom, together.

## About the project

## Inspiration

A palm already looks like a map. The heart, head and life lines are rivers, and a fingerprint is a hill drawn
in contour lines. We wanted a world with no designed levels at all: ten founding hands round a spring, and then
only the hands of the people who play. Everyone who joins makes the map bigger, and everything anyone plants
stays for everybody.

## What it does

You start by reading your own hand, in your own room. In the headset a glowing palm is laid on your floor with
a ring of flowers round you, and you touch the pattern that matches each fingertip and trace your palm lines
with a finger. (A phone can read the photos instead, and deletes them.) That makes a Hand: a few hundred bytes
of map, never a picture. The world offers three places where it fits, you pinch one, and your Hand rises out of
the wilderness for every player at once.

Then you fly. You are a whorl, a creature of ink strands shaped by your own five fingerprints, so no two players
look alike. Point where you want to go, dive for speed. And you garden: hold a pinch and seed flies out ahead of
you, sweep an open hand to scatter, skim a river for water and press a flat palm down to pour it. There are 712
real species. 403 flowers and trees can be sown; where plots bloom, insects, birds, fish and animals move in.
Sandstorms dry what they cross, a golden seed sets off a race every few minutes, and a hyper sow lets you draw
on the desert with flowers. Your whorl wears everything you have sown as a bouquet.

What dies feeds mushrooms. Fly through one and the world turns to foxfire: a neon night with a striped sun,
double rewards, rows of seeds that ring up a musical scale as you thread them, every animal ten times as big,
and visions of giant gnome folk dancing on the dunes. Gnomes live in the mushrooms. One grabs your whorl and
hangs under it like a parachutist with a wish ("FASTER! I want my beard to flap!"). Grant it and it joins your
team, or switches sides from a rival's. Drop it and it falls, screaming.

You are never alone or lost. A grumpy old gnome, Grandfather Tuft, calls in with a voice and a face and talks you
through the first minutes, then mostly leaves you alone. Before you dive in, a lobby shows the live world: who is
flying, the top gardeners, the latest news. Meet another player and your whorls braid for two seconds and swap
seeds. At the Source lies the Community Hand: every grove sown anywhere in the world, one pixel each.

It plays in the Quest browser with hands only, and the same world is open on a laptop, with a webcam as hands,
and on a phone, where you steer by tilting it.

## How we built it

It is a single web page: three.js and WebXR with hand input, no build step, no install. The world is drawn from
the Hands themselves. Every Hand's height field, rivers and print hills are generated from its DNA, and custom
shaders paint sand, water, the foxfire and 712 species, from pixel art to painted sprites to 3D meshes.

The shared world runs on Cloudflare: a Worker in front, one Durable Object that is the single writer for the
world's Hands and gardens, room objects of up to 200 players that relay positions over WebSockets, and D1 for
storage. Google sign-in keeps your garden across devices, and only a hash of the account id is kept.

The gnome and Grandfather Tuft are modelled and animated in Blender (Tuft is a rendered bust with sixteen
talking frames). Tuft's 235 lines and the gnomes' squeals and screams are spoken by Kokoro, a neural voice model
that runs locally, aged and pitched with ffmpeg. The 15 synthwave tracks and the art packs are CC0 and CC-BY,
credited in the repo.

We tested without a headset in Meta's Quest emulator (IWER), driving virtual hands through every gesture, and
filmed the demo the same way. 340 unit tests and two-player browser checks cover the rules, the server and the
protocol.

## Challenges we ran into

Steering by tilting a palm drifted, so we made your fingers the arrow instead, read from the wrist to the middle
knuckle where Quest tracking is steadiest, with a dead zone and a short hold so resting hands never steer.

Hundreds of players planting at once needed one place where the truth lives. A single Durable Object writes
every grove, rooms only relay, and a crowd simulator told us where it strained.

Making a world that grows forever means saved gardens must never break. Species are append-only with frozen
ids, ids travel in 16 bits, and the sprite atlas grows with the list.

And a game this layered can drown a newcomer. The tutorial, Tuft's call-ins, first-minute notes and an
always-visible mission bar took many rounds of cutting back until they helped without nagging.

## Accomplishments that we're proud of

The world is made of its players. There is no level designer, only hands, and every new player makes it bigger.

It feels alive with one player and better with many: bouquets on whorls, gnomes riding animals, petals
drifting past when someone sows elsewhere, and a Community Hand that shows the whole world at a glance.

It is private by design. No camera image is ever kept, and the hand you lay is a coarse map, not a biometric.

## What we learned

Hands-only play is a design constraint that makes everything clearer. If a move cannot be done with an open
hand, a pinch or a point, it does not belong.

Characters carry a game. Players forgive a lot when a rude old gnome tells them they fly like a falling wardrobe.

## What's next for Palm Whorl Cities

Seasons and weather that change the world for everyone at once. Gnome villages that grow on Hands with big teams.
More of everything: the species list is built to keep growing. And testing on many more real Quests, in many
more real rooms.

## How hand interactions are implemented

Everything is hands first, and no hint in the headset ever names a key. On a card you touch with your index
fingertip (a press is the fingertip crossing the card's plane; a drag draws a palm line), or look and pinch. You
place your Hand by looking at an outline and pinching, or by pressing it down 8 cm with your palm.

You steer by pointing: the direction from wrist to middle knuckle is the arrow. A hand engages only when raised,
not a fist, and held for 0.4 seconds, and a card fixed in view shows which condition is missing. One hand steers
and the other is free to garden: pinch and hold to sow (seed is thrown ahead of you), sweep an open hand to the
side to scatter, a flat palm pressed down to pour water, a short left pinch for the next seed and a long one for
the hyper sow, a fist pulled up to clear a grove, and an open hand tossed up to set a gnome down. Turn your left
palm up and the atlas opens above it and follows it; your right fingertip taps it. Hand data is used live only
and is never stored or sent.

## How the real room matters

You read your hand in your own room. In passthrough the card floats in front of you, a glowing palm is laid on
your real floor with a ring of flowers round you and seeds drifting up, and your Hand is made from your own
fingertips and lines. Where there is no passthrough (the emulator, a desktop), the same scene stands under a
dusk sky instead.

## Built With

three.js, WebXR, WebXR Hand Input, WebXR passthrough, JavaScript, GLSL, HTML, CSS, Cloudflare Workers, Durable
Objects, Cloudflare D1, WebSockets, Google Identity, Blender, glTF, Kokoro TTS, ffmpeg, MediaPipe, IWER (Immersive
Web Emulation Runtime), Meta Quest, Meta Quest Browser, GitHub Pages, Node.js, Claude Code

## Try it out

- Live: https://hey-look-its-tim-dries.github.io/td-devpost-hackathon-meta/
- Code: https://github.com/hey-look-its-tim-dries/td-devpost-hackathon-meta
- Video: VIDEO LINK (upload `media/palm-whorl-cities-pitch.mp4`, 2:33, filmed in the Quest 3 emulator)
- Deck: `docs/deck/palm-whorl-cities-pitch.pdf` · Manual: `docs/manual/palm-whorl-cities-manual.pdf`

## Track, division, launch

- Track: Gaming (Entertainment). Division: New Experience (built from 24 September 2026).
- Also in the running for: Boldest Original Concept, Best First Five Minutes, Best Social and Multiplayer, Best
  Reason to Come Back (check the exact names on the form).
- Target launch date: live now. It is a WebXR page, so the submission is the launch.

## Gallery images (Veo, tomorrow)

Devpost shows a cover image and a gallery. Planned set: one Veo key artwork for the cover (the jubilant gnome
under the whorl over the blooming desert), one Veo artwork of the foxfire, and these gameplay shots from
`docs/screenshots/`: 21 title, 22 lobby, 23 first minutes with Tuft, 24 sowing, 25 foxfire seed trail,
26 foxfire gnome folk, 27 gnome mission, 29 hand reading, 30 phone, 31 Community Hand.
