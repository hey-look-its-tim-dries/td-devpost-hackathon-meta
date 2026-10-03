// Grows lands off the main thread, so the headset never drops a frame. Progress snapshots let the
// table show the ridges spreading while they grow.
import { makeLand } from './land.js';

onmessage = ({ data: { id, cls, seed, size, ridges } }) => {
  const land = makeLand({
    cls, seed, size, ridges,
    onProgress: (ridge) => {
      const copy = ridge.slice();
      postMessage({ id, type: 'progress', ridge: copy }, [copy.buffer]);
    },
  });
  postMessage({ id, type: 'done', land }, [land.ridge.buffer, land.mask.buffer, land.height.buffer, land.paths.buffer]);
};
