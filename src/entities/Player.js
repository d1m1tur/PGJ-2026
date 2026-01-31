import { Entity } from './Entity.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class Player extends Entity {
  constructor({ id, name, x, y, color, role = 'sheep', appearance = 'sheep' }) {
    super({ id, x, y, color, radius: 10, type: 'player', appearance });
    this.name = name;

    // Hidden role (server-side). Everyone still *looks* like a sheep.
    // Possible values: 'sheep' | 'wolf'
    this.role = role;

    // Game state
    this.isAlive = true;

    this.input = { up: false, down: false, left: false, right: false };

    // Tweakable movement
    this.speed = 220;

    // Among-us style hooks (not yet wired into client UI)
    this.killCooldownSec = 12;
    this._killCooldownRemainingSec = 0;
  }

  get isImposter() {
    return this.role === 'wolf';
  }

  canKill() {
    return this.isAlive && this.isImposter && this._killCooldownRemainingSec <= 0;
  }

  tickCooldowns(dtSec) {
    this._killCooldownRemainingSec = Math.max(0, this._killCooldownRemainingSec - dtSec);
  }

  markKilled() {
    this.isAlive = false;
    this._killCooldownRemainingSec = 0;
  }

  onKill() {
    this._killCooldownRemainingSec = this.killCooldownSec;
  }

  setInput(input) {
    const next = input ?? {};
    this.input = {
      up: Boolean(next.up),
      down: Boolean(next.down),
      left: Boolean(next.left),
      right: Boolean(next.right)
    };
  }

  update(dtSec, world) {
    this.tickCooldowns(dtSec);

    if (!this.isAlive) return;

    const vx = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
    const vy = (this.input.down ? 1 : 0) - (this.input.up ? 1 : 0);

    this.x = clamp(this.x + vx * this.speed * dtSec, this.radius, world.width - this.radius);
    this.y = clamp(this.y + vy * this.speed * dtSec, this.radius, world.height - this.radius);
  }

  serialize() {
    return {
      ...super.serialize(),
      name: this.name
    };
  }
}
