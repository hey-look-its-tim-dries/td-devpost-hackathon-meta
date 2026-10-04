// src/glide.js
// Gliding over the world: constant forward speed, turn and climb in -1..1, and the ground kept at a
// distance below you, looking a little ahead so a hill lifts you in time. Pure.
// speedAt(height above ground), when given, sets the speed each step; diving adds up to half again.
export function createGlide({ pos = [0, 300, 1400], yaw = 0, speed = 24, turnRate = 0.45, climbRate = 12, clearance = 35, ceiling = 900, speedAt = null } = {}) {
  const clamp1 = (v) => Math.max(-1, Math.min(1, v));
  return {
    pos: pos.slice(), yaw, speed,
    forward() { return [-Math.sin(this.yaw), 0, -Math.cos(this.yaw)]; },
    update(dt, { turn = 0, climb = 0 } = {}, groundAt = () => 0) {
      if (speedAt) this.speed = speedAt(this.pos[1] - groundAt(this.pos[0], this.pos[2])) * (1 + 0.5 * Math.max(0, -clamp1(climb)));
      this.yaw -= clamp1(turn) * turnRate * dt;
      const f = this.forward();
      this.pos[0] += f[0] * this.speed * dt;
      this.pos[2] += f[2] * this.speed * dt;
      let y = this.pos[1] + clamp1(climb) * climbRate * dt;
      const here = groundAt(this.pos[0], this.pos[2]);
      const floor = Math.max(here, groundAt(this.pos[0] + f[0] * Math.max(60, this.speed * 2.5), this.pos[2] + f[2] * Math.max(60, this.speed * 2.5))) + clearance;
      if (y < floor) y += (floor - y) * (1 - Math.exp(-dt * 2.5));
      this.pos[1] = Math.min(ceiling, Math.max(y, here + 8));
      return this;
    },
  };
}
