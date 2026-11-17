// src/gnomes/dust.js
// Sand kicked up by a gnome dragged over the ground: puffs that billow out, rise a little and fade.
import * as THREE from 'three';

const N = 240, LIFE = 1.4;

export function createDust(scene) {
  const at = new Float32Array(N * 3), vel = new Float32Array(N * 3), age = new Float32Array(N).fill(LIFE), size = new Float32Array(N);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(at, 3));
  g.setAttribute('age', new THREE.BufferAttribute(age, 1));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: `attribute float age, size; varying float vA;
      void main() { vA = age / ${LIFE.toFixed(1)}; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * (0.4 + vA) * 900.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vA;
      void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5 || vA >= 1.0) discard; gl_FragColor = vec4(0.86, 0.72, 0.5, (1.0 - d * 2.0) * 0.55 * (1.0 - vA)); }`,
  }));
  pts.frustumCulled = false;
  scene.add(pts);
  let next = 0;
  return {
    // a puff of k grains at the heels, thrown back against the direction of travel (dx, dz: unit)
    puff(x, y, z, s, dx, dz, k = 3) {
      for (let i = 0; i < k; i++) {
        const j = next++ % N, o = j * 3, sp = s * (0.6 + Math.random());
        at[o] = x + (Math.random() - 0.5) * s * 0.6; at[o + 1] = y; at[o + 2] = z + (Math.random() - 0.5) * s * 0.6;
        vel[o] = -dx * sp + (Math.random() - 0.5) * sp; vel[o + 1] = sp * (0.4 + Math.random() * 0.6); vel[o + 2] = -dz * sp + (Math.random() - 0.5) * sp;
        age[j] = 0; size[j] = s * (0.5 + Math.random());
      }
    },
    update(dt) {
      for (let j = 0; j < N; j++) {
        if (age[j] >= LIFE) continue;
        const o = j * 3, damp = Math.exp(-dt * 2.2);
        age[j] += dt; vel[o] *= damp; vel[o + 1] *= damp; vel[o + 2] *= damp;
        at[o] += vel[o] * dt; at[o + 1] += vel[o + 1] * dt; at[o + 2] += vel[o + 2] * dt;
      }
      g.attributes.position.needsUpdate = true; g.attributes.age.needsUpdate = true; g.attributes.size.needsUpdate = true;
    },
  };
}
