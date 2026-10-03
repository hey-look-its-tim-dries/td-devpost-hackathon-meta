import * as THREE from 'three';

// The first thing you see: an ink outline of a hand lying on your table, asking without words to
// be covered by yours. It fills with warm light when you do.
function drawHand(stroke) {
  const canvas = Object.assign(document.createElement('canvas'), { width: 512, height: 640 });
  const g = canvas.getContext('2d');
  g.translate(256, 380);
  g.lineWidth = 9;
  g.lineCap = g.lineJoin = 'round';
  g.strokeStyle = '#16100e';
  g.fillStyle = '#ffd49a';
  if (stroke) g.setLineDash([26, 14]);
  const shape = (draw) => { g.beginPath(); draw(); stroke ? g.stroke() : g.fill(); };
  // a right hand, palm down, fingers pointing away from you
  const finger = (x, y, len, w, angle) => {
    g.save();
    g.translate(x, y);
    g.rotate(angle);
    shape(() => g.roundRect(-w / 2, -len, w, len + 40, w / 2));
    g.restore();
  };
  shape(() => g.roundRect(-120, -90, 240, 250, 90));
  finger(-92, -80, 150, 50, -0.12); // index
  finger(-30, -95, 180, 52, -0.03); // middle
  finger(32, -90, 165, 50, 0.05); // ring
  finger(88, -70, 125, 44, 0.16); // little
  finger(-120, 40, 130, 52, -1.0); // thumb
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createHandGuide() {
  const geo = new THREE.PlaneGeometry(0.2, 0.25).rotateX(-Math.PI / 2);
  const outline = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: drawHand(true), transparent: true, depthWrite: false }));
  const glow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: drawHand(false), transparent: true, depthWrite: false, opacity: 0 }));
  glow.position.y = -0.0005;
  const mesh = new THREE.Group();
  mesh.add(glow, outline);
  outline.renderOrder = 6;
  glow.renderOrder = 5;
  let fill = 0, time = 0;

  return {
    mesh,
    set filled(v) { fill = v; },
    update(dt) {
      time += dt;
      outline.material.opacity = 0.6 + 0.35 * Math.sin(time * 2.2) * (1 - fill) + fill * 0.4;
      glow.material.opacity = fill * 0.85;
    },
  };
}
