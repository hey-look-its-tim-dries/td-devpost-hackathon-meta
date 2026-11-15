// src/world/props.js
// Things made in Blender (tools/blender/*.py) and placed in the world as glTF: for now the Source, the
// gilt spire at the centre of the world that every compass points to. They get the scene's sun and
// sky light and its haze, so they sit in the same air as the land.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FOG_DENSITY } from '../view.js';
import { HORIZON } from './scene.js';

export function addProps(scene, shared) {
  scene.fog = new THREE.FogExp2(HORIZON, FOG_DENSITY); // the same exp2 haze the terrain shader draws by hand
  const sun = new THREE.DirectionalLight(0xfff1e0, 2.2);
  sun.position.copy(shared.uSunDir.value).multiplyScalar(1000);
  scene.add(sun, new THREE.HemisphereLight(0xc9d6e2, 0x9a6a50, 1.1));
  new GLTFLoader().load(new URL('../../assets/source.glb', import.meta.url).href, (g) => {
    g.scene.position.set(0, 0, 0); // the middle of the Source lake
    g.scene.traverse((o) => { if (o.isMesh) o.frustumCulled = true; });
    scene.add(g.scene);
  }, undefined, (e) => console.warn('the Source could not load', e));
}
