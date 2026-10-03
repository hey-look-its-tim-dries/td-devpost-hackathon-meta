# Palm Whorl Cities: Devpost submission copy

Paste-ready text for the Meta VR Start Developer Competition 2026 form.
Fill in the `TODO` links once Pages is on and the video is up.

## Tagline (140 characters max)

Your fingerprint becomes a land on your real table. Walk its paths with a fingertip, wake its wire birds, fly to other people's lands.

## About the project

## Inspiration

A fingerprint already looks like a map. We kept staring at the old Henry classification plates (arch,
loop, whorl) and seeing contour lines, mountain passes and winding roads. Everyone carries ten of
these maps around, and almost nobody has really looked at one. Hand tracking finally lets the hand be
the whole game: the controller, the creatures and the world.

## What it does

You sit at a table in passthrough. An ink outline of a hand appears on your real table and you lay
your hand in it. Six printed plates ask "Which one is yours?". You look at your own fingertip, touch
the matching pattern, then press that fingertip on the table, and a land grows out from the spot,
ridge by ridge.

The ridges are walls, the white furrows between them are paths, and the ridge count towards the core
is the height, so every land is a terraced hill. You walk the paths with your fingertip like a finger
labyrinth. Every fork and ending in the print is a landmark: walk past it and its ridge peels off,
folds into a V and flies away as a black wire bird that sings the curve of its own ridge.

Lift your hand palm down and you shrink to bird size. The room gives way to a warm sky and you glide
over a skin-coloured desert, steering by tilting your palm, to another player's land on the horizon.
Fly into the ring over its summit and their land lies on your table, and one of their birds joins
your flock. No timer, no score, nothing to fail.

## How we built it

Plain three.js and WebXR in the Quest Browser, no build step. The lands come from our own fingerprint
engine: an orientation field per class (the Sherlock-Monro zero-pole model), then SFinGe-style
oriented Gabor filtering of random seeds, so ridges grow and minutiae appear where growing fronts
meet. From the grown print we compute ridge-count terraces, a thinned path skeleton and the minutiae.
It runs in a worker in about 150 ms. Flight shrinks the player rig 40 times instead of growing the
world, which keeps stereo depth and head motion right. Sound is all generated with Web Audio.

## Challenges we ran into

Quest hand tracking is weakest exactly where our first ideas lived: crossed hands and interlaced
thumbs. So the two-hand shadow bird became a loose bonus, and the main take-off is one flat hand.
Real ridges are half a millimetre apart, far below fingertip precision, so lands regrow at a stylised
density with paths 2 to 3 cm wide.

## Accomplishments that we're proud of

Six fingerprint classes that look right, grown from nothing, each a different kind of landscape.
And a privacy story we can stand behind: we never need your real fingerprint.

## What we learned

Fingerprints are biometric data and hand-tracking data identifies people too. Designing around that
from day one (choose your class, grow the rest from a seed, use hand data live only) made the game
simpler, not weaker.

## What's next for Palm Whorl Cities

A shared atlas of everyone's lands, an optional phone page that reads your real print's class and
ridge count without keeping the photo, cities that grow along the paths you walk, and your palm as
the desert between your five fingertip lands.

## How hand interactions are implemented

Everything is hands first: lay your hand on the outline to place the land, poke a plate to choose
your pattern, press a fingertip to grow it, hover or touch to walk (a One Euro filtered fingertip
with touch hysteresis, snapped to the path within 2.5 cm), lift one hand palm down to fly, tilt the
palm to steer. Pinch works as "yes" at every step, the grip takes off, and the head steers when no
hand is in view. Hand data is used live only and never stored or sent.

## Built With

three.js, WebXR, JavaScript, HTML, CSS, GLSL, Web Audio API, WebXR Hand Input, WebXR Plane Detection,
Meta Quest, Meta Quest Browser, Passthrough, IWER (Immersive Web Emulation Runtime), GitHub Pages,
Node.js, Claude Code

## Try it out

- Live: https://hey-look-its-tim-dries.github.io/td-devpost-hackathon-meta/ (TODO: live once Pages is on)
- Code: https://github.com/hey-look-its-tim-dries/td-devpost-hackathon-meta
- Video: TODO

## Track, division, launch

- Track: Gaming. Division: New Experience (built from 24 September 2026).
- Also in the running for: Boldest Original Concept, Best First Five Minutes.
- Target launch date: live on the web at submission (November 2026). Being a WebXR page, the submission is the launch.
