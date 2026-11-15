// src/world/scene.js
import * as THREE from 'three';
import { FOG_DENSITY } from '../view.js';

// The air around the world: a world-space sky with sun and high cirrus, and the shared colours and
// GLSL every shader uses, so the land fades into the sky's own colour in every direction and the
// horizon has no edge.

export const TONES = [
  '#f3cdb3', '#ebbd9f', '#f7dbc6', '#e6b08f', '#dba282', '#efc0a2', '#d2996f', '#c68a61', '#dcaa86',
  '#ae7350', '#a0663f', '#bc8462', '#87573b', '#7a4b31', '#97674c', '#5f3b29', '#533122', '#6e4836',
];
export const HORIZON = '#efdcc4';

export const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }`;
// the sky's colour in a world direction, shared by the sky and the terrain's haze so they meet without
// a seam; needs uZenith, uHorizon, uSunColor and uSunDir
export const SKY_GLSL = /* glsl */ `
  vec3 skyColor(vec3 d) {
    vec3 c = mix(uHorizon, uZenith, pow(clamp(d.y, 0.0, 1.0), 0.55));
    float s = max(dot(d, uSunDir), 0.0);
    return c + uSunColor * (pow(s, 8.0) * 0.2 + pow(s, 64.0) * 0.35);
  }`;
// water that reflects the sky; needs NOISE_GLSL and SKY_GLSL before it
export const WATER_GLSL = /* glsl */ `
  // px: metres per pixel, so the ripples calm down with distance instead of glittering
  // depth: metres of water (0 at the bank), for the colour and the foam along the shore
  vec3 water(vec3 p, vec3 V, float depth, float time, float px) {
    float near = 1.0 - smoothstep(2.0, 14.0, px); // ripples and foam calm down with distance instead of glittering
    vec2 q = p.xz * 0.03, a = q + vec2(time * 0.05, time * 0.03), b = q * 2.3 - vec2(time * 0.04, -time * 0.06);
    vec2 slope = (vec2(vnoise(a * 3.0), vnoise(a * 3.0 + 7.3)) - 0.5) * 0.22 + (vec2(vnoise(b * 5.0 + 3.1), vnoise(b * 5.0 + 9.7)) - 0.5) * 0.12;
    vec3 n = normalize(vec3(slope.x * near, 1.0, slope.y * near));
    vec3 col = mix(vec3(0.30, 0.50, 0.53), vec3(0.06, 0.17, 0.26), smoothstep(0.0, 12.0, depth)); // the River palette: pale shallows, deep blue
    float fres = pow(1.0 - max(dot(n, V), 0.0), 4.0);
    col = mix(col, skyColor(reflect(-V, n)), 0.06 + 0.4 * fres); // the pale sky would wash the water out at grazing angles
    vec3 h = normalize(V + uSunDir);
    col += uSunColor * (pow(max(dot(n, h), 0.0), 140.0) * 1.4 + pow(max(dot(n, h), 0.0), 18.0) * 0.06); // sun glints on the ripples
    float shore = 1.0 - smoothstep(0.3, 3.5, depth), lace = vnoise(p.xz * 0.09 + vec2(time * 0.25, -time * 0.18)) * 0.6 + vnoise(p.xz * 0.31 - time * 0.4) * 0.4;
    col = mix(col, vec3(0.93, 0.9, 0.84), smoothstep(0.55, 0.8, lace + shore * 0.55) * shore * near * 0.8); // foam lace at the banks
    return col;
  }`;
export const INK_GLSL = 'const vec3 INK = vec3(0.0103, 0.0065, 0.0052);';

const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = (modelMatrix * vec4(position, 0.0)).xyz; // a world direction: the sun stays put when you turn
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const SKY_FRAG = /* glsl */ `
  uniform vec3 uZenith, uHorizon, uSunColor, uSunDir;
  uniform float uTime;
  varying vec3 vDir;
  ${NOISE_GLSL}
  ${SKY_GLSL}
  void main() {
    vec3 d = normalize(vDir);
    vec3 col = skyColor(d);
    col += uSunColor * smoothstep(0.9993, 0.9997, dot(d, uSunDir)) * 1.5; // the sun's disc
    vec2 q = d.xz / (d.y + 0.12) * 1.6 + vec2(uTime * 0.004, 0.0);
    float cirrus = smoothstep(0.55, 0.9, vnoise(q * vec2(1.0, 6.0)) * 0.7 + vnoise(q * 5.0) * 0.3);
    col = mix(col, vec3(1.0, 0.97, 0.93), cirrus * 0.35 * smoothstep(0.02, 0.3, d.y));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

export function createWorldScene() {
  const shared = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(-0.55, 0.42, 0.72).normalize() },
    uFogColor: { value: new THREE.Color(HORIZON) },
    uFogDensity: { value: FOG_DENSITY },
    uZenith: { value: new THREE.Color('#8fa9bd') },
    uHorizon: { value: new THREE.Color(HORIZON) },
    uSunColor: { value: new THREE.Color('#ffcf9a') },
    uTones: { value: TONES.map((c) => new THREE.Color(c)) },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(30000, 48, 24), // inside the far plane
    new THREE.ShaderMaterial({ uniforms: shared, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false }),
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return { shared, sky };
}
