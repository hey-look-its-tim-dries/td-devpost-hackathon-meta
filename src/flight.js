import * as THREE from 'three';
import { createDesert } from './desert.js';

// Flying. Nothing in the world gets bigger: YOU shrink. The rig that holds the camera and your
// hands scales down about 40 times, so the 60 cm land on your table becomes a 24 m country, your
// head motion shrinks with you and the stereo depth stays right. The room would not shrink with you,
// so while you fly a warm sky closes over the passthrough.
export const SHRINK = 40;
const ALT = 0.05; // world metres above the ground while flying (2 m to you)
const SPEED = 0.06; // world metres per second (2.4 m/s to you)

const SKY_FRAG = /* glsl */ `
  uniform float uFade;
  varying vec3 vDir;
  void main() {
    vec3 n = normalize(vDir);
    float up = n.y;
    vec3 horizon = vec3(1.0, 0.8, 0.66), zenith = vec3(0.62, 0.56, 0.78), low = vec3(0.86, 0.6, 0.5);
    vec3 col = up > 0.0 ? mix(horizon, zenith, pow(up, 0.6)) : mix(horizon, low, min(1.0, -up * 3.0));
    float sun = max(dot(n, normalize(vec3(0.5, 0.18, -0.85))), 0.0);
    col += pow(sun, 400.0) * 1.5 + pow(sun, 12.0) * vec3(0.35, 0.22, 0.1);
    gl_FragColor = vec4(col, uFade);
    #include <colorspace_fragment>
  }`;

export function createFlight({ rig, worldRoot }) {
  const skyU = { uFade: { value: 0 } };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(400, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: skyU, side: THREE.BackSide, transparent: true, depthWrite: false,
      vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: SKY_FRAG,
    }),
  );
  sky.renderOrder = -10;
  sky.visible = false;
  rig.add(sky);

  const { mesh: desert, uniforms: deserU } = createDesert();
  desert.visible = false;
  worldRoot.add(desert);

  let mode = 'table', t = 0, heading = 0, alt = ALT, scale = 1;
  const head = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3();
  const quat = new THREE.Quaternion(), yAxis = new THREE.Vector3(0, 1, 0), fwd = new THREE.Vector3(), tmp = new THREE.Vector3();
  let headingFrom = 0;

  function place(headLocal) {
    quat.setFromAxisAngle(yAxis, heading);
    rig.scale.setScalar(scale);
    rig.quaternion.copy(quat);
    rig.position.copy(head).sub(tmp.copy(headLocal).multiplyScalar(scale).applyQuaternion(quat));
  }
  function fade(a) {
    skyU.uFade.value = deserU.uFade.value = a;
    sky.visible = desert.visible = a > 0.001;
  }

  return {
    sky, desert,
    get mode() { return mode; },
    get flying() { return mode !== 'table'; },
    get amount() { return mode === 'table' ? 0 : scale === 1 ? 0 : Math.log(scale) / Math.log(1 / SHRINK); },
    get head() { return head; },
    get heading() { return heading; },
    forward(out) { return out.set(-Math.sin(heading), 0, -Math.cos(heading)); },

    // from the table: shrink over `seconds` while gliding down to just above `ground` (a world point)
    takeOff(headWorld, ground) {
      if (mode !== 'table') return;
      mode = 'rising'; t = 0; heading = 0; alt = ALT;
      from.copy(headWorld);
      to.copy(ground).setY(ground.y + ALT);
    },

    // to a new land: `rebase` has already moved the world so that land sits on the table again
    land() {
      if (mode !== 'flying') return;
      mode = 'landing'; t = 0; headingFrom = heading;
      from.copy(head);
    },

    // move everything by `delta` (world) without changing what you see: used when the world re-roots
    shift(delta) { head.add(delta); from.add(delta); to.add(delta); },

    // steer: { turn, climb } in -1..1; groundAt(worldPoint) -> world y of the land under you
    update(dt, headLocal, steer, groundAt) {
      if (mode === 'table') return;
      t += dt;
      if (mode === 'rising') {
        const e = THREE.MathUtils.smootherstep(Math.min(1, t / 2.6), 0, 1);
        scale = Math.exp(Math.log(1 / SHRINK) * e);
        head.lerpVectors(from, to, e);
        fade(Math.min(1, e * 1.6));
        if (t >= 2.6) mode = 'flying';
      } else if (mode === 'flying') {
        heading -= steer.turn * 0.55 * dt; // tilt right, turn right
        alt = THREE.MathUtils.clamp(alt + steer.climb * 0.03 * dt, 0.025, 0.2);
        head.addScaledVector(this.forward(fwd), SPEED * dt);
        head.y += (groundAt(head) + alt - head.y) * (1 - Math.exp(-dt * 2));
      } else if (mode === 'landing') {
        const e = THREE.MathUtils.smootherstep(Math.min(1, t / 2.6), 0, 1);
        scale = Math.exp(Math.log(1 / SHRINK) * (1 - e));
        heading = headingFrom * (1 - e);
        head.lerpVectors(from, headLocal, e); // back to your real head, over the new land
        fade(Math.min(1, (1 - e) * 1.6));
        if (t >= 2.6) {
          mode = 'table';
          scale = 1; heading = 0;
          rig.position.set(0, 0, 0); rig.quaternion.identity(); rig.scale.setScalar(1);
          fade(0);
          return;
        }
      }
      place(headLocal);
    },
  };
}
