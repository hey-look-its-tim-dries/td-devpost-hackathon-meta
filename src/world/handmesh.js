// src/world/handmesh.js
import * as THREE from 'three';
import { NOISE_GLSL, WATER_GLSL, INK_GLSL } from './scene.js';

// One Hand as a mesh: a grid over its bounding box, lifted by the baked heights. The fragment
// shader draws the skin's ridges from the baked phase (so they stay sharp however low you fly),
// pores on the crests, the inked print lines, water in rivers and canals, stitches over the canals
// and an ink coastline.
const VERT = /* glsl */ `
  uniform sampler2D uA;
  uniform vec2 uTexel;
  uniform float uCell;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    float h = texture2D(uA, uv).r;
    vec2 dx = vec2(uTexel.x * 2.0, 0.0), dy = vec2(0.0, uTexel.y * 2.0);
    float sx = (texture2D(uA, uv + dx).r - texture2D(uA, uv - dx).r) / (4.0 * uCell);
    float sy = (texture2D(uA, uv + dy).r - texture2D(uA, uv - dy).r) / (4.0 * uCell);
    vec4 world = modelMatrix * vec4(position + vec3(0.0, h, 0.0), 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * vec3(-sx, 1.0, sy)); // the plane's +v runs along -z
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

const FRAG = /* glsl */ `
  uniform sampler2D uA;
  uniform sampler2D uB;
  uniform vec3 uTones[18];
  uniform vec3 uSunDir, uFogColor, uSky;
  uniform float uFogDensity, uTime;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;
  ${NOISE_GLSL}
  ${WATER_GLSL}
  ${INK_GLSL}
  // perturb a normal by a height given per pixel (Mikkelsen, bump mapping without tangents)
  vec3 bump(vec3 n, float h) {
    vec3 dpx = dFdx(vWorld), dpy = dFdy(vWorld);
    vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
    return normalize(abs(det) * n - grad);
  }
  void main() {
    vec4 a = texture2D(uA, vUv);
    vec4 b = texture2D(uB, vUv);
    float code = floor(b.b * 255.0 + 0.5);
    float coast = step(15.5, code);
    float kind = code - 16.0 * coast;
    if (kind < 0.5) discard;
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 n = normalize(vNormal);
    float r = a.g / max(length(a.gb), 1e-3); // cos(2π·phase): +1 on a ridge crest
    vec3 col;
    if (kind > 3.5) {
      col = water(vWorld, V, max(a.a, 0.5), uTime);
      if (kind > 4.5) col = mix(col, INK, smoothstep(0.8, 0.9, r) * 0.85); // stitches over a canal
    } else {
      float aa = 1.0 - smoothstep(0.6, 1.6, length(fwidth(a.gb))); // fade ridges finer than a pixel
      float s = b.a * aa;
      float pore = smoothstep(0.55, 0.8, r) * step(0.88, hash(floor(vWorld.xz * 1.2)));
      n = bump(n, (r * 0.5 - pore * 0.35) * s);
      vec3 skin = uTones[int(b.r * 255.0 + 0.5)];
      col = skin * (0.92 + 0.12 * r * s);
      col = mix(col, skin * vec3(0.7, 0.52, 0.48), (0.5 - 0.5 * r) * s * 0.5); // furrows deeper and redder
      col = mix(col, INK, smoothstep(0.86, 0.97, r) * s * (kind < 1.5 ? 0.6 : 0.2)); // prints inked darker
      col *= 0.38 * (0.6 + 0.4 * n.y) + 0.9 * max(dot(n, uSunDir), 0.0);
    }
    col = mix(col, INK, coast * 0.8);
    float f = 1.0 - exp(-pow(length(cameraPosition - vWorld) * uFogDensity, 2.0));
    gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
    #include <colorspace_fragment>
  }`;

// d: the worker's message (w, h, cell, x0, y0, texA, info); pose: { x, z, rot, mirror }
export function createHandMesh(d, pose, shared) {
  const texA = new THREE.DataTexture(d.texA, d.w, d.h, THREE.RGBAFormat, THREE.HalfFloatType);
  texA.magFilter = texA.minFilter = THREE.LinearFilter;
  texA.needsUpdate = true;
  const texB = new THREE.DataTexture(d.info, d.w, d.h, THREE.RGBAFormat, THREE.UnsignedByteType); // nearest
  texB.needsUpdate = true;
  const W = d.w * d.cell, H = d.h * d.cell;
  // the plane lies in hand coordinates: X along x, Y along -z; uv (0, 0) is the cell at (x0, y0)
  const geo = new THREE.PlaneGeometry(W, H, Math.round(d.w / 3), Math.round(d.h / 3))
    .rotateX(-Math.PI / 2)
    .translate(d.x0 + W / 2, 0, -(d.y0 + H / 2));
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...shared, uA: { value: texA }, uB: { value: texB }, uTexel: { value: new THREE.Vector2(1 / d.w, 1 / d.h) }, uCell: { value: d.cell } },
    vertexShader: VERT, fragmentShader: FRAG,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(pose.x, 0, pose.z);
  mesh.rotation.y = -pose.rot; // matches toWorld(): fingers along (sin rot, -cos rot)
  if (pose.mirror) mesh.scale.x = -1; // three.js flips the face winding for mirrored meshes itself
  mesh.frustumCulled = false; // the heights are applied on the GPU
  return mesh;
}
