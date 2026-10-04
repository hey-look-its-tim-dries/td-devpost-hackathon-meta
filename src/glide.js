// src/glide.js
// Flying as a glider does: your climb input sets the angle of your path, and gravity does the rest.
// Diving trades height for speed (up to `terminal`), climbing spends it, and a dive pulled up zooms
// you high. Skimming the land gives a rush of speed (ground effect), so threading a canyon is the
// fastest way to travel. Terrain ahead lifts you in time; you never end up inside the land. Pure.
export function createGlide({
  pos = [0, 300, 1400], yaw = 0, speed = 70, turnRate = 0.9, clearance = 25, ceiling = 1500,
  gravity = 28, cruise = 70, terminal = 320, maxPitch = 0.75, minSpeed = 22, groundBoost = 7, groundBand = 40,
} = {}) {
  const clamp1 = (v) => Math.max(-1, Math.min(1, v));
  const drag = (gravity * Math.sin(maxPitch)) / (terminal ** 2 - cruise ** 2); // a full dive tops out at `terminal`
  const thrust = drag * cruise ** 2; // level flight settles at `cruise`
  return {
    pos: pos.slice(), yaw, speed, pitch: 0, // pitch: the angle of your path, + climbing
    forward() { return [-Math.sin(this.yaw), 0, -Math.cos(this.yaw)]; },
    update(dt, { turn = 0, climb = 0 } = {}, groundAt = () => 0) {
      const f = this.forward(), here = groundAt(this.pos[0], this.pos[2]);
      // the land ahead (two and a half seconds out) lifts you before you reach it
      let ahead = here;
      for (const t of [0.8, 1.6, 2.5]) ahead = Math.max(ahead, groundAt(this.pos[0] + f[0] * this.speed * t, this.pos[2] + f[2] * this.speed * t));
      let want = clamp1(climb) * maxPitch;
      const below = ahead + clearance - this.pos[1];
      if (below > 0) want = Math.max(want, Math.min(maxPitch, below / Math.max(40, this.speed)));
      if (this.speed < minSpeed + 3) want = Math.min(want, -0.2); // too slow: the nose drops (a stall)
      this.pitch += (want - this.pitch) * (1 - Math.exp(-dt * 2.2));
      const rush = groundBoost * Math.max(0, 1 - (this.pos[1] - here) / groundBand);
      this.speed = Math.max(minSpeed, this.speed + (thrust + rush - gravity * Math.sin(this.pitch) - drag * this.speed ** 2) * dt);
      this.yaw -= clamp1(turn) * turnRate * dt;
      const g = this.forward(), h = this.speed * Math.cos(this.pitch);
      this.pos[0] += g[0] * h * dt;
      this.pos[2] += g[2] * h * dt;
      this.pos[1] += this.speed * Math.sin(this.pitch) * dt;
      const floor = groundAt(this.pos[0], this.pos[2]) + 8;
      if (this.pos[1] < floor) { this.pos[1] = floor; this.pitch = Math.max(this.pitch, 0.1); }
      if (this.pos[1] > ceiling) { this.pos[1] = ceiling; this.pitch = Math.min(this.pitch, 0); }
      return this;
    },
  };
}
