import * as THREE from 'three';

// Skin country: the desert between the prints is a patchwork of palms, stitched at the seams. Each
// patch is a palm with its own skin tone and its own heart, head and life lines cut in as canyons,
// under fine dermal ripples. Canyons are cut per vertex (a 220 x 220 grid); the seams and tones are
// found per pixel so the patches meet in clean stitched lines.
// The patchwork itself, shared by both shaders: which palm a point belongs to, where it sits in
// that palm (fingers towards +y, about two units across), its tone, and how close the seam is.
const PALM = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  vec2 hash2(vec2 p) { return vec2(hash(p), hash(p + 17.3)); }
  void palm(vec2 p, out vec2 q, out vec2 id, out float seam) {
    vec2 cell = floor(p / 1.1), best = vec2(0.0);
    float d1 = 9.0, d2 = 9.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 c = cell + vec2(i, j);
      vec2 at = (c + 0.2 + 0.6 * hash2(c)) * 1.1;
      float d = distance(p, at);
      if (d < d1) { d2 = d1; d1 = d; best = at; id = c; } else if (d < d2) d2 = d;
    }
    seam = d2 - d1;
    float a = hash(id + 9.1) * 6.2832;
    q = mat2(cos(a), sin(a), -sin(a), cos(a)) * (p - best) / 0.5;
  }`;

// distance to a crease line y = f(x) over an x range, soft at its ends
const VERT = /* glsl */ `
  ${PALM}
  varying vec2 vP;
  varying float vCanyon, vH;
  float line(vec2 q, float y, float x0, float x1) {
    float fade = smoothstep(x0, x0 + 0.15, q.x) * (1.0 - smoothstep(x1 - 0.15, x1, q.x));
    return mix(1.0, abs(q.y - y), fade);
  }
  void main() {
    vec2 p = position.xz, q, id;
    float seam;
    vP = p;
    palm(p, q, id, seam);
    float r1 = hash(id + 1.3), r2 = hash(id + 2.9), r3 = hash(id + 5.1);
    float heart = line(q, 0.38 + 0.12 * sin(q.x * 2.2 + r1 * 3.0) - 0.1 * q.x, -0.75, 0.75);
    float head = line(q, 0.05 + (0.15 + 0.2 * r2) * q.x + 0.07 * sin(q.x * 3.0 + r2 * 5.0), -0.8, 0.55);
    vec2 thumb = vec2(-0.75, -0.45);
    float life = abs(length(q - thumb) - (0.55 + 0.15 * r3)) + (q.x < thumb.x - 0.05 || q.y < thumb.y - 0.1 ? 1.0 : 0.0);
    float fate = line(q.yx, 0.08 * r1 - 0.03 * q.y, -0.8, 0.3);
    float crease = min(min(heart, head), min(life, fate * 1.6));
    vCanyon = smoothstep(0.07, 0.0, crease) * smoothstep(0.0, 0.12, seam);
    float dune = 0.5 + 0.5 * sin(p.x * 9.0 + sin(p.y * 5.0) * 2.0) * sin(p.y * 7.0 + 1.3);
    float h = -0.003 - dune * 0.003 - vCanyon * 0.02;
    vH = h;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position + vec3(0.0, h, 0.0), 1.0);
  }`;

const FRAG = /* glsl */ `
  ${PALM}
  uniform float uFade;
  uniform vec3 uTones[6];
  varying vec2 vP;
  varying float vCanyon, vH;
  void main() {
    vec2 q, id;
    float seam;
    palm(vP, q, id, seam);
    int k = int(floor(hash(id + 3.7) * 5.999));
    vec3 skin = uTones[0];
    for (int i = 1; i < 6; i++) if (i == k) skin = uTones[i];
    // fine dermal ridges flowing round the palm, like a fingerprint at a larger scale
    float ripple = 0.5 + 0.5 * sin(length(q * vec2(1.0, 1.35)) * 70.0 + sin(q.x * 4.0) * 2.0);
    vec3 col = skin * (0.88 + 0.12 * ripple);
    col *= 1.0 - clamp((dFdx(vH) - dFdy(vH)) * 120.0, -0.15, 0.2); // slopes lit from the far left
    col = mix(col, skin * 0.42, vCanyon * 0.85);                     // the crease canyons
    // stitched seams between palms: a dashed ink line
    float edge = 1.0 - smoothstep(0.0, 0.012, seam);
    float stitch = step(0.5, fract((vP.x + vP.y) * 18.0));
    col = mix(col, vec3(0.09, 0.06, 0.05), edge * (0.3 + 0.5 * stitch));
    float far = smoothstep(1.8, 3.4, length(vP));
    col = mix(col, vec3(1.0, 0.8, 0.66), far);
    gl_FragColor = vec4(col, uFade);
    #include <colorspace_fragment>
  }`;

// From light to deep: every palm in the patchwork is someone's.
export const SKIN = ['#f1c7a8', '#e2a885', '#c98b64', '#a86b47', '#7f4e33', '#5a3524'];

export function createDesert() {
  const uniforms = { uFade: { value: 0 }, uTones: { value: SKIN.map((c) => new THREE.Color(c)) } };
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 7, 220, 220).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({ uniforms, transparent: true, vertexShader: VERT, fragmentShader: FRAG }),
  );
  mesh.renderOrder = -5;
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}
