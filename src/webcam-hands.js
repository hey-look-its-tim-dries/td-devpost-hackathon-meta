// src/webcam-hands.js
// Your laptop webcam as headset hand tracking, for testing without a Quest. MediaPipe Hand
// Landmarker runs in the page (the video never leaves the browser, and nothing is kept); its 21
// joints per hand are mapped onto the 25 WebXR joint names, so the game's gestures work unchanged.
const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const CAMERA = [0, -0.08, -0.55]; // where the laptop camera sits, seen from your eyes
const FINGERS = ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
const PALM = [0, 5, 9, 13, 17]; // the points that define the hand's centre

const sub = (a, b) => [a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)];
const mean = (pts) => ['x', 'y', 'z'].reduce((o, k) => ({ ...o, [k]: PALM.reduce((s, i) => s + (pts[i][k] ?? 0), 0) / PALM.length }), {});

// world: MediaPipe world landmarks (metres, camera axes: x right in the image, y down, z away from
// the camera); image: normalised image landmarks. The camera faces you, so its axes turned half a
// turn round z are yours: x right, y up, z towards you.
export function toJoints(world, image, label, { aspect = 4 / 3, fovX = 1.05 } = {}) {
  // distance from the camera, from the least foreshortened palm edge
  let scale = 0;
  for (const [a, b] of [[0, 5], [0, 17], [5, 17]]) {
    const m = Math.hypot(...sub(world[a], world[b]));
    const px = Math.hypot(image[a].x - image[b].x, (image[a].y - image[b].y) / aspect);
    scale = Math.max(scale, px / (m || 1));
  }
  const d = 1 / (scale * 2 * Math.tan(fovX / 2));
  const ci = mean(image), cw = mean(world);
  const cx = (ci.x - 0.5) * 2 * Math.tan(fovX / 2) * d, cy = ((ci.y - 0.5) * 2 * Math.tan(fovX / 2) * d) / aspect;
  const centre = [CAMERA[0] - cx, CAMERA[1] - cy, Math.min(-0.15, CAMERA[2] + d)];
  const at = (i) => {
    const [x, y, z] = sub(world[i], cw);
    return [centre[0] - x, centre[1] - y, centre[2] + z];
  };
  const joints = {
    wrist: at(0),
    'thumb-metacarpal': at(1), 'thumb-phalanx-proximal': at(2), 'thumb-phalanx-distal': at(3), 'thumb-tip': at(4),
  };
  FINGERS.forEach((f, k) => {
    const b = 5 + k * 4, w = joints.wrist, kn = at(b);
    joints[`${f}-metacarpal`] = [0, 1, 2].map((j) => w[j] + (kn[j] - w[j]) * 0.3); // MediaPipe has no metacarpal joints
    joints[`${f}-phalanx-proximal`] = kn;
    joints[`${f}-phalanx-intermediate`] = at(b + 1);
    joints[`${f}-phalanx-distal`] = at(b + 2);
    joints[`${f}-tip`] = at(b + 3);
  });
  // MediaPipe Tasks labels a raw (unmirrored) webcam picture as it is: checked with a photo of a right
  // palm, which comes back 'Right', and the same photo flipped, which comes back 'Left'
  return { handedness: label === 'Right' ? 'right' : 'left', joints };
}

export async function startWebcamHands() {
  const { FilesetResolver, HandLandmarker } = await import(`${CDN}/vision_bundle.mjs`);
  const files = await FilesetResolver.forVisionTasks(`${CDN}/wasm`);
  const make = (delegate) => HandLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numHands: 2 });
  const landmarker = await make('GPU').catch(() => make('CPU'));
  const video = Object.assign(document.createElement('video'), { muted: true, playsInline: true, className: 'webcam' });
  video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
  await video.play();
  document.body.append(video);
  let hands = [], last = -1;
  return {
    video,
    // the newest hands; detection runs at most once per camera frame
    update() {
      if (video.readyState < 2 || video.currentTime === last) return hands;
      last = video.currentTime;
      const r = landmarker.detectForVideo(video, performance.now());
      const aspect = video.videoWidth / video.videoHeight;
      hands = r.worldLandmarks.map((w, i) => toJoints(w, r.landmarks[i], r.handedness[i][0].categoryName, { aspect }));
      return hands;
    },
    stop() {
      video.srcObject.getTracks().forEach((t) => t.stop());
      video.remove();
      landmarker.close();
    },
  };
}
