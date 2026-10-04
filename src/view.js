// How far you see: near enough that your own hands are never clipped (the headset copies these into
// its depth range), far enough that the fog has closed the view before the far plane, and the two
// close enough together to keep depth precision for the distant hills.
export const NEAR = 0.1;
export const FAR = 40000;
export const FOG_DENSITY = Math.sqrt(Math.log(100)) / 30000; // exp2 fog closes at 30 km
