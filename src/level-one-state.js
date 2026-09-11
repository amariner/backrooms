const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

/** Pure gameplay state. Calling update is the only way simulation time advances. */
export class LevelOneState {
  constructor() {
    this.reset();
  }

  reset() {
    this.noise = 0;
    this.detected = 0;
    this.failed = false;
    this.blackout = false;
    this.hidden = false;
    this.elapsed = 0;
    return this;
  }

  update(dt, input = {}) {
    if (this.failed || !Number.isFinite(dt) || dt <= 0) return;
    // Substeps keep light/noise decay and close-range capture consistent even
    // when callers advance the simulation by a larger interval in tests.
    let remaining = dt;
    while (remaining > 0 && !this.failed) {
      const step = Math.min(remaining, 0.1);
      this.tick(step, input);
      remaining -= step;
    }
  }

  tick(dt, {
    moving = false, sprinting = false, flashlightOn = false,
    hidden = false, calling = false, distance = Infinity, lineOfSight = false,
  }) {
    this.elapsed += dt;
    // The first outage gives time to learn the controls; subsequent outages
    // recur every 65 seconds. Emergency refuge lamps stay independent.
    this.blackout = this.elapsed >= 30 && (this.elapsed - 30) % 65 < 12;
    const lit = Boolean(flashlightOn);
    this.hidden = Boolean(hidden && !moving && !sprinting && !lit && !calling);

    const movementNoise = calling ? 1 : moving ? (sprinting ? 0.84 : 0.12) : 0;
    if (calling) this.noise = 1;
    if (this.noise < movementNoise) this.noise = Math.min(movementNoise, this.noise + dt * 0.75);
    else this.noise = Math.max(movementNoise, this.noise - dt * (this.hidden ? 0.4 : 0.2));
    this.noise = clamp(this.noise);

    const range = Number.isFinite(distance) ? Math.max(0, distance) : Infinity;
    const visible = lineOfSight && range < (lit ? 25 : 13);
    const heard = this.noise > 0.36 && range < 7 + this.noise * 17;
    if (this.hidden) this.detected -= dt * 0.55;
    else if (visible) this.detected += dt * (0.17 + 0.5 * clamp(1 - range / 25) + (lit ? 0.12 : 0));
    else if (heard) this.detected += dt * 0.19 * this.noise;
    else this.detected -= dt * 0.13;
    this.detected = clamp(this.detected);
    if (lineOfSight && range < 1.2 && !this.hidden && this.detected > 0.75) this.failed = true;
  }
}
