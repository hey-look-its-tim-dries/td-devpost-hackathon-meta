import * as THREE from 'three';

// A small card of text on warm paper, floating in front of you. At 0.36 m wide and about 0.7 m
// away it stays inside 30 degrees of view on every Meta headset, so nothing essential is cut off.
export function createPanel() {
  const canvas = Object.assign(document.createElement('canvas'), { width: 1024, height: 256 });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.36, 0.09),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, opacity: 0 }),
  );
  mesh.renderOrder = 20;
  let life = 0;
  const target = new THREE.Vector3(), fwd = new THREE.Vector3();

  return {
    mesh,
    get text() { return mesh.userData.text || ''; },
    say(text, seconds = 6) {
      const g = canvas.getContext('2d');
      g.clearRect(0, 0, 1024, 256);
      g.fillStyle = 'rgba(246, 232, 216, 0.94)';
      g.beginPath();
      g.roundRect(6, 6, 1012, 244, 48);
      g.fill();
      g.strokeStyle = 'rgba(22, 16, 14, 0.85)';
      g.lineWidth = 5;
      g.stroke();
      g.fillStyle = '#16100e';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '600 86px Georgia, "Times New Roman", serif';
      g.fillText(text, 512, 132, 960);
      tex.needsUpdate = true;
      mesh.userData.text = text;
      life = seconds;
    },
    hide() { life = Math.min(life, 0.6); },
    // float about 0.7 m in front of the head and a little low, easing after the gaze
    update(dt, headPos, headQuat) {
      life -= dt;
      mesh.material.opacity = Math.max(0, Math.min(1, life * 2));
      mesh.visible = mesh.material.opacity > 0;
      // a little above where you look, but never lower than 35 degrees down: when you look at the
      // table the card floats just above the land instead of at the top edge of your view
      fwd.set(0, 0, -1).applyQuaternion(headQuat);
      const pitch = Math.max(-0.6, Math.min(0, Math.asin(Math.max(-1, Math.min(1, fwd.y))))) + 0.2;
      fwd.setY(0).normalize().multiplyScalar(Math.cos(pitch)).setY(Math.sin(pitch));
      target.copy(headPos).addScaledVector(fwd, 0.7);
      mesh.position.lerp(target, mesh.userData.placed ? 1 - Math.exp(-dt * 3) : 1);
      mesh.userData.placed = true;
      mesh.lookAt(headPos);
    },
  };
}
