export class Entity {
  constructor({ id, x = 0, y = 0, radius = 10, color = '#ffffff', type = 'entity', appearance = null }) {
    if (!id) throw new Error('Entity requires id');

    this.id = id;
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.color = color;

    // High-level classification (e.g. 'player')
    this.type = type;

    // Visual identity; for this game, players can all share a 'sheep' appearance.
    this.appearance = appearance;

    // Shared gameplay state
    this.isAlive = true;

    this.vx = 0;
    this.vy = 0;
  }

  setPosition(x, y) {
    this.x = x;
    this.y = y;
  }

  distanceTo(other) {
    return Math.hypot(this.x - other.x, this.y - other.y);
  }

  intersects(other) {
    return this.distanceTo(other) <= this.radius + other.radius;
  }

  update(_dtSec, _world) {
    // Base entity: no behavior
  }

  serialize() {
    return {
      id: this.id,
      type: this.type,
      appearance: this.appearance,
      isAlive: this.isAlive,
      color: this.color,
      x: Math.round(this.x),
      y: Math.round(this.y)
    };
  }
}
