export class Entity {
  constructor({ id, x = 0, y = 0, color = '#ffffff', type = 'entity' }) {
    if (!id) throw new Error('Entity requires id');

    this.id = id;
    this.x = x;
    this.y = y;
    this.color = color;

    // High-level classification (e.g. 'player')
    this.type = type;
  }

  serialize() {
    return {
      id: this.id,
      type: this.type,
      color: this.color,
      x: Math.round(this.x),
      y: Math.round(this.y)
    };
  }
}
