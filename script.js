const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const distanceEl = document.getElementById('distance');
const banner = document.getElementById('banner');
const startButton = document.getElementById('startButton');

const state = {
  started: false,
  over: false,
  time: 0,
  score: 0,
  distance: 0,
  health: 100,
  pointerX: 0,
  headTilt: 0,
  shipX: 0,
  shipY: 0,
  spawnTimer: 0,
  orbTimer: 0,
  clouds: [],
  stars: [],
  orbs: [],
  hazards: [],
};

let width = 0;
let height = 0;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function seedScene() {
  state.clouds = [];
  state.stars = [];
  state.orbs = [];
  state.hazards = [];

  const cloudCount = 10;
  for (let i = 0; i < cloudCount; i += 1) {
    state.clouds.push({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: randomBetween(40, 120),
      speed: randomBetween(15, 40),
      drift: randomBetween(-15, 15),
      alpha: randomBetween(0.32, 0.72),
    });
  }

  for (let i = 0; i < 90; i += 1) {
    state.stars.push({
      x: Math.random() * width,
      y: Math.random() * height * 0.8,
      r: randomBetween(1, 3),
      alpha: randomBetween(0.24, 0.9),
    });
  }
}

function resizeCanvas() {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width * window.devicePixelRatio;
  canvas.height = height * window.devicePixelRatio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

  state.shipX = width * 0.5;
  state.shipY = height * 0.78;
  seedScene();
}

function createOrb() {
  state.orbs.push({
    x: randomBetween(80, width - 80),
    y: -30,
    radius: randomBetween(12, 20),
    speed: randomBetween(120, 220),
    glow: randomBetween(0.6, 1.2),
  });
}

function createHazard() {
  const side = Math.random() < 0.5 ? -1 : 1;
  state.hazards.push({
    x: randomBetween(80, width - 80),
    y: -30,
    radius: randomBetween(26, 42),
    speed: randomBetween(170, 260),
    drift: randomBetween(-45, 45),
    side,
    pulse: Math.random() * Math.PI * 2,
  });
}

function resetGame() {
  state.started = true;
  state.over = false;
  state.time = 0;
  state.score = 0;
  state.distance = 0;
  state.health = 100;
  state.pointerX = 0;
  state.headTilt = 0;
  state.shipX = width * 0.5;
  state.shipY = height * 0.78;
  state.orbs = [];
  state.hazards = [];
  banner.classList.add('hidden');
}

function updateInput() {
  const aim = clamp(state.headTilt, -1, 1);
  const pointerX = clamp(state.pointerX, -1, 1);
  const target = pointerX === 0 ? aim : pointerX * 0.7 + aim * 0.3;
  state.shipX += (target * width * 0.74 - state.shipX) * 0.08;
  state.shipX = clamp(state.shipX, 70, width - 70);
}

function updateScene(delta) {
  state.time += delta;
  state.distance += delta * 22;
  state.score += delta * 10;

  state.clouds.forEach((cloud) => {
    cloud.y += cloud.speed * delta * 0.2;
    cloud.x += cloud.drift * delta * 0.2;

    if (cloud.y > height + cloud.radius) {
      cloud.y = -cloud.radius;
      cloud.x = Math.random() * width;
    }

    if (cloud.x < -cloud.radius) cloud.x = width + cloud.radius;
    if (cloud.x > width + cloud.radius) cloud.x = -cloud.radius;
  });

  state.stars.forEach((star) => {
    star.y += 12 * delta * (star.alpha + 0.2);
    if (star.y > height * 0.9) {
      star.y = -10;
      star.x = Math.random() * width;
    }
  });

  state.orbTimer -= delta;
  if (state.orbTimer <= 0) {
    createOrb();
    state.orbTimer = randomBetween(1.1, 2.3);
  }

  state.spawnTimer -= delta;
  if (state.spawnTimer <= 0) {
    createHazard();
    state.spawnTimer = randomBetween(1.8, 3.1);
  }

  for (let i = state.orbs.length - 1; i >= 0; i -= 1) {
    const orb = state.orbs[i];
    orb.y += orb.speed * delta;

    if (
      Math.hypot(orb.x - state.shipX, orb.y - state.shipY) < orb.radius + 20
    ) {
      state.orbs.splice(i, 1);
      state.score += 120;
      continue;
    }

    if (orb.y > height + orb.radius) {
      state.orbs.splice(i, 1);
    }
  }

  for (let i = state.hazards.length - 1; i >= 0; i -= 1) {
    const hazard = state.hazards[i];
    hazard.y += hazard.speed * delta;
    hazard.x += hazard.drift * delta * 0.5;
    hazard.pulse += delta * 7;

    if (
      Math.hypot(hazard.x - state.shipX, hazard.y - state.shipY) < hazard.radius + 22
    ) {
      state.hazards.splice(i, 1);
      state.health = clamp(state.health - 22, 0, 100);
      state.score = Math.max(0, state.score - 50);
      if (state.health <= 0) {
        state.over = true;
      }
      continue;
    }

    if (hazard.y > height + hazard.radius) {
      state.hazards.splice(i, 1);
    }
  }

  if (state.over) {
    showRestartMessage();
  }

  const roundedScore = Math.round(state.score);
  scoreEl.textContent = roundedScore;
  distanceEl.textContent = `${Math.round(state.distance)} km`;
}

function showRestartMessage() {
  const overlayText = 'The cloud current broke. Tap to drift again.';
  banner.innerHTML = `
    <div class="banner-inner">
      <p class="eyebrow">Drift ended</p>
      <h1>${Math.round(state.score)}</h1>
      <p>${overlayText}</p>
      <button id="startButton">Restart drift</button>
    </div>
  `;
  banner.classList.remove('hidden');
  const restartButton = document.getElementById('startButton');
  restartButton.addEventListener('click', () => {
    resetGame();
    banner.classList.add('hidden');
  });
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0.0, '#83d9ff');
  sky.addColorStop(0.38, '#4fa8d9');
  sky.addColorStop(1, '#0b2554');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  state.stars.forEach((star) => {
    ctx.fillStyle = `rgba(255,255,255,${star.alpha})`;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fill();
  });

  state.clouds.forEach((cloud) => {
    ctx.fillStyle = `rgba(255,255,255,${cloud.alpha})`;
    ctx.beginPath();
    ctx.arc(cloud.x, cloud.y, cloud.radius * 0.65, 0, Math.PI * 2);
    ctx.arc(cloud.x - cloud.radius * 0.55, cloud.y + cloud.radius * 0.15, cloud.radius * 0.5, 0, Math.PI * 2);
    ctx.arc(cloud.x + cloud.radius * 0.48, cloud.y + cloud.radius * 0.12, cloud.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawShip() {
  const x = state.shipX;
  const y = state.shipY;

  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, 18, 28, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#d9f8ff';
  ctx.beginPath();
  ctx.moveTo(0, -26);
  ctx.lineTo(18, 16);
  ctx.lineTo(0, 8);
  ctx.lineTo(-18, 16);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#7ce5ff';
  ctx.fillRect(-4, 8, 8, 16);

  ctx.fillStyle = '#eafcff';
  ctx.beginPath();
  ctx.arc(0, -9, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawOrbs() {
  state.orbs.forEach((orb) => {
    ctx.save();
    ctx.translate(orb.x, orb.y);
    ctx.fillStyle = `rgba(170, 240, 255, ${0.45 + orb.glow * 0.35})`;
    ctx.beginPath();
    ctx.arc(0, 0, orb.radius + 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#effdff';
    ctx.beginPath();
    ctx.arc(0, 0, orb.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawHazards() {
  state.hazards.forEach((hazard) => {
    const pulse = 1 + Math.sin(hazard.pulse) * 0.2;
    ctx.save();
    ctx.translate(hazard.x, hazard.y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = 'rgba(255, 122, 157, 0.32)';
    ctx.beginPath();
    ctx.arc(0, 0, hazard.radius + 12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffb4c6';
    ctx.beginPath();
    ctx.arc(0, 0, hazard.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawHealth() {
  const x = 24;
  const y = height - 34;
  const w = 160;
  const h = 12;

  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = '#7ce5ff';
  ctx.fillRect(x, y, w * (state.health / 100), h);

  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.strokeRect(x, y, w, h);
}

function draw() {
  drawBackground();
  drawOrbs();
  drawHazards();
  drawShip();
  drawHealth();
}

let lastFrame = 0;
function animate(timestamp) {
  if (!lastFrame) lastFrame = timestamp;
  const delta = Math.min((timestamp - lastFrame) / 1000, 0.033);
  lastFrame = timestamp;

  if (state.started && !state.over) {
    updateInput();
    updateScene(delta);
  }

  draw();
  requestAnimationFrame(animate);
}

window.addEventListener('pointermove', (event) => {
  const x = event.clientX / Math.max(window.innerWidth, 1);
  state.pointerX = (x - 0.5) * 2.4;
});

window.addEventListener('deviceorientation', (event) => {
  if (typeof event.gamma === 'number') {
    state.headTilt = clamp(event.gamma / 32, -1, 1);
  }
});

startButton.addEventListener('click', () => {
  resetGame();
});

window.addEventListener('resize', resizeCanvas);

resizeCanvas();
seedScene();
requestAnimationFrame(animate);
