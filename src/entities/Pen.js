import { Entity } from './Entity.js';

export class Pen extends Entity {
  constructor({ id }) {
    super({ id, type: 'pen' });
  }
}
