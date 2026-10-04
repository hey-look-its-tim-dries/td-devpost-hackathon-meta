// src/world/scene.js
import * as THREE from 'three';
import { SOURCE_RADIUS } from './founders.js';
import { FOG_DENSITY } from '../view.js';

// The world around the hands: a warm paper sky, the Paper Sea (parchment with faint contour rings
// round the Source) and the Source itself, a lake in the middle. Colours live in uniforms shared by
// every shader, so the hands and the sea fog to the same haze.

export const TONES = [
  '#f3cdb3', '#ebbd9f', '#f7dbc6', '#e6b08f', '#dba282', '#efc0a2', '#d2996f', '#c68a61', '#dcaa86',
  '#ae7350', '#a0663f', '#bc8462', '#87573b', '#7a4b31', '#97674c', '#5f3b29', '#533122', '#6e4836',
];
export const HAZE = '#ead9c2';

export const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }`;
// needs uSky, uSunDir declared before it
export const WATER_GLSL = /* glsl */ `
  vec3 water(vec3 p, vec3 V, float depth, float time) {
    vec2 q = p.xz * 0.09 + vec2(time * 0.04, time * 0.025);
    vec3 n = normalize(vec3((vnoise(q * 3.0) - 0.5) * 0.2, 1.0, (vnoise(q * 4.0 + 7.3) - 0.5) * 0.2));
    vec3 col = mix(vec3(0.1, 0.22, 0.29), vec3(0.02, 0.07, 0.13), clamp(depth / 4.0, 0.0, 1.0));
    float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
    col = mix(col, uSky, 0.12 + 0.55 * fres);
    col += vec3(1.0, 0.9, 0.75) * pow(max(dot(n, normalize(V + uSunDir)), 0.0), 80.0) * 0.35;
    return col;
  }`;
export const INK_GLSL = 'const vec3 INK = vec3(0.0103, 0.0065, 0.0052);';

const SEA_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const SEA_FRAG = /* glsl */ `
  uniform vec3 uSky, uSunDir, uFogColor, uPaper;
  uniform float uFogDensity, uTime, uSource;
  varying vec3 vWorld;
  ${NOISE_GLSL}
  ${WATER_GLSL}
  ${INK_GLSL}
  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    float r = length(vWorld.xz);
    vec3 col;
    if (r < uSource) {
      col = water(vWorld, V, mix(5.0, 0.6, smoothstep(uSource * 0.5, uSource, r)), uTime);
    } else {
      float fibre = vnoise(vWorld.xz * 0.04) * 0.05 + vnoise(vWorld.xz * 0.5) * 0.03;
      float ring = smoothstep(0.96, 1.0, cos((r - uSource) / 90.0 * 6.2831853)) * 0.06 * (1.0 - smoothstep(1200.0, 3500.0, r));
      col = uPaper * (1.0 - fibre - ring);
    }
    col = mix(col, INK, (1.0 - smoothstep(0.0, 4.0, abs(r - uSource))) * 0.7); // the Source's inked shore
    float f = 1.0 - exp(-pow(length(cameraPosition - vWorld) * uFogDensity, 2.0));
    gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
    #include <colorspace_fragment>
  }`;
const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const SKY_FRAG = /* glsl */ `
  uniform vec3 uFogColor, uZenith, uSunDir;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    vec3 col = mix(uFogColor, uZenith, pow(clamp(d.y, 0.0, 1.0), 0.6));
    col += vec3(1.0, 0.85, 0.6) * pow(max(dot(d, uSunDir), 0.0), 64.0) * 0.5;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

export function createWorldScene() {
  const shared = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(-0.5, 0.75, 0.35).normalize() },
    uFogColor: { value: new THREE.Color(HAZE) },
    uFogDensity: { value: FOG_DENSITY },
    uSky: { value: new THREE.Color('#a9c3cc') },
    uTones: { value: TONES.map((c) => new THREE.Color(c)) },
  };
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(60000, 60000).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: { ...shared, uPaper: { value: new THREE.Color('#e9dcc6') }, uSource: { value: SOURCE_RADIUS } },
      vertexShader: SEA_VERT, fragmentShader: SEA_FRAG,
    }),
  );
  sea.position.y = -3;
  // drawn after the hands (whose pixels then hide it for free), pushed back in depth so far coasts never z-fight
  sea.renderOrder = 1;
  Object.assign(sea.material, { polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 4 });
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(10000, 32, 16), // inside the far plane
    new THREE.ShaderMaterial({
      uniforms: { ...shared, uZenith: { value: new THREE.Color('#d4bfa3') } },
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false,
    }),
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return { shared, sea, sky };
}
