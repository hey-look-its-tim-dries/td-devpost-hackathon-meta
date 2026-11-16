// src/boot.js: the buttons wait for the world; if the game cannot load (offline, a blocked CDN, a crash), say so
addEventListener('error', () => {
  if (document.getElementById('banner')?.classList.contains('loading')) document.getElementById('status').textContent = 'The world could not load. Check your connection and reload.';
}, true);
