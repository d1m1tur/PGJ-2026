import { Entity } from './Entity.js';

export const DeathReason = Object.freeze({
  WOLF_IN_PEN: 0,
  NOT_IN_PEN: 1,
  NOT_ENOUGH_GRASS: 2,
  WOLF_HUNGER: 3
});

export class Player extends Entity {
  constructor({ id, name, x, y, z, color, role = 'sheep' }) {
    super({ id, x, y, z, color, type: 'player' });
    this.name = name;

    // Hidden role (server-side).
    // Possible values: 'sheep' | 'wolf'
    this.role = role;

    // Game state
    this.isAlive = true;
    this.inPen = false;
    this.penId = null;
    this.deathReason = null;
  }

  update(_dtSec) {
    // No server-side movement for prototype
  }

  serialize() {
    return {
      ...super.serialize(),
      name: this.name,
      isAlive: this.isAlive,
      inPen: this.inPen,
      penId: this.penId,
      deathReason: this.deathReason
    };
  }
}
