// src/garden/flora.js
// The garden as you see it. Every grove is a cluster of its species, drawn in that species' own style:
// pixel (hard sixteen-pixel sprites, standing as crossed cards, with a mosaic tile of the same sprite
// laid on the sand under them), painted (smooth sprites on crossed cards) or mesh (real 3D flowers and
// trees). All of it instanced: two sprite draws, one tile draw, three flower meshes, six tree meshes.
// Groves near you are drawn; the lists are rebuilt when the garden changes or you have flown on.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from '../hand/dna.js';
import { paintAtlases, styleOf, ROW, PIX, SOFT, GEN } from './paint.js';

const NEAR = 7000; // groves farther than this from you are not drawn
export const FLOWER_H = 46, TREE_H = 150, TILE = 90; // giants: the Hands are kilometres long // stylised metres: it has to read from the air at speed
const DRY = new THREE.Color('#9a7a4f'), DEAD = new THREE.Color('#5d5149'), STEM = new THREE.Color('#3f7d3a');
const FLOWER_MESH = { daisy: 'open', rosette: 'open', umbel: 'open', tulip: 'cup', bell: 'cup', spike: 'spike' };

const COMMON = /* glsl */ `
  attribute vec4 aPos;   // x, y, z of the foot, and the size
  attribute vec3 aFx;    // when it was planted or last grew (s), how dry (0 fresh, 1 dry, 2 dead), a turn (rad)
  uniform float uTime;
  float grow() { float k = clamp((uTime - aFx.x) / 2.2, 0.0, 1.0); return k * k * (3.0 - 2.0 * k) * (1.0 + 0.25 * sin(k * 3.14159)); } // pops up with a little overshoot
  vec3 place(vec3 p, float sway) {
    float c = cos(aFx.z), s = sin(aFx.z), g = grow() * aPos.w * (aFx.y > 1.5 ? 0.6 : 1.0);
    vec3 q = vec3(p.x * c + p.z * s, p.y, p.z * c - p.x * s) * g;
    q.x += sway * q.y * 0.06 * sin(uTime * 1.6 + aPos.x * 0.05 + aPos.z * 0.07); // the wind
    return q + aPos.xyz;
  }
`;
const SPRITE_VERT = /* glsl */ `
  ${COMMON}
  attribute vec2 aCell;
  uniform float uBillboard;
  varying vec2 vUv; varying float vDry;
  #include <fog_pars_vertex>
  void main() {
    vUv = (aCell + vec2(uv.x, 1.0 - uv.y)) / ${ROW}.0;
    vDry = aFx.y;
    vec4 mvPosition;
    if (uBillboard > 0.5) { mvPosition = viewMatrix * vec4(aPos.xyz, 1.0); mvPosition.xy += position.xy * aPos.w; } // decorations face you
    else mvPosition = viewMatrix * vec4(place(position, 1.0), 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const TINT = /* glsl */ `
  vec3 wither(vec3 c, float dry) {
    float g = dot(c, vec3(0.3, 0.6, 0.1));
    return dry > 1.5 ? mix(vec3(g), vec3(0.11, 0.09, 0.08), 0.55) : dry > 0.5 ? mix(c, vec3(g) * vec3(1.25, 1.0, 0.62), 0.6) : c;
  }
`;
const SPRITE_FRAG = /* glsl */ `
  uniform sampler2D uMap; uniform float uTile;
  varying vec2 vUv; varying float vDry;
  #include <fog_pars_fragment>
  ${TINT}
  void main() {
    vec4 c = texture2D(uMap, vUv);
    if (c.a < 0.5) discard;
    vec3 col = wither(c.rgb, vDry);
    if (uTile > 0.5) { vec2 f = fract(vUv * ${ROW * GEN}.0); float edge = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)); col *= 0.72 + 0.28 * smoothstep(0.0, 0.14, edge); } // each pixel a set stone
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;
const TILE_VERT = /* glsl */ `
  ${COMMON}
  attribute vec2 aCell; attribute vec4 aH; // the land's height at this quarter tile's four corners
  varying vec2 vUv; varying float vDry;
  #include <fog_pars_vertex>
  void main() {
    vUv = (aCell + vec2(uv.x, 1.0 - uv.y) * 0.5) / ${ROW}.0; // each tile is laid as four quarters, so it bends with the land
    vDry = aFx.y;
    float c = cos(aFx.z), s = sin(aFx.z), g = clamp((uTime - aFx.x) / 1.2, 0.0, 1.0);
    vec2 q = vec2(position.x * c + position.z * s, position.z * c - position.x * s) * aPos.w * g;
    float h = mix(mix(aH.x, aH.y, uv.x), mix(aH.z, aH.w, uv.x), uv.y); // follows the slope under it
    vec4 mvPosition = viewMatrix * vec4(aPos.x + q.x, h + 3.0, aPos.z + q.y, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const MESH_VERT = /* glsl */ `
  ${COMMON}
  attribute float aPart; attribute vec3 aC0; attribute vec3 aC1; attribute vec3 aC2;
  uniform vec3 uSunDir;
  varying vec3 vCol; varying float vDry;
  #include <fog_pars_vertex>
  void main() {
    float c = cos(aFx.z), s = sin(aFx.z);
    vec3 n = normalize(vec3(normal.x * c + normal.z * s, normal.y, normal.z * c - normal.x * s));
    vec3 base = aPart < 0.5 ? aC0 : aPart < 1.5 ? aC1 : aC2;
    vCol = base * (0.5 + 0.6 * max(dot(n, uSunDir), 0.0) + 0.14 * n.y);
    vDry = aFx.y;
    vec4 mvPosition = viewMatrix * vec4(place(position, aPart > 0.5 ? 1.0 : 0.3), 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const MESH_FRAG = /* glsl */ `
  varying vec3 vCol; varying float vDry;
  #include <fog_pars_fragment>
  ${TINT}
  void main() {
    gl_FragColor = vec4(wither(vCol, vDry), 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

// ---- geometry: unit tall (0..1), part 0 stem or trunk, 1 petals or canopy, 2 heart or accent ----
const part = (geo, k) => { const g = geo.index ? geo.toNonIndexed() : geo; g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(k), 1)); g.deleteAttribute('uv'); return g; };
const at = (geo, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz)));
const ball = (r, d = 1) => new THREE.IcosahedronGeometry(r, d), rod = (r0, r1, h) => new THREE.CylinderGeometry(r0, r1, h, 6).translate(0, h / 2, 0);
function meshes() {
  const ring = (n, fn) => Array.from({ length: n }, (_, i) => fn((i / n) * Math.PI * 2, i));
  const M = (...parts) => mergeGeometries(parts);
  return {
    open: M(part(rod(0.025, 0.035, 0.72), 0), ...ring(8, (a) => part(at(ball(0.17), Math.cos(a) * 0.19, 0.74, Math.sin(a) * 0.19, 1, 0.22, 0.5, 0, -a, 0.25), 1)), part(at(ball(0.1), 0, 0.77, 0, 1, 0.6, 1), 2)),
    cup: M(part(rod(0.025, 0.035, 0.62), 0), ...ring(5, (a) => part(at(ball(0.15), Math.cos(a) * 0.09, 0.78, Math.sin(a) * 0.09, 0.55, 1.25, 0.8, 0, -a, -0.18), 1)), part(at(ball(0.07), 0, 0.72, 0), 2)),
    spike: M(part(rod(0.02, 0.03, 0.95), 0), ...Array.from({ length: 7 }, (_, i) => part(at(ball(0.13 - i * 0.012), (i % 2 ? 0.05 : -0.05), 0.38 + i * 0.085, (i % 3 - 1) * 0.04), i === 6 ? 2 : 1))),
    round: M(part(rod(0.045, 0.075, 0.5), 0), part(at(ball(0.3), 0, 0.68, 0), 1), part(at(ball(0.2), 0.2, 0.56, 0.08), 1), part(at(ball(0.18), -0.19, 0.6, -0.1), 2)),
    cone: M(part(rod(0.035, 0.05, 0.25), 0), part(new THREE.ConeGeometry(0.3, 0.42, 7).translate(0, 0.4, 0), 1), part(new THREE.ConeGeometry(0.23, 0.36, 7).translate(0, 0.62, 0), 1), part(new THREE.ConeGeometry(0.15, 0.3, 7).translate(0, 0.85, 0), 2)),
    palm: M(part(at(rod(0.03, 0.05, 0.8), 0, 0, 0, 1, 1, 1, 0, 0, -0.12), 0), ...ring(7, (a) => part(at(ball(0.2), 0.1 + Math.cos(a) * 0.2, 0.78, Math.sin(a) * 0.2, 1.2, 0.12, 0.34, 0, -a, -0.5), 1)), part(at(ball(0.05), 0.1, 0.76, 0), 2)),
    umbrella: M(part(rod(0.035, 0.055, 0.66), 0), part(at(ball(0.46, 2), 0, 0.72, 0, 1, 0.2, 1), 1), part(at(ball(0.26), 0.1, 0.8, 0.05, 1, 0.22, 1), 2)),
    column: M(part(rod(0.03, 0.045, 0.14), 0), part(at(ball(0.15, 2), 0, 0.56, 0, 1, 2.9, 1), 1), part(at(ball(0.06), 0, 0.98, 0), 2)),
    cactus: M(part(rod(0.07, 0.085, 0.92), 1), part(at(rod(0.045, 0.045, 0.3), 0.2, 0.42, 0), 1), part(at(rod(0.045, 0.045, 0.2), 0.02, 0.44, 0, 1, 1, 1, 0, 0, -1.57), 1), part(at(rod(0.045, 0.045, 0.26), -0.19, 0.3, 0), 1), part(at(rod(0.045, 0.045, 0.2), -0.21, 0.32, 0, 1, 1, 1, 0, 0, -1.57), 1), part(at(ball(0.07), 0, 0.95, 0), 2), part(at(ball(0.05), 0.2, 0.74, 0), 2)),
  };
}
const crossed = () => { // two cards at right angles, feet on the ground
  const a = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), b = a.clone().rotateY(Math.PI / 2);
  return mergeGeometries([a, b]);
};

// one instanced draw: a base geometry, per-instance attributes, a material; fill() it grove by grove
function batch(base, attrs, material, cap) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  for (const k in base.attributes) geo.setAttribute(k, base.attributes[k]);
  const arr = {};
  for (const [name, size] of Object.entries(attrs)) { arr[name] = new Float32Array(cap * size); geo.setAttribute(name, new THREE.InstancedBufferAttribute(arr[name], size).setUsage(THREE.DynamicDrawUsage)); }
  geo.instanceCount = 0;
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  let n = 0;
  return {
    mesh, cap,
    begin() { n = 0; },
    get full() { return n >= cap; },
    put(values) { if (n >= cap) return; for (const name in values) arr[name].set(values[name], n * attrs[name]); n++; },
    end() { geo.instanceCount = n; for (const name in attrs) { const a = geo.attributes[name]; a.clearUpdateRanges?.(); a.addUpdateRange?.(0, n * attrs[name]); a.needsUpdate = true; } },
    get count() { return n; },
  };
}

export function createFlora(species, flora, shared) {
  const { soft, pix, cell } = paintAtlases(species, flora);
  const tex = (canvas, pixel) => { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; /* cells are addressed from the canvas's top left */ t.magFilter = pixel ? THREE.NearestFilter : THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; return t; };
  const softTex = tex(soft, false), pixTex = tex(pix, true);
  const uTime = { value: 0 };
  // Freely licensed art from other makers (assets/flora, see its CREDITS.md) takes the place of every other
  // sprite species' generated portrait: pixel packs for pixel species, painted ones for painted species.
  (async () => {
    let list;
    try { list = await (await fetch(new URL('../../assets/flora/manifest.json', import.meta.url))).json(); } catch { return; }
    const PACKS = { pixel: ['sicklyseraph-pixel-flower-icons', 'spiderdave-flowers', 'arkyonveil-16x-tileset', 'idylwild-foliage-pack', 'syrsly-2d-trees', 'letargicdev-some-plants'], paint: ['varkalandar-forbs', 'twemoji', 'kenney-foliage-pack'] };
    const images = new Map(), load = (file) => { if (!images.has(file)) images.set(file, new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = new URL(`../../${file}`, import.meta.url).href; })); return images.get(file); };
    for (const style of ['pixel', 'paint']) for (const kind of ['flower', 'tree']) {
      const pool = list.filter((e) => e.kind === kind && e.style === (style === 'paint' ? 'painted' : 'pixel') && PACKS[style].includes(e.pack) && e.w > 0 && /\.png$/.test(e.file) && (style === 'paint' || (e.w <= 64 && e.h <= 64)));
      const ids = flora.filter((id) => species[id].kind === kind && styleOf(species[id]) === style).filter((_, i) => i % 2 === 0);
      if (!pool.length) continue;
      const S = style === 'pixel' ? PIX : SOFT, g = (style === 'pixel' ? pix : soft).getContext('2d');
      await Promise.all(ids.map(async (id, i) => {
        const e = pool[Math.floor((i * pool.length) / ids.length) % pool.length], img = await load(e.file), c = cell.get(id);
        if (!img) return;
        const k = Math.min(S / e.w, S / e.h), w = e.w * k, h = e.h * k; // whole, feet on the ground, centred
        g.imageSmoothingEnabled = style !== 'pixel';
        g.clearRect(c[0] * S, c[1] * S, S, S);
        g.drawImage(img, e.x, e.y, e.w, e.h, c[0] * S + (S - w) / 2, c[1] * S + S - h, w, h);
      }));
      (style === 'pixel' ? pixTex : softTex).needsUpdate = true;
    }
  })();
  const spriteMat = (map, o = {}) => new THREE.ShaderMaterial({ uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uMap: { value: map }, uTime, uBillboard: { value: o.billboard ? 1 : 0 }, uTile: { value: o.tile ? 1 : 0 } }, vertexShader: o.tile ? TILE_VERT : SPRITE_VERT, fragmentShader: SPRITE_FRAG, side: THREE.DoubleSide, fog: true });
  const meshMat = () => new THREE.ShaderMaterial({ uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime, uSunDir: shared.uSunDir }, vertexShader: MESH_VERT, fragmentShader: MESH_FRAG, fog: true });
  const SPR = { aPos: 4, aFx: 3, aCell: 2 }, MSH = { aPos: 4, aFx: 3, aC0: 3, aC1: 3, aC2: 3 };
  const cards = crossed(), geos = meshes();
  const B = {
    pixel: batch(cards, SPR, spriteMat(pixTex), 24000),
    paint: batch(cards, SPR, spriteMat(softTex), 24000),
    tile: batch(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), { ...SPR, aH: 4 }, spriteMat(pixTex, { tile: true }), 16000),
    deco: batch(new THREE.PlaneGeometry(1, 1), SPR, spriteMat(softTex, { billboard: true }), 1200),
  };
  for (const k in geos) B[k] = batch(geos[k], MSH, meshMat(), k in { open: 1, cup: 1, spike: 1 } ? 9000 : 2500);
  const group = new THREE.Group();
  for (const k in B) group.add(B[k].mesh);
  B.deco.mesh.renderOrder = 5;

  // per species: its style, its cell in the atlases, its three mesh colours
  const info = new Map();
  const col = (hex) => new THREE.Color(hex);
  for (const id of flora) {
    const s = species[id], style = styleOf(s), isTree = s.kind === 'tree', c1 = col(s.color), c2 = col(s.color2);
    info.set(id, { style, isTree, cell: cell.get(id), mesh: isTree ? s.form : FLOWER_MESH[s.form] ?? 'open', h: (isTree ? TREE_H : FLOWER_H) * (0.6 + 0.4 * s.size),
      c0: (isTree ? c2 : STEM).toArray(), c1: c1.toArray(), c2: (isTree ? c1.clone().lerp(new THREE.Color('#ffffff'), 0.3) : c2).toArray() });
  }
  const tmp = { aPos: [0, 0, 0, 0], aFx: [0, 0, 0], aCell: [0, 0], aH: [0, 0, 0, 0] };
  const last = { x: Infinity, z: Infinity };
  let shown = 0;

  return {
    group, atlas: soft, pixelAtlas: pix,
    styleOf: (id) => info.get(id)?.style ?? 'paint',
    // where a species' portrait is in the painted atlas (pixels), for the HUD and the herbarium
    icon(id) { const c = cell.get(id); return c ? { canvas: soft, x: c[0] * SOFT, y: c[1] * SOFT, s: SOFT } : null; },
    get shown() { return shown; },
    moved: (eye) => Math.hypot(eye[0] - last.x, eye[2] - last.z) > 1500,
    // groves: iterable of { id, sp, stage, big, wx, wy, wz, rot, pop (game seconds it last grew), dry (0|1|2), hs: [4 corner heights] }
    rebuild(groves, eye, groundAt) {
      last.x = eye[0]; last.z = eye[2];
      for (const k in B) if (k !== 'deco') B[k].begin();
      shown = 0;
      for (const p of groves) {
        const it = info.get(p.sp);
        if (!it || Math.hypot(p.wx - eye[0], p.wz - eye[2]) > NEAR) continue;
        shown++;
        const r = rng((p.id * 2654435761) >>> 0), k = 0.45 + 0.55 * (p.stage / 3), big = p.big ? 2 : 1;
        const n = it.isTree ? Math.min(3, 1 + Math.floor(p.stage / 2)) * big : (4 + p.stage * 3) * big, spread = it.isTree ? 75 : 42;
        tmp.aFx[0] = p.pop ?? -99; tmp.aFx[1] = p.dry ?? 0;
        if (it.style === 'pixel' && !it.isTree) { // the mosaic tile, square to its Hand
          const rot = p.rot ?? 0, c = Math.cos(rot), s = Math.sin(rot), hs = p.hs; // hs: the land at a 3 by 3 grid over the tile, row by row from -z
          tmp.aPos[3] = TILE / 2; tmp.aFx[2] = rot;
          for (let qz = 0; qz < 2; qz++) for (let qx = 0; qx < 2; qx++) {
            const lx = (qx - 0.5) * TILE / 2, lz = (qz - 0.5) * TILE / 2;
            tmp.aPos[0] = p.wx + lx * c + lz * s; tmp.aPos[1] = p.wy; tmp.aPos[2] = p.wz + lz * c - lx * s;
            tmp.aCell[0] = it.cell[0] + qx * 0.5; tmp.aCell[1] = it.cell[1] + qz * 0.5;
            const H = (ix, iz) => (hs ? hs[iz * 3 + ix] : p.wy);
            tmp.aH[0] = H(qx, qz + 1); tmp.aH[1] = H(qx + 1, qz + 1); tmp.aH[2] = H(qx, qz); tmp.aH[3] = H(qx + 1, qz);
            B.tile.put(tmp);
          }
        }
        const b = it.style === 'mesh' ? B[it.mesh] : B[it.style];
        for (let i = 0; i < n; i++) {
          const a = r() * Math.PI * 2, d = i ? Math.sqrt(r()) * spread : 0, x = p.wx + Math.cos(a) * d, z = p.wz + Math.sin(a) * d;
          tmp.aPos[0] = x; tmp.aPos[1] = i && groundAt ? groundAt(x, z) : p.wy; tmp.aPos[2] = z; tmp.aPos[3] = it.h * k * (0.75 + 0.5 * r());
          tmp.aFx[2] = r() * Math.PI;
          if (it.style === 'mesh') b.put({ aPos: tmp.aPos, aFx: tmp.aFx, aC0: it.c0, aC1: it.c1, aC2: it.c2 });
          else { tmp.aCell[0] = it.cell[0]; tmp.aCell[1] = it.cell[1]; b.put({ aPos: tmp.aPos, aFx: tmp.aFx, aCell: tmp.aCell }); }
        }
      }
      for (const k in B) if (k !== 'deco') B[k].end();
    },
    // decorations on whorls: begin, add little portraits facing you, end (every frame)
    decoBegin() { B.deco.begin(); },
    deco(x, y, z, size, sp) { const c = cell.get(sp); if (!c) return; tmp.aPos[0] = x; tmp.aPos[1] = y; tmp.aPos[2] = z; tmp.aPos[3] = size; tmp.aFx[0] = -99; tmp.aFx[1] = 0; tmp.aFx[2] = 0; tmp.aCell[0] = c[0]; tmp.aCell[1] = c[1]; B.deco.put({ aPos: tmp.aPos, aFx: tmp.aFx, aCell: tmp.aCell }); },
    decoEnd() { B.deco.end(); },
    update(t) { uTime.value = t; },
  };
}
