import * as THREE from 'three';

// Ink wire: line segments drawn as camera-facing ribbons with a real width in metres, all in one
// draw call. Plain GL lines are one pixel wide and shimmer in a headset; these read as pen strokes.
export function createInk(maxSegments, { width = 0.0016, color = '#15100e' } = {}) {
  const pos = new Float32Array(maxSegments * 12);
  const other = new Float32Array(maxSegments * 12);
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
  geo.setAttribute('side', new THREE.BufferAttribute(side, 1));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.setDrawRange(0, 0);

  const mat = new THREE.ShaderMaterial({
    uniforms: { uWidth: { value: width }, uColor: { value: new THREE.Color(color) } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec3 other;
      attribute float side;
      uniform float uWidth;
      void main() {
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        vec4 q = modelViewMatrix * vec4(other, 1.0);
        vec3 along = q.xyz - p.xyz;
        vec3 across = cross(along, p.xyz);
        float len = length(across);
        p.xyz += (len > 1e-9 ? across / len : vec3(0.0)) * side * uWidth * 0.5;
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
  return {
    mesh,
    get count() { return n; },
    set width(w) { mat.uniforms.uWidth.value = w; },
    begin() { n = 0; },
    segment(a, b) {
      if (n >= maxSegments) return;
      const v = n * 4;
      put(pos, v, a.x, a.y, a.z); put(other, v, b.x, b.y, b.z);
      put(pos, v + 1, a.x, a.y, a.z); put(other, v + 1, b.x, b.y, b.z);
      put(pos, v + 2, b.x, b.y, b.z); put(other, v + 2, a.x, a.y, a.z);
      put(pos, v + 3, b.x, b.y, b.z); put(other, v + 3, a.x, a.y, a.z);
      n++;
    },
    polyline(points) {
      for (let i = 1; i < points.length; i++) this.segment(points[i - 1], points[i]);
    },
    end() {
      geo.attributes.position.needsUpdate = true;
      geo.attributes.other.needsUpdate = true;
      geo.setDrawRange(0, n * 6);
    },
  };
}
