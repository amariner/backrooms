const CALL_COOLDOWN = 8;
const SHOUT_DURATION = 3.2;
const LURE_DURATION = 32;
const RESPONSE_CHANCE = 0.6;
const EPSILON = 1e-9;
const remainingAfter = (remaining, dt) => remaining - dt > EPSILON ? remaining - dt : 0;

/** A voice call only advances with game time, so pausing cannot summon anything. */
export class EntityCallState {
  constructor() {
    this.reset();
  }

  reset() {
    this.cooldown = 0;
    this.target = null;
    this.pending = null;
    this.count = 0;
    this._shoutRemaining = 0;
    this._lureRemaining = 0;
    return this;
  }

  get shouting() {
    return this._shoutRemaining > 0;
  }

  call(position, random = Math.random) {
    if (this.cooldown > 0 || !position
      || !Number.isFinite(position.x) || !Number.isFinite(position.z)) return false;

    this.cooldown = CALL_COOLDOWN;
    this._shoutRemaining = SHOUT_DURATION;
    this.count += 1;
    if (random() < RESPONSE_CHANCE) {
      this.pending = {
        // The entity investigates the place where the shout happened, not the player.
        position: Object.freeze({ x: position.x, z: position.z }),
        remaining: 1.3 + Math.min(1, Math.max(0, random())) * 2,
      };
    }
    return true;
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.cooldown = remainingAfter(this.cooldown, dt);
    this._shoutRemaining = remainingAfter(this._shoutRemaining, dt);

    if (this.pending && dt + EPSILON >= this.pending.remaining) {
      // Only the part of this update after the response delay ages the new lure.
      const responseAge = Math.max(0, dt - this.pending.remaining);
      this.target = this.pending.position;
      this.pending = null;
      this._lureRemaining = remainingAfter(LURE_DURATION, responseAge);
    } else {
      if (this.pending) this.pending.remaining = remainingAfter(this.pending.remaining, dt);
      this._lureRemaining = remainingAfter(this._lureRemaining, dt);
    }

    if (this._lureRemaining === 0) this.target = null;
  }

  finishLure() {
    this.target = null;
    this._lureRemaining = 0;
  }
}
