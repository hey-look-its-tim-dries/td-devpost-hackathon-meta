import * as THREE from 'three';

// The six Henry classes as small printed plates: look at your own fingertip and touch the one
// that matches. Two rows of three, 0.27 m wide at about 0.45 m: inside 35 degrees of view.
export const PLATES = [
  ['arch', 'arch'],
  ['tented', 'tented arch'],
  ['loop', 'loop'],
  ['pocket', 'pocket loop'],
  ['whorl', 'whorl'],
  ['double', 'double loop'],
];
const W = 0.075, H = 0.09;

export function createChooser() {
  const group = new THREE.Group();
  group.visible = false;
  const plates = PLATES.map(([cls, label], i) => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 256, height: 308 });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    mesh.position.set(((i % 3) - 1) * 0.09, i < 3 ? 0.052 : -0.052, 0);
    mesh.userData = { cls, label, canvas, tex, hover: 0 };
    paint(mesh.userData, null);
    group.add(mesh);
    return mesh;
  });

  function paint(p, thumb) {
    const g = p.canvas.getContext('2d');
    g.clearRect(0, 0, 256, 308);
    g.fillStyle = p.cls === 'loop' ? '#fbf0e2' : '#f1e2d0'; // most people have a loop: it glows a little
    g.beginPath();
    g.roundRect(4, 4, 248, 300, 26);
    g.fill();
    g.strokeStyle = '#16100e';
    g.lineWidth = p.cls === 'loop' ? 7 : 4;
    g.stroke();
    if (thumb) g.drawImage(thumb, 18, 14, 220, 220);
    g.fillStyle = '#16100e';
    g.font = '600 34px Georgia, "Times New Roman", serif';
    g.textAlign = 'center';
    g.fillText(p.label, 128, 276, 236);
    p.tex.needsUpdate = true;
  }

  const local = new THREE.Vector3(), fwd = new THREE.Vector3();
  return {
    group,
    plates,
    // draw a grown print (ridge in -1..1, mask 0..1, n x n) onto its plate
    thumb(cls, ridge, mask, n) {
      const c = Object.assign(document.createElement('canvas'), { width: n, height: n });
      const g = c.getContext('2d'), img = g.createImageData(n, n);
      for (let i = 0; i < n * n; i++) {
        const inkAmt = Math.max(0, Math.min(1, ridge[i] * 2 + 0.5)) * mask[i];
        img.data[i * 4] = 241 - inkAmt * 219;
        img.data[i * 4 + 1] = 226 - inkAmt * 210;
        img.data[i * 4 + 2] = 208 - inkAmt * 194;
        img.data[i * 4 + 3] = mask[i] > 0.02 ? 255 : 0;
      }
      g.putImageData(img, 0, 0);
      const p = plates.find((m) => m.userData.cls === cls);
      if (p) paint(p.userData, c);
    },
    // place the plates in front of the head (rig-local pose), halfway down to the table
    show(headPos, headQuat) {
      fwd.set(0, 0, -1).applyQuaternion(headQuat).setY(0).normalize();
      group.position.copy(headPos).addScaledVector(fwd, 0.45);
      group.position.y -= 0.26;
      group.lookAt(headPos.x, group.position.y + 0.14, headPos.z); // tipped a little toward you
      group.visible = true;
    },
    hide() { group.visible = false; },
    // a fingertip (world) poking a plate: returns its class, and lights the one it hovers over
    poke(tip) {
      let picked = null;
      for (const p of plates) {
        p.worldToLocal(local.copy(tip));
        const over = Math.abs(local.x) < W / 2 && Math.abs(local.y) < H / 2;
        p.userData.hover = over && local.z < 0.06 ? 1 : 0;
        if (over && local.z < 0.012 && local.z > -0.04) picked = p.userData.cls;
      }
      return picked;
    },
    // a pinch with the hands elsewhere: the plate closest to where you are looking
    nearest(origin, dir) {
      let best = null, bestDot = -1;
      for (const p of plates) {
        p.getWorldPosition(local).sub(origin).normalize();
        const d = local.dot(dir);
        if (d > bestDot) { bestDot = d; best = p.userData.cls; }
      }
      return bestDot > 0.8 ? best : null; // within about 35 degrees of your gaze
    },
    // a ray (desktop click, or head gaze plus pinch) picking a plate
    pickRay(raycaster) {
      const hit = raycaster.intersectObjects(plates, false)[0];
      return hit ? hit.object.userData.cls : null;
    },
    update(dt) {
      for (const p of plates) {
        const s = 1 + p.userData.hover * 0.08;
        p.scale.lerp(local.set(s, s, 1), 1 - Math.exp(-dt * 10));
      }
    },
  };
}
