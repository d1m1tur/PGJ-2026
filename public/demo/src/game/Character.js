import { AnimatedSprite } from 'pixi.js'

export default class Character {
  constructor({ map, textures, tileWidth, tileHeight, renderScale = 1, renderWidth, renderHeight, colorTint }) {
    this.map = map
    this.tileWidth = tileWidth
    this.tileHeight = tileHeight
    this.gridX = 2
    this.gridY = 2

    this.sprite = new AnimatedSprite(textures)
    this.sprite.animationSpeed = 0.15
    this.sprite.play()
    this.sprite.anchor.set(0.5, 1)

    if (colorTint !== undefined) {
      this.sprite.tint = colorTint
    }

    if (renderWidth || renderHeight) {
      const targetWidth = renderWidth ?? this.sprite.width
      const targetHeight = renderHeight ?? this.sprite.height
      this.sprite.width = targetWidth
      this.sprite.height = targetHeight
    } else if (renderScale !== 1) {
      this.sprite.scale.set(renderScale)
    }

    this.baseScaleX = this.sprite.scale.x
    this.baseScaleY = this.sprite.scale.y

    this.moveSpeed = 180 * 5;
    this.keyState = {
      w: false,
      a: false,
      s: false,
      d: false,
    }

    const start = this.map.gridToScreen(this.gridX, this.gridY)
    this.screenX = start.x
    this.screenY = start.y
    this.updatePosition()
  }

  handleKey(key, isDown) {
    if (key in this.keyState) {
      this.keyState[key] = isDown
    }
  }

  update(deltaMS) {
    let vx = 0
    let vy = 0

    if (this.keyState.w) vy -= 1
    if (this.keyState.s) vy += 1
    if (this.keyState.a) vx -= 1
    if (this.keyState.d) vx += 1

    if (vx === 0 && vy === 0) {
      return
    }

    this.updateFacing(vx)

    const length = Math.hypot(vx, vy) || 1
    const step = (this.moveSpeed * deltaMS) / 1000
    const nextX = this.screenX + (vx / length) * step
    const nextY = this.screenY + (vy / length) * step

    if (this.canOccupy(nextX, nextY)) {
      this.screenX = nextX
      this.screenY = nextY
      this.updateGridPosition()
      this.updatePosition()
    }
  }

  canOccupy(screenX, screenY) {
    const grid = this.map.screenToGrid(screenX, screenY)
    const gx = Math.round(grid.x)
    const gy = Math.round(grid.y)
    return this.map.isWalkable(gx, gy)
  }

  updateGridPosition() {
    const grid = this.map.screenToGrid(this.screenX, this.screenY)
    this.gridX = Math.round(grid.x)
    this.gridY = Math.round(grid.y)
  }

  updatePosition() {
    this.sprite.x = this.screenX
    this.sprite.y = this.screenY + this.tileHeight / 2
    this.sprite.zIndex = this.sprite.y + 1
  }

  updateFacing(vx) {
    if (vx < 0) {
      this.sprite.scale.x = -Math.abs(this.baseScaleX)
    } else if (vx > 0) {
      this.sprite.scale.x = Math.abs(this.baseScaleX)
    }

    this.sprite.scale.y = this.baseScaleY
  }
}
