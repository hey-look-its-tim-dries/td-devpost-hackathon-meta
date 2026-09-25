# Upwards — Cloud Drift

A relaxed, head-driven cloud exploration game for a hackathon prototype.

## Concept

You drift through an azure sky in a tiny explorer craft. The whole experience is intentionally calm: no frantic mechanics, just smooth flight, distant stars, soft clouds, and a gentle sense of motion. The player moves by turning their head left or right, or by moving the pointer for desktop testing.

The idea is to create a meditative interaction where the body becomes the controller:

- the head turns to steer
- the craft glides through cloud currents
- energy orbs are collected for score
- storm formations represent tension and challenge
- the entire world feels like a quiet breath in the sky

## Core experience

This prototype focuses on the feel of the game rather than a full product build:

- Azure-blue atmospheric sky
- Layered cloud fields with gentle motion
- Soft particles and a distant starfield
- Minimal arcade loop with floaty score chase
- Head tilt support via `DeviceOrientationEvent`
- Desktop fallback via mouse movement

## Run locally

From the project folder:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Controls

- Mobile / head movement: tilt your device or turn your head left and right
- Desktop: move your mouse left and right across the page
- Tap the button in the overlay to begin

## Hackathon angle

This prototype is intended to support the theme of:

- relaxation over intensity
- bodily movement as interaction
- a meditative exploration aesthetic
- an uplifting, biosensory gameplay loop

The player is not fighting enemies; they are navigating observation, drift, and calm atmospheric discovery.
