# Upwards: Devpost submission copy

Paste-ready text for the Meta VR Start Developer Competition 2026 form.
Fill in the two `TODO` links once the repo is public and the video is up.

## Tagline (140 characters max)

Lie back and your real ceiling opens into the sky. Drift up through the clouds into the stars, steered by a turn of your head.

## About the project

## Inspiration

Almost every VR experience assumes you are upright. A lot of quiet time is spent lying down, though: in
bed before sleep, on the sofa after a long day, in a hospital bed, or with a back that will not let you
sit for long. For those moments a headset mostly does not fit. We wanted something made for lying on
your back, and the thing you see from there is the ceiling. So we made the ceiling open.

## What it does

Upwards starts in passthrough. You lie down, recline or sit, and look up. A pinhole of blue appears where
your gaze meets your real ceiling. Hold still or pinch, and it opens outwards until the whole ceiling is
sky, cut off cleanly at your real walls, which stay in view. Then you rise: through noon cumulus, into
golden hour, dusk and night, until the clouds are gone and you are among the stars.

Trails of golden light drift along your path. You follow them by turning or tilting your head a little,
or by pinching and pulling sideways. Every light you catch plays a note on a pentatonic scale, so a trail
becomes a small melody. There is no score and no way to fail. Missing a light costs nothing.

| Usual VR | Upwards |
| --- | --- |
| Stand up, clear a room, hold controllers | Lie down where you are, no controller needed |
| Content floats at eye height in front of you | The sky opens in your own ceiling |
| Arm movement is the main input | A small turn or tilt of the head, or a pinch |
| Score, timers, fail states | No fail. The lights you catch become music |

## How we built it

Upwards is a WebXR page: plain three.js and ES modules, no build step and no asset files. It requests an
`immersive-ar` session with `hand-tracking` and `plane-detection`. Among the planes from the Quest's Space
Setup it picks the ceiling your gaze lands on, and each pixel of the sky tests its ray from your eye
against that plane. That is why the skylight stays fixed on the ceiling when you move your head, like a
real window. The clouds are 340 soft billboards in one draw call, with a noise texture generated at load.
The wind, the breathing pad and the chimes are all synthesised with Web Audio. We developed against
Meta's Immersive Web Emulation Runtime and its scanned rooms, so the whole flow runs on a laptop.

## Challenges we ran into

Lying down breaks the idea of "forward". Steering is therefore measured against the pose you had when you
settled in, so the same small turn works flat on your back, reclined or sitting, and nodding does nothing.
The second challenge was rooms we will never see. Only planes labelled as a ceiling count (beds, desks
and shelves never do), and if no ceiling is in view the skylight becomes a virtual window two metres
along your gaze instead of failing.

## Accomplishments that we're proud of

It needs nothing from you but your head. There is nothing to download beyond a web page, and a player can
go from a link to lying under an open sky in under a minute.

## What we learned

Comfort lying down is mostly about what does not happen: no sudden motion, no text outside a 30 degree
panel, nothing that asks you to lift your arms. Scene understanding is most convincing when it is quiet.
A hole that stays exactly on your ceiling sells the illusion more than any effect.

## What's next for Upwards

Cloud watching (rest your gaze on a cloud and it slowly takes a shape), a night-sky ending where the
lights you gathered become your own constellation, a spatial anchor so your sky returns to the same spot
every evening, and a sleep mode where the journey slows and the session ends itself.

## How hand interactions are implemented

Every action works with hands alone, and also without hands:

| Action | Hands | Head only |
| --- | --- | --- |
| Place the sky | Pinch | Look at the ceiling and hold still for 3 seconds |
| Drift left or right | Pinch and pull sideways (15 cm is a full turn) | Turn or tilt your head |
| Recentre | Double pinch | System recentre is picked up automatically |

Hands come from the WebXR `hand-tracking` feature and are drawn as three.js hand meshes. A pinch arrives
as the input source's `select` event. While pinched, the hand's sideways travel in the sky's frame is the
steering amount, so it works the same whichever way you are lying. The pinch-and-pull stays low and close
to the body, so nobody has to hold their arms up.

## Built With

three.js, WebXR, JavaScript, HTML, CSS, GLSL, Web Audio API, WebXR Hand Input, WebXR Plane Detection,
Meta Quest, Meta Quest Browser, Passthrough, IWER (Immersive Web Emulation Runtime), GitHub Pages,
Node.js, Claude Code

## Try it out

- Live: https://hey-look-its-tim-dries.github.io/upwards/ (TODO: live once Pages is on)
- Code: https://github.com/hey-look-its-tim-dries/upwards
- Video: TODO

## Track, division, launch

- Track: Entertainment. Division: New Experience (built from 24 September 2026).
- Also in the running for: Accessibility, Boldest Concept.
- Target launch date: live on the web at submission (November 2026). Being a WebXR page, the submission is the launch.
