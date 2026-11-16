// src/world/surface.js
import * as THREE from 'three';
import { selectNodes } from './cdlod.js';
import { WILD_GLSL } from './wild.js';
import { WORLD } from './units.js';
import { NOISE_GLSL, WATER_GLSL, INK_GLSL, SKY_GLSL } from './scene.js';

// The whole world as one surface: level-of-detail patches round you (cdlod.js), lifted to the higher
// of the endless wilderness and the Hands. The Hands' baked textures live in one texture array.
// Detail is layered per pixel, each layer fading before it gets finer than a pixel: patchwork tones
// and stitched seams, dermal ridges and whorls, pores, wrinkle networks, grain. Everything fades into
// the sky's own colour.
const N = 32; // grid cells per full patch
const MAX_HANDS = 64, LEVELS = 12, LEAF = 48, MAX_NODES = 600, GROW = 16; // texture layers grow 16 at a time: a Hand is about 6 MB of texture

const COMMON = /* glsl */ `
  #define MAX_HANDS ${MAX_HANDS}
  uniform highp sampler2DArray uHandA;
  uniform highp sampler2DArray uHandB;
  uniform int uHandCount;
  uniform vec4 uHandPose[MAX_HANDS]; // x, z (world m), cos, sin of the rotation
  uniform vec4 uHandBox[MAX_HANDS];  // x0, y0 (hand m), mirror (1 or -1), rise (0..1); every Hand's size is uLayer
  uniform vec2 uLayer;
  uniform float uCell, uWorld;
  ${WILD_GLSL}
  // the highest Hand at p: its height in world metres (or -1e9), its texture coordinates and info
  float handAt(vec2 p, out vec3 tc, out vec4 info) {
    float best = -1e9;
    tc = vec3(0.0);
    info = vec4(0.0);
    for (int i = 0; i < MAX_HANDS; i++) {
      if (i >= uHandCount) break;
      vec4 pose = uHandPose[i], box = uHandBox[i]; // two vectors a Hand: 64 Hands fit any WebGL2 uniform budget
      vec2 d = (p - pose.xy) / uWorld;
      vec2 c = (vec2((pose.z * d.x + pose.w * d.y) * box.z, pose.w * d.x - pose.z * d.y) - box.xy) / uCell;
      if (c.x < 0.5 || c.y < 0.5 || c.x > uLayer.x - 0.5 || c.y > uLayer.y - 0.5) continue;
      vec3 t = vec3(c / uLayer, float(i));
      float hm = textureLod(uHandA, t, 0.0).r * box.w; // a laid Hand rises out of the land
      if (hm < 0.15) continue; // outside this Hand: heights are 0 outside and 0.3 or more inside, smooth at any distance
      if (hm * uWorld > best) { best = hm * uWorld; tc = t; info = texelFetch(uHandB, ivec3(ivec2(c), i), 0); }
    }
    return best;
  }`;

const VERT = /* glsl */ `
  ${COMMON}
  attribute vec4 node; // x, z, size, level
  uniform float uLeaf, uN, uMinY, uMaxY;
  uniform float uMorphStart[${LEVELS}], uMorphEnd[${LEVELS}];
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vWild;
  // the world's height at p, with the ridges as geometry where the grid is fine enough to hold them
  float surface(vec2 p, float spacing, out float wildH) {
    wildH = wild(p);
    float h = max(wildH, 0.0);
    vec3 tc;
    vec4 info;
    float hh = handAt(p, tc, info);
    float fine = 1.0 - sstep(4.0, 10.0, spacing);
    if (hh > -1e8) { // inside a Hand its own surface wins over the plain
      vec4 a = textureLod(uHandA, tc, 0.0);
      return hh + fine * a.g / max(length(a.gb), 1e-3) * info.a * 5.0;
    }
    return fine > 0.0 ? h + fine * cos(6.2831853 * wildPhase(p)) * 3.0 * sstep(0.0, 20.0, wildH) : h; // most vertices skip the ridges
  }
  void main() {
    int level = int(node.w + 0.5);
    float s = uLeaf * exp2(node.w) / uN;
    vec2 grid = position.xz;
    vec2 xz = node.xy + grid * s;
    vec2 dxz = xz - cameraPosition.xz;
    float dy = max(max(uMinY - cameraPosition.y, 0.0), cameraPosition.y - uMaxY);
    float k = clamp((sqrt(dot(dxz, dxz) + dy * dy) - uMorphStart[level]) / (uMorphEnd[level] - uMorphStart[level]), 0.0, 1.0);
    xz -= mod(grid, 2.0) * s * k; // odd vertices slide onto the coarser grid
    float sp = s * (1.0 + k), w, w1, w2;
    float h = surface(xz, sp, w);
    float hx = surface(xz + vec2(sp, 0.0), sp, w1), hz = surface(xz + vec2(0.0, sp), sp, w2);
    vNormal = normalize(vec3(h - hx, sp, h - hz));
    vWild = w;
    vWorld = vec3(xz.x, h, xz.y);
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }`;

const FRAG = /* glsl */ `
  ${COMMON}
  uniform vec3 uTones[18];
  uniform ivec4 uCharted[MAX_HANDS / 4]; // one bit mask of charted handbits per Hand (spec 6.4)
  uniform vec3 uReveal; // the handbit being inked in now: layer, index, start time
  uniform vec3 uSunDir, uZenith, uHorizon, uSunColor;
  uniform float uFogDensity, uTime;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vWild;
  ${NOISE_GLSL}
  ${SKY_GLSL}
  ${WATER_GLSL}
  ${INK_GLSL}
  const vec3 SUNLIGHT = vec3(1.0, 0.95, 0.88); // the light itself is near white; uSunColor tints the glow
  vec3 hue(float h) { return clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); } // a full-strength colour for the foxfire look
  // fine skin at p, faded by the pixel footprint px (metres): organic wrinkle lines crossing the ridges,
  // round pores on the crests (r is the ridge, +1 on a crest), grain. x: height in metres, y: darkening.
  vec2 skinDetail(vec2 p, float r, float px, int k) {
    vec2 w = p + 40.0 * (vec2(vnoise(p / 150.0, k), vnoise(p / 150.0, k + 1)) - 0.5);
    // soft grooves a few pixels wide (thin lines would break into dots), fading out before they alias
    float wr = 0.0, fw = 0.0;
    if (px < 5.0) { // the wrinkle cells only where they can be seen (no derivatives in here)
      wr = (1.0 - sstep(0.0, max(2.5, px * 2.0), cells(w, 110.0, k + 2).y)) * (1.0 - sstep(2.0, 5.0, px)) * (0.4 + 0.6 * vnoise(p / 300.0, k + 3));
      fw = (1.0 - sstep(0.0, max(0.8, px * 2.0), cells(w * 1.7, 40.0, k + 4).y)) * (1.0 - sstep(0.5, 1.5, px)) * 0.6;
    }
    vec2 c = floor(p / 6.0);
    float pd = length(fract(p / 6.0) - 0.5) * 6.0;
    float pore = step(0.86, hashI(int(c.x), int(c.y), k + 5)) * (1.0 - sstep(0.6, 1.3, pd)) * sstep(0.5, 0.85, r) * (1.0 - sstep(0.8, 2.5, px));
    float grain = (vnoise(p / 1.3, k + 6) - 0.5) * (1.0 - sstep(0.3, 1.0, px));
    return vec2(-wr * 1.5 - fw * 0.5 - pore * 1.2 + grain * 0.3, wr * 0.25 + fw * 0.15 + pore * 0.35);
  }
  void main() {
    vec2 p = vWorld.xz;
    vec3 dpx = dFdx(vWorld), dpy = dFdy(vWorld);
    float px = max(length(dpx), length(dpy)); // metres per pixel
    float fwH = max(fwidth(vWorld.y), 1e-3); // metres of height per pixel, for the foxfire look's contour lines (taken here, in uniform control flow)
    vec3 V = normalize(cameraPosition - vWorld), n = normalize(vNormal);
    vec3 tc;
    vec4 info;
    float hh = handAt(p, tc, info);
    vec4 a = textureLod(uHandA, tc, 0.0);
    float hfw = length(fwidth(a.gb));
    float wph = wildPhase(p), wfw = fwidth(wph);
    bool onHand = hh > -1e8;
    vec3 albedo;
    float bh = 0.0, sheen = 0.0;
    bool isWater = false; // (water() is the shading function)
    float depth = 0.0;
    float nRidge = 0.0, nEdge = 0.0, nDim = 1.0, nCoast = 0.0; // what the foxfire look draws in light: ridges, borders, the coast; dimmed where uncharted
    vec3 nTone = vec3(1.0, 0.0, 1.0);
    if (onHand) {
      float code = floor(info.b * 255.0 + 0.5), kind = code - 16.0 * step(15.5, code);
      float coast = 1.0 - sstep(0.16, 0.3, a.r); // the inked coastline, from the smooth heights
      if (a.a > 0.5) { // rivers and canals, from the smooth water depth
        isWater = true;
        depth = a.a * uWorld; // 0 at the bank: the foam needs it
        albedo = INK * step(4.5, kind) * smoothstep(0.8, 0.9, a.g / max(length(a.gb), 1e-3)); // stitches over canals
      } else {
        float r = a.g / max(length(a.gb), 1e-3), s = info.a * (1.0 - sstep(0.6, 1.6, hfw));
        vec2 det = skinDetail(p, r, px, 100);
        vec3 skin = uTones[int(info.r * 255.0 + 0.5)];
        albedo = skin * (0.92 + 0.12 * r * s);
        albedo = mix(albedo, skin * vec3(0.7, 0.52, 0.48), (0.5 - 0.5 * r) * s * 0.5);
        albedo = mix(albedo, INK, sstep(0.86, 0.97, r) * s * (kind < 1.5 ? 0.6 : 0.2));
        albedo *= 1.0 - det.y;
        bh = r * 5.0 * s + det.x;
        sheen = sstep(0.5, 0.9, r) * s;
        nRidge = sstep(0.8, 0.97, r) * s; nTone = hue(floor(info.r * 255.0 + 0.5) * 0.173 + 0.55);
        // charting: an uncharted handbit is blank parchment with an inked border, until you fly over it
        int layer = int(tc.z + 0.5), hb = int(info.g * 255.0 + 0.5) - 1;
        ivec4 q = uCharted[layer / 4];
        int m = (layer & 3) == 0 ? q.x : (layer & 3) == 1 ? q.y : (layer & 3) == 2 ? q.z : q.w;
        float blank = hb >= 0 && hb < 31 && ((m >> hb) & 1) == 0 ? 1.0 : 0.0;
        if (layer == int(uReveal.x + 0.5) && hb == int(uReveal.y + 0.5)) { // the ink spreads in, blot by blot
          float t = (uTime - uReveal.z) / 1.4;
          blank = 1.0 - sstep(-0.1, 0.1, t * 1.25 - 0.1 - vnoise(p / 45.0, 7) * 0.6 - vnoise(p / 9.0, 8) * 0.4);
        }
        if (blank > 0.0) {
          ivec2 cc = ivec2(tc.xy * uLayer);
          float edge = 0.0;
          for (int k = 0; k < 4; k++) {
            ivec2 o = k == 0 ? ivec2(2, 0) : k == 1 ? ivec2(-2, 0) : k == 2 ? ivec2(0, 2) : ivec2(0, -2);
            float g = texelFetch(uHandB, ivec3(cc + o, layer), 0).g;
            edge = max(edge, g > 0.0 && abs(g - info.g) > 0.001 ? 1.0 : 0.0);
          }
          vec3 parch = vec3(0.96, 0.84, 0.68) * (0.9 + 0.1 * r); // warm parchment: the light and haze cool it
          albedo = mix(albedo, parch, blank * 0.5); // a wash, so the world keeps its look before you chart it
          albedo = mix(albedo, INK, blank * edge * 0.75);
          sheen *= 1.0 - blank;
          nDim = 1.0 - 0.75 * blank; nEdge = blank * edge;
        }
      }
      albedo = mix(albedo, INK, coast * 0.8);
      nCoast = coast;
    } else if (vWorld.y < 0.5) {
      isWater = true;
      depth = min(30.0, -vWild * 25.0); // the wild lakes sit a few decimetres under sea level: read them as open water, shallow only at the shore
    } else {
      // the patchwork: one palm per (wavy) cell, each its own skin, stitched to its neighbours
      vec3 cell = cells(p + 300.0 * (vec2(vnoise(p / 2500.0, 41), vnoise(p / 2500.0, 42)) - 0.5), 5000.0, 40);
      vec3 skin = uTones[int(cell.z * 17.99)];
      float aa = 1.0 - sstep(0.1, 0.25, wfw), r = cos(6.2831853 * wph); // fade before the ridges reach the pixel grid (no moire)
      vec2 det = skinDetail(p, r, px, 200);
      float seam = 1.0 - sstep(3.0, 7.0, cell.y), stitch = step(0.5, fract((p.x + p.y) / 16.0));
      albedo = skin * (0.9 + 0.12 * r * aa);
      albedo = mix(albedo, skin * vec3(0.68, 0.5, 0.46), (0.5 - 0.5 * r) * aa * 0.5);
      albedo *= 1.0 - det.y;
      albedo = mix(albedo, skin * 1.12, sstep(350.0, 650.0, vWorld.y) * 0.4); // pale fold crests
      albedo = mix(albedo, INK, seam * (0.15 + 0.25 * stitch));
      bh = r * 3.0 * aa + det.x;
      sheen = sstep(0.5, 0.9, r) * aa;
      nRidge = sstep(0.8, 0.97, r) * aa * 0.4; nEdge = seam * 0.5; nTone = hue(cell.z * 3.1);
    }
    // bump from the detail height (derivatives taken here, in uniform control flow)
    vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
    float det = dot(dpx, r1);
    n = normalize(abs(det) * n - sign(det) * (dFdx(bh) * r1 + dFdy(bh) * r2));
    vec3 col;
    if (isWater) {
      col = water(vWorld, V, depth, uTime, px);
      col = mix(col, albedo, step(0.001, length(albedo)));
    } else {
      float ndl = dot(n, uSunDir), dif = smoothstep(-0.1, 1.0, ndl); // the sun: a firmer light, so the land has form
      vec3 sky = mix(vec3(0.46, 0.52, 0.62), uZenith, 0.5), bounce = vec3(0.62, 0.45, 0.36); // cool from the sky, warm off the land
      vec3 amb = mix(bounce, sky, 0.5 + 0.5 * n.y) * mix(0.62, 1.0, smoothstep(0.35, 0.9, n.y)); // steep walls and canyon sides see less sky
      col = albedo * (amb * 0.5 + SUNLIGHT * dif * 1.05);
      col += albedo * vec3(0.42, 0.1, 0.05) * smoothstep(-0.25, 0.15, ndl) * (1.0 - smoothstep(0.15, 0.6, ndl)) * 0.55; // skin: light glows red where it grazes
      col += uSunColor * pow(max(dot(n, normalize(V + uSunDir)), 0.0), 36.0) * 0.22 * sheen;
      col += albedo * vec3(0.25, 0.07, 0.04) * pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.5; // warm rim
    }
    if (uTrip > 0.001 && !isWater) {
      // foxfire: the land goes dark and is drawn in light. Contour lines every 25 m (bold every 100) follow its
      // form, a magenta grid lies over it, each Hand's ridges glow in its own colour; uncharted land stays dim.
      float far = 1.0 - sstep(6.0, 40.0, px);
      float l25 = (1.0 - smoothstep(0.0, 1.4, abs(fract(vWorld.y / 25.0 + 0.5) - 0.5) * 25.0 / fwH)) * smoothstep(3.0, 9.0, 25.0 / fwH);
      float l100 = (1.0 - smoothstep(0.0, 2.2, abs(fract(vWorld.y / 100.0 + 0.5) - 0.5) * 100.0 / fwH)) * smoothstep(3.0, 9.0, 100.0 / fwH);
      vec2 gq = abs(fract(p / 250.0 + 0.5) - 0.5) * 250.0 / px;
      float grid = (1.0 - smoothstep(0.0, 1.4, min(gq.x, gq.y))) * smoothstep(4.0, 12.0, 250.0 / px);
      vec3 nc = mix(vec3(0.014, 0.0, 0.035), vec3(0.05, 0.01, 0.11), 0.5 + 0.5 * n.y);
      nc += nTone * nRidge * 0.6 * far;
      nc += vec3(0.0, 1.0, 1.0) * (l25 * 0.3 + l100 * 0.85) * (onHand ? 1.0 : 0.5);
      nc += vec3(1.0, 0.0, 1.0) * (grid * (onHand ? 0.45 : 0.25) + nEdge * 0.9) + vec3(0.7, 1.0, 1.0) * nCoast;
      col = mix(col, nc * nDim, uTrip);
    }
    float dist = length(cameraPosition - vWorld);
    col = mix(col, skyColor(-V), 1.0 - exp(-pow(dist * uFogDensity, 2.0)));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

function grid(cells) {
  const pos = [], index = [];
  for (let j = 0; j <= cells; j++) for (let i = 0; i <= cells; i++) pos.push(i, 0, j);
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
    const a = j * (cells + 1) + i, b = a + 1, c = a + cells + 1, d = c + 1;
    index.push(a, c, b, b, c, d);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.setAttribute('node', new THREE.InstancedBufferAttribute(new Float32Array(MAX_NODES * 4), 4).setUsage(THREE.DynamicDrawUsage));
  g.instanceCount = 0;
  return g;
}

const box = new THREE.Box3(), v0 = new THREE.Vector3(), v1 = new THREE.Vector3();

export function createSurface(shared) {
  let layer = null, A = null, B = null, texA = null, texB = null;
  const uniforms = {
    ...shared,
    uHandA: { value: null }, uHandB: { value: null }, uHandCount: { value: 0 },
    uHandPose: { value: Array.from({ length: MAX_HANDS }, () => new THREE.Vector4()) },
    uHandBox: { value: Array.from({ length: MAX_HANDS }, () => new THREE.Vector4()) },
    uLayer: { value: new THREE.Vector2(1, 1) }, uCell: { value: 0.75 }, uWorld: { value: WORLD },
    uLeaf: { value: LEAF }, uN: { value: N }, uMinY: { value: -120 }, uMaxY: { value: 750 },
    uMorphStart: { value: new Array(LEVELS).fill(0) }, uMorphEnd: { value: new Array(LEVELS).fill(1) },
    uCharted: { value: new Int32Array(MAX_HANDS).fill(0x7fffffff) }, uReveal: { value: new THREE.Vector3(-1, -1, 0) }, // every Hand charted until the game says otherwise
  };
  // until the first Hand arrives, empty 1-texel arrays keep the shader valid
  const empty = () => {
    const a = new THREE.DataArrayTexture(new Uint16Array(4), 1, 1, 1);
    a.type = THREE.HalfFloatType;
    const b = new THREE.DataArrayTexture(new Uint8Array(4), 1, 1, 1);
    a.needsUpdate = b.needsUpdate = true;
    return [a, b];
  };
  [uniforms.uHandA.value, uniforms.uHandB.value] = empty();
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG });
  const meshes = [grid(N), grid(N / 2)].map((g) => {
    const m = new THREE.Mesh(g, material);
    m.frustumCulled = false;
    return m;
  });
  return {
    meshes,
    // one Hand's baked arrays into its layer of the texture arrays (every Hand shares the template's size)
    addHand(i, d, pose, rise = 1) {
      const n = d.w * d.h * 4;
      if (!layer) { layer = { w: d.w, h: d.h }; uniforms.uLayer.value.set(d.w, d.h); uniforms.uCell.value = d.cell; }
      if (d.w !== layer.w || d.h !== layer.h) throw new Error('every Hand must share the template size');
      if (i >= MAX_HANDS) throw new Error(`more than ${MAX_HANDS} Hands`);
      if (!texA || i >= texA.image.depth) { // grow the texture arrays, keeping the Hands already in them
        const depth = Math.min(MAX_HANDS, Math.ceil((i + 1) / GROW) * GROW);
        const A2 = new Uint16Array(n * depth), B2 = new Uint8Array(n * depth);
        if (A) { A2.set(A); B2.set(B); texA.dispose(); texB.dispose(); }
        A = A2; B = B2;
        texA = new THREE.DataArrayTexture(A, d.w, d.h, depth);
        texA.type = THREE.HalfFloatType;
        texA.magFilter = texA.minFilter = THREE.LinearFilter;
        texB = new THREE.DataArrayTexture(B, d.w, d.h, depth);
        for (const t of [texA, texB]) { t.userData.fresh = true; t.onUpdate = () => (t.userData.fresh = false); } // a new array uploads whole, once
        uniforms.uHandA.value = texA;
        uniforms.uHandB.value = texB;
      }
      A.set(d.texA, i * n);
      B.set(d.info, i * n);
      for (const t of [texA, texB]) { if (!t.userData.fresh) t.addLayerUpdate(i); t.needsUpdate = true; } // after that, only this Hand's layer
      uniforms.uHandPose.value[i].set(pose.x, pose.z, Math.cos(pose.rot), Math.sin(pose.rot));
      uniforms.uHandBox.value[i].set(d.x0, d.y0, pose.mirror ? -1 : 1, rise);
      uniforms.uHandCount.value = Math.max(uniforms.uHandCount.value, i + 1);
    },
    setRise(i, rise) { uniforms.uHandBox.value[i].w = rise; },
    // charting: which handbits of layer i are inked in; reveal(i, index) inks one in over 1.4 s from now
    setCharted(i, mask) { uniforms.uCharted.value[i] = mask; },
    reveal(i, index) { uniforms.uReveal.value.set(i, index, uniforms.uTime.value); },
    // choose the patches round the camera and hand them to the two instanced grids
    centre: [0, 0, 0], // where the patches were last chosen round, and how many are drawn (for checks)
    patches: 0,
    // frustum (optional): patches outside your view are not drawn at all
    update(cam, frustum = null) {
      this.centre = [cam.x, cam.y, cam.z];
      const { nodes, ranges, morphStart } = selectNodes([cam.x, cam.y, cam.z], { leaf: LEAF, levels: LEVELS });
      uniforms.uMorphStart.value = morphStart;
      uniforms.uMorphEnd.value = ranges;
      for (const [m, part] of [[meshes[0], false], [meshes[1], true]]) {
        const attr = m.geometry.attributes.node, arr = attr.array;
        let n = 0;
        for (const node of nodes) {
          if (node.part !== part || n >= MAX_NODES) continue;
          if (frustum && !frustum.intersectsBox(box.set(v0.set(node.x, -120, node.z), v1.set(node.x + node.size, 750, node.z + node.size)))) continue;
          arr.set([node.x, node.z, node.size, node.level], n * 4);
          n++;
        }
        m.geometry.instanceCount = n;
        this.patches = (part ? this.patches : 0) + n;
        attr.needsUpdate = true;
      }
    },
  };
}
