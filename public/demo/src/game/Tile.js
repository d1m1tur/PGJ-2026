import { Sprite } from 'pixi.js'

export default class Tile {
  constructor({ texture, gridX, gridY, tileWidth, tileHeight, tileScale = 1, heightScale = 1, yOffset = 0 }) {
    this.gridX = gridX
    this.gridY = gridY
    this.tileWidth = tileWidth
    this.tileHeight = tileHeight
    this.sprite = new Sprite(texture)
    this.sprite.anchor.set(0.5, 0.5)
    if (tileScale !== 1) {
      this.sprite.scale.set(tileScale)
    }
    this.baseScaleX = this.sprite.scale.x
    this.baseScaleY = this.sprite.scale.y
    if (heightScale !== 1) {
      this.sprite.scale.y = this.baseScaleY * heightScale
    }
    this.yOffset = yOffset
    this.screenX = 0
    this.screenY = 0
  }

  setScreenPosition(x, y) {
    this.screenX = x
    this.screenY = y
    this.sprite.x = x
    this.sprite.y = y + this.yOffset
    this.sprite.zIndex = y + this.yOffset
  }

  setStyle({ heightScale = 1, yOffset = 0 } = {}) {
    this.yOffset = yOffset
    this.sprite.scale.x = this.baseScaleX
    this.sprite.scale.y = this.baseScaleY * heightScale
    this.setScreenPosition(this.screenX, this.screenY)
  }
}
