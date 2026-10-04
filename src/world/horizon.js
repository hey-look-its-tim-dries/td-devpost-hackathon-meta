// src/world/horizon.js
// A test: an AI-generated Gaussian splat world (for example World Labs Marble, made from Tim's concept
// art) as a distant backdrop round the world, drawn by Spark 2. Only loaded with ?horizon=<url>; if
// anything fails, the world simply has no backdrop.
const SPARK = 'https://cdn.jsdelivr.net/npm/@sparkjsdev/spark@2.3.1/dist/spark.module.js';

export async function loadHorizon(scene, renderer, url, { scale = 500, y = -400 } = {}) {
  try {
    const { SparkRenderer, SplatMesh } = await import(SPARK);
    scene.add(new SparkRenderer({ renderer }));
    const splat = new SplatMesh({ url });
    splat.quaternion.set(1, 0, 0, 0); // splat captures are upside down in three.js
    splat.scale.setScalar(scale);
    splat.position.y = y;
    scene.add(splat);
    await splat.initialized;
    return splat;
  } catch (e) {
    console.warn('splat horizon unavailable', e);
    return null;
  }
}
