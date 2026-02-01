import { Entity } from './Entity.js';

export class Grass extends Entity {
  constructor({ id, health = 3 }) {
    super({ id, type: 'grass' });
    this.health = Math.max(0, Math.floor(Number.isFinite(health) ? health : 3));
  }

  setHealth(value) {
    const next = Number.isFinite(value) ? value : this.health;
    this.health = Math.max(0, Math.floor(next));
  }

  serialize() {
    return {
      ...super.serialize(),
      health: this.health
    };
  }
}
