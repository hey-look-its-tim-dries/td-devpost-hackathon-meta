import * as THREE from 'three';

// The film director (?emulate&film): plays the emulated Quest's head and right hand through the
// first minutes, so the demo video can be recorded in Meta's emulator without a headset. Every
// beat uses the game's real gestures: a flat hand on the outline, a fingertip poking a plate and
// pressing the table, a finger walking the paths, a hand lifted palm down to fly.
// The game's autopilot chooses where to walk and steer; the director moves the hand and head.

const pitchQuat = (a) => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
const FLAT = pitchQuat(-0.5); // palm down, fingers level (the emulated hand rests with them raised)
const POINT_FWD = pitchQuat(-0.55); // index finger forward, for the plates
const POINT_DOWN = pitchQuat(-1.15); // index finger down onto the table

export function createDirector(api) {
  const device = window.__device;
  const right = device.hands.right;
  device.primaryInputMode = 'hand';
  let phase = 'intro', since = 0, delta = null, birdsAtWalk = 0;
  const offsets = {}; // index tip relative to the emulated hand, per orientation
  const look = { yaw: 0, pitch: -0.8 };
  const v = new THREE.Vector3(), w = new THREE.Vector3();

  const local = () => api.headLocal;
  const toGlobal = (p) => p.clone().add(delta);
  function handTo(world, pose, quat, tipOffset = null, rate = 4, dt = 1 / 30) {
    right.poseId = pose;
    right.quaternion.set(...quat);
    const target = toGlobal(api.rig.worldToLocal(world.clone()));
    if (tipOffset) target.sub(tipOffset);
    const p = right.position;
    const k = 1 - Math.exp(-dt * rate);
    p.set(p.x + (target.x - p.x) * k, p.y + (target.y - p.y) * k, p.z + (target.z - p.z) * k);
  }
  function lookAt(world, dt, rate = 2) {
    const head = api.rig.localToWorld(local().clone());
    v.copy(world).sub(head);
    const yaw = Math.atan2(-v.x, -v.z), pitch = Math.atan2(v.y, Math.hypot(v.x, v.z));
    const k = 1 - Math.exp(-dt * rate);
    look.yaw += Math.atan2(Math.sin(yaw - look.yaw), Math.cos(yaw - look.yaw)) * k;
    look.pitch += (pitch - look.pitch) * k;
    const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), look.yaw);
    const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), look.pitch);
    const q = qy.multiply(qx);
    device.quaternion.set(q.x, q.y, q.z, q.w);
  }
  // where the index tip sits relative to the emulated hand in a given pose and orientation
  function measure(name, pose, quat) {
    right.poseId = pose;
    right.quaternion.set(...quat);
    const h = api.hands.find((q) => q.handedness === 'right');
    if (!h?.joints) return false;
    const tip = new THREE.Vector3(...h.joints['index-finger-tip']);
    const hand = new THREE.Vector3(right.position.x, right.position.y, right.position.z).sub(delta);
    offsets[name] = tip.sub(hand);
    return true;
  }
  const go = (p) => { phase = p; since = 0; };

  return {
    get phase() { return phase; },
    get done() { return phase === 'end'; },
    update(dt) {
      since += dt;
      const s = api.state();
      if (!delta) delta = new THREE.Vector3(device.position.x, device.position.y, device.position.z).sub(local());
      const table = api.anchorWorld();

      if (phase === 'intro') {
        // measure the fingertip in both pointing poses while the hand is still out of view
        if (since > 0.4 && !offsets.down) measure('down', 'point', POINT_DOWN);
        else if (since > 0.8 && !offsets.fwd) measure('fwd', 'point', POINT_FWD);
        // a pointing hand off to the side: not flat, so the table is not claimed before the beat
        handTo(w.copy(table).add(new THREE.Vector3(0.35, -0.1, 0.3)), 'point', POINT_DOWN);
        lookAt(w.copy(table).add(new THREE.Vector3(0, 0, 0.05)), dt);
        if (since > 2.5 && offsets.down && offsets.fwd) go('calibrate');
      } else if (phase === 'calibrate') {
        // lay the hand flat on the outline and hold still
        handTo(w.copy(table).add(new THREE.Vector3(0.0, 0.03, 0.06)), 'default', FLAT, null, 3, dt);
        lookAt(table, dt);
        if (s.mode === 'choose') go('choose');
      } else if (phase === 'choose') {
        if (s.mode === 'press') return go('press');
        const plate = api.plate('whorl');
        if (!plate) return;
        lookAt(plate.pos, dt, 2.5);
        const poke = since < 1.8 ? 0.05 : -0.01; // hover in front of the plate, then touch it
        handTo(w.copy(plate.pos).addScaledVector(plate.normal, poke), 'point', POINT_FWD, offsets.fwd, 3, dt);
      } else if (phase === 'press') {
        const spot = w.copy(table).add(new THREE.Vector3(0.03, 0, 0.12));
        lookAt(table, dt);
        handTo(spot.add(new THREE.Vector3(0, since < 1.5 ? 0.06 : 0.004, 0)), 'point', POINT_DOWN, offsets.down, 3, dt);
        if (s.mode === 'grow') go('grow');
      } else if (phase === 'grow') {
        handTo(w.copy(table).add(new THREE.Vector3(0.32, 0.05, 0.25)), 'default', FLAT, null, 2, dt);
        lookAt(w.copy(table).add(new THREE.Vector3(0, 0.02, -0.03)), dt, 1);
        if (s.mode === 'walk') { go('walk'); birdsAtWalk = s.woken; }
      } else if (phase === 'walk' || phase === 'walk2') {
        const at = api.walkerWorld();
        if (at) handTo(at.add(new THREE.Vector3(0, 0.006, 0)), 'point', POINT_DOWN, offsets.down, 8, dt);
        lookAt(w.copy(table).lerp(at || table, 0.5), dt, 1.2);
        if (phase === 'walk' && (s.woken - birdsAtWalk >= 5 || since > 26)) go('lift');
        if (phase === 'walk2' && since > 9) go('end');
      } else if (phase === 'lift') {
        // lay the hand flat on the land, then lift it, palm down, fingers spread: the take-off gesture
        const height = since < 1.2 ? 0.05 : 0.2;
        handTo(w.copy(table).add(new THREE.Vector3(0.05, height, 0.12)), 'default', FLAT, null, since < 1.2 ? 4 : 2.5, dt);
        lookAt(w.copy(table).add(new THREE.Vector3(0, 0.1, -0.2)), dt, 1.5);
        if (s.flight !== 'table') go('fly');
      } else if (phase === 'fly') {
        // hold the bird-hand out in front and look where you fly; bank it a little on the turns
        const head = local();
        const roll = Math.sin(since * 0.7) * 0.25;
        const q = new THREE.Quaternion(...FLAT).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -roll));
        right.poseId = 'default';
        right.quaternion.set(q.x, q.y, q.z, q.w);
        right.position.set(head.x + 0.08 + delta.x, head.y - 0.22 + delta.y, head.z - 0.35 + delta.z);
        const fwd = api.flightForward();
        lookAt(api.rig.localToWorld(head.clone()).addScaledVector(fwd, 1).add(new THREE.Vector3(0, -0.12 * api.rig.scale.x, 0)), dt, 1);
        if (s.mode === 'walk' && s.flight === 'table') go('walk2');
      }
    },
  };
}
