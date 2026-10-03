import * as THREE from 'three';

// One fingerprint land lying on the table: a relief mesh whose shader draws the ink ridges, the
// flesh-coloured furrows stepping up in terraces, the paths you can walk and the ones you walked.
// Pixel (px, py) of a land (y down, row 0 is the fingertip) maps to the far side of the table.
export const LAND = 0.6; // metres across at table scale
const STEP = 0.003; // metres per terrace at table scale

const VERT = /* glsl */ `
  uniform sampler2D uData;
  uniform float uRelief, uRise, uLift;
  varying vec2 vUv;
  varying float vH;
  void main() {
    vUv = uv;
    vec4 d = texture2D(uData, uv);
    // terraces rise once the land is grown, and slope down to a beach at the coast
    // ponytail: ridges are ink on the terraces, not walls; per-vertex walls make a sawtooth up close
    float h = d.g * uRelief * uRise * uLift * smoothstep(0.5, 0.9, d.b);
    vH = d.g;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position + vec3(0.0, h, 0.0), 1.0);
  }`;

const FRAG = /* glsl */ `
  uniform sampler2D uData, uTrail;
  uniform vec3 uInk, uSand, uGlow;
  uniform float uReveal, uGrowing, uTexel;
  uniform vec2 uPress;
  varying vec2 vUv;
  varying float vH;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec4 d = texture2D(uData, vUv);
    if (d.b < 0.5) discard; // past the coast the real table shows through
    float front = distance(vUv, uPress);
    if (front > uReveal) discard; // not grown this far yet
    float ridge = d.r * 2.0 - 1.0;
    float w = fwidth(ridge) + 0.02;
    float ink = smoothstep(-w, w, ridge);
    vec3 sand = uSand * (0.8 + 0.28 * d.g);                 // higher terraces catch more light
    sand *= 0.84 + 0.16 * smoothstep(0.0, -0.7, ridge);     // shade where the furrow meets a wall
    float slope = clamp((dFdx(vH) - dFdy(vH)) * 45.0, -0.2, 0.25);
    sand *= 1.0 - slope;                                     // terrace steps, lit from the far left
    sand *= 0.97 + 0.06 * hash(vUv);                         // fine grain, per pixel so it never blocks up
    sand = mix(sand, sand * 1.1 + 0.04, d.a * 0.45);         // the walkable centre line
    float walked = texture2D(uTrail, vUv).r;
    sand = mix(sand, uGlow, clamp(walked * 1.3, 0.0, 0.85));
    vec3 col = mix(sand, uInk, ink);
    col += uGlow * (1.0 - smoothstep(0.0, 0.04, uReveal - front)) * 0.55 * uGrowing;
    col *= 0.8 + 0.2 * smoothstep(0.5, 0.64, d.b);           // a darker coastline
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

// Terraces as gentle slopes instead of one-pixel cliffs: up close (when you fly) a stepped height
// field shows every pixel as a sawtooth. Loop furrows run all the way to the coast at mid height,
// so the land also eases down to a beach about three ridges wide. Normalised to 0..1.
function smoothHeight({ size: N, height, levels, mask }) {
  const coast = new Float32Array(N * N); // chamfer distance to the sea, in pixels
  for (let i = 0; i < N * N; i++) coast[i] = mask[i] > 0.5 ? 1e9 : 0;
  const relax = (i, j, c) => { if (coast[j] + c < coast[i]) coast[i] = coast[j] + c; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (x > 0) relax(i, i - 1, 1);
    if (y > 0) { relax(i, i - N, 1); if (x > 0) relax(i, i - N - 1, 1.41); if (x < N - 1) relax(i, i - N + 1, 1.41); }
  }
  for (let y = N - 1; y >= 0; y--) for (let x = N - 1; x >= 0; x--) {
    const i = y * N + x;
    if (x < N - 1) relax(i, i + 1, 1);
    if (y < N - 1) { relax(i, i + N, 1); if (x < N - 1) relax(i, i + N + 1, 1.41); if (x > 0) relax(i, i + N - 1, 1.41); }
  }
  const beach = (3 * N) / 22;
  let a = Float32Array.from(height, (h, i) => {
    const t = Math.min(1, coast[i] / beach);
    return mask[i] > 0.5 ? (h / Math.max(1, levels)) * t * t * (3 - 2 * t) : 0;
  });
  let b = new Float32Array(N * N);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let s = 0, n = 0;
      for (let d = -2; d <= 2; d++) { const q = x + d; if (q >= 0 && q < N) { s += a[y * N + q]; n++; } }
      b[y * N + x] = s / n;
    }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let s = 0, n = 0;
      for (let d = -2; d <= 2; d++) { const q = y + d; if (q >= 0 && q < N) { s += b[q * N + x]; n++; } }
      a[y * N + x] = s / n;
    }
  }
  return a;
}

export function createTerrain({ size = 256, ink = '#16100e', sand = '#e8b89a' } = {}) {
  const N = size;
  const data = new Uint8Array(N * N * 4);
  const tex = new THREE.DataTexture(data, N, N);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  const trail = new Uint8Array(N * N);
  const trailTex = new THREE.DataTexture(trail, N, N, THREE.RedFormat);
  trailTex.magFilter = trailTex.minFilter = THREE.LinearFilter;
  trailTex.needsUpdate = true;

  const uniforms = {
    uData: { value: tex },
    uTrail: { value: trailTex },
    uRelief: { value: 0 },
    uRise: { value: 0 },
    uLift: { value: 1 },
    uReveal: { value: 0 },
    uGrowing: { value: 0 },
    uTexel: { value: 1 / N },
    uPress: { value: new THREE.Vector2(0.5, 0.5) },
    uInk: { value: new THREE.Color(ink) },
    uSand: { value: new THREE.Color(sand) },
    uGlow: { value: new THREE.Color('#ffd49a') },
  };
  const geo = new THREE.PlaneGeometry(1, 1, N - 1, N - 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG }));
  mesh.scale.set(LAND, 1, LAND);
  mesh.frustumCulled = false; // the vertex shader lifts it, the bounding box does not know

  const at = (px, py) => ((N - 1 - py) * N + px) * 4; // texture rows run the other way
  const byte = (v) => Math.max(0, Math.min(255, Math.round(v * 127.5 + 127.5)));
  const v3 = new THREE.Vector3();
  let land = null, smooth = null, growing = false, rising = false, revealSpeed = 0.16;

  const terrain = {
    mesh,
    size: N,
    uniforms,
    get land() { return land; },
    get ready() { return !!land; },

    // start the birth animation from where the fingertip pressed
    begin(px, py, speed = 0.16) {
      revealSpeed = speed;
      land = null;
      data.fill(0);
      trail.fill(0);
      tex.needsUpdate = trailTex.needsUpdate = true;
      uniforms.uPress.value.set((px + 0.5) / N, 1 - (py + 0.5) / N);
      uniforms.uReveal.value = 0;
      uniforms.uRise.value = 0;
      uniforms.uGrowing.value = 1;
      growing = true;
    },

    // a snapshot of the ridges while they grow (Float32Array N*N in -1..1)
    grow(ridge) {
      for (let py = 0; py < N; py++) {
        for (let px = 0; px < N; px++) {
          const v = ridge[py * N + px], k = at(px, py);
          data[k] = byte(v);
          data[k + 2] = Math.abs(v) > 0.04 ? 255 : 0;
        }
      }
      tex.needsUpdate = true;
    },

    // the finished land: heights, coast and paths arrive, and the terraces rise
    set(result, { instant = false } = {}) {
      land = result;
      smooth = smoothHeight(result);
      for (let py = 0; py < N; py++) {
        for (let px = 0; px < N; px++) {
          const i = py * N + px, k = at(px, py);
          data[k] = byte(result.ridge[i]);
          data[k + 1] = Math.round(smooth[i] * 255);
          data[k + 2] = Math.round(result.mask[i] * 255);
          data[k + 3] = result.paths[i] ? 255 : 0;
        }
      }
      tex.needsUpdate = true;
      uniforms.uRelief.value = result.levels * STEP;
      growing = false;
      rising = !instant;
      uniforms.uGrowing.value = instant ? 0 : 1;
      if (instant) {
        uniforms.uReveal.value = 2;
        uniforms.uRise.value = 1;
        uniforms.uGrowing.value = 0;
      }
    },

    // the ink spreads from the press at an even pace (about 7 s across the land) whether or not
    // the worker is already done; the terraces rise once most of the land is visible
    update(dt) {
      const u = uniforms;
      if (growing || land) u.uReveal.value = Math.min(2, u.uReveal.value + dt * (u.uReveal.value > 1.4 ? 2 : revealSpeed));
      if (land && rising && u.uReveal.value > 1.15) {
        u.uRise.value = Math.min(1, u.uRise.value + dt / 1.6);
        u.uGrowing.value = Math.max(0, u.uGrowing.value - dt);
        rising = u.uRise.value < 1;
      }
    },
    get born() { return !!land && uniforms.uRise.value >= 1; },

    // light up the path you walked
    mark(px, py) {
      const x0 = Math.round(px), y0 = Math.round(py);
      for (let y = y0 - 1; y <= y0 + 1; y++) {
        for (let x = x0 - 1; x <= x0 + 1; x++) {
          if (x < 0 || y < 0 || x >= N || y >= N || (land && land.ridge[y * N + x] > 0)) continue;
          trail[(N - 1 - y) * N + x] = 255;
        }
      }
      trailTex.needsUpdate = true;
    },

    // a ridge peeled off as a bird: leave a gap in the wall where it was
    carve(points, radius = 2) {
      if (!land) return;
      for (const [cx, cy] of points) {
        for (let y = Math.round(cy - radius); y <= cy + radius; y++) {
          for (let x = Math.round(cx - radius); x <= cx + radius; x++) {
            if (x < 0 || y < 0 || x >= N || y >= N || (x - cx) ** 2 + (y - cy) ** 2 > radius * radius) continue;
            land.ridge[y * N + x] = -0.6;
            data[at(x, y)] = byte(-0.6);
          }
        }
      }
      tex.needsUpdate = true;
    },

    // terrain height in the mesh's own units (metres at table scale, before the flight lift)
    heightAt(px, py) {
      if (!land) return 0;
      const x = Math.max(0, Math.min(N - 1, Math.round(px))), y = Math.max(0, Math.min(N - 1, Math.round(py)));
      const i = y * N + x;
      const beach = Math.min(1, Math.max(0, (land.mask[i] - 0.5) / 0.4));
      return smooth[i] * uniforms.uRelief.value * uniforms.uRise.value * uniforms.uLift.value * beach * beach * (3 - 2 * beach);
    },

    // land pixel -> world point on the surface (optionally lifted), and back
    worldOf(px, py, out = new THREE.Vector3(), lift = 0) {
      out.set((px + 0.5) / N - 0.5, terrain.heightAt(px, py) + lift, (py + 0.5) / N - 0.5);
      return mesh.localToWorld(out);
    },
    pixelOf(world) {
      mesh.worldToLocal(v3.copy(world));
      return [(v3.x + 0.5) * N - 0.5, (v3.z + 0.5) * N - 0.5, v3.y];
    },
  };
  return terrain;
}
