import * as THREE from 'three';

// Ink wire: line segments drawn as camera-facing ribbons with a real width in metres, all in one
// draw call. Plain GL lines are one pixel wide and shimmer in a headset; these read as pen strokes.
// Each end of a segment has its own width, so a line can taper like a brush stroke.
export function createInk(maxSegments, { width = 0.0016, color = '#15100e' } = {}) {
  const pos = new Float32Array(maxSegments * 12);
  const other = new Float32Array(maxSegments * 12);
  const widths = new Float32Array(maxSegments * 4);
  const side = new Float32Array(maxSegments * 4);
  const index = new Uint32Array(maxSegments * 6);
  for (let s = 0; s < maxSegments; s++) {
    // corners a-, a+, b+, b-: the far end's "other" points back along the segment, which flips its
    // across vector, so its side values are mirrored to land on the same edges
    side.set([-1, 1, -1, 1], s * 4);
    index.set([s * 4, s * 4 + 1, s * 4 + 2, s * 4, s * 4 + 2, s * 4 + 3], s * 6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('other', new THREE.BufferAttribute(other, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('width', new THREE.BufferAttribute(widths, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('side', new THREE.BufferAttribute(side, 1));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.setDrawRange(0, 0);

  const mat = new THREE.ShaderMaterial({
    uniforms: { uWidth: { value: width }, uColor: { value: new THREE.Color(color) } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec3 other;
      attribute float side;
      attribute float width;
      uniform float uWidth;
      void main() {
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        vec4 q = modelViewMatrix * vec4(other, 1.0);
        vec3 along = q.xyz - p.xyz;
        vec3 across = cross(along, p.xyz);
        float len = length(across);
        p.xyz += (len > 1e-9 ? across / len : vec3(0.0)) * side * uWidth * width * 0.5;
        gl_Position = projectionMatrix * p;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  let n = 0;

  const put = (arr, v, x, y, z) => { arr[v * 3] = x; arr[v * 3 + 1] = y; arr[v * 3 + 2] = z; };
  function seg(ax, ay, az, bx, by, bz, wa, wb) {
    if (n >= maxSegments) return;
    const v = n * 4;
    put(pos, v, ax, ay, az); put(other, v, bx, by, bz);
    put(pos, v + 1, ax, ay, az); put(other, v + 1, bx, by, bz);
    put(pos, v + 2, bx, by, bz); put(other, v + 2, ax, ay, az);
    put(pos, v + 3, bx, by, bz); put(other, v + 3, ax, ay, az);
    widths[v] = widths[v + 1] = wa;
    widths[v + 2] = widths[v + 3] = wb;
    n++;
  }
  return {
    mesh,
    get count() { return n; },
    set width(w) { mat.uniforms.uWidth.value = w; },
    begin() { n = 0; },
    segment(a, b, wa = 1, wb = 1) { seg(a.x, a.y, a.z, b.x, b.y, b.z, wa, wb); },
    polyline(points) { for (let i = 1; i < points.length; i++) this.segment(points[i - 1], points[i]); },
    // a flat xyz array as one tapered stroke; taper(s) is the width at s = 0 (head) .. 1 (tail)
    stroke(xyz, count, taper) {
      for (let i = 1; i < count; i++) {
        const a = (i - 1) * 3, b = i * 3;
        seg(xyz[a], xyz[a + 1], xyz[a + 2], xyz[b], xyz[b + 1], xyz[b + 2], taper((i - 1) / (count - 1)), taper(i / (count - 1)));
      }
    },
    end() {
      // upload only the segments drawn this frame (the buffers are sized for the most there could ever be: whole-buffer
      // uploads were most of the frame's CPU time, since a typical frame draws a few percent of them)
      for (const name of ['position', 'other', 'width']) {
        const a = geo.attributes[name];
        a.clearUpdateRanges();
        a.addUpdateRange(0, n * 4 * a.itemSize);
        a.needsUpdate = true;
      }
      geo.setDrawRange(0, n * 6);
    },
  };
}
