import { Container } from 'pixi.js'
import Tile from './Tile.js'

export default class Map {
  constructor({ data, textures, tileWidth, tileHeight, tileScale = 1 }) {
    this.data = data
    this.textures = textures
    this.tileScale = tileScale
    this.tileWidth = tileWidth * tileScale
    this.tileHeight = tileHeight * tileScale
    this.width = data[0].length
    this.height = data.length
    this.tileKeys = Object.keys(textures)

    this.container = new Container()
    this.container.sortableChildren = true

    this.tiles = []
    this.build()
  }

  build() {
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const tileType = this.data[y][x]
        const texture = this.resolveTileTexture(tileType)
        const style = this.getTileStyle(tileType)
        const tile = new Tile({
          texture,
          gridX: x,
          gridY: y,
          tileWidth: this.tileWidth,
          tileHeight: this.tileHeight,
          tileScale: this.tileScale,
          heightScale: style.heightScale,
          yOffset: style.yOffset,
        })

        const pos = this.gridToScreen(x, y)
        tile.setScreenPosition(pos.x, pos.y)

        this.tiles.push(tile)
        this.container.addChild(tile.sprite)
      }
    }
  }

  getTileAt(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null
    return this.tiles[y * this.width + x] ?? null
  }

  setTile(x, y, tileType) {
    const tile = this.getTileAt(x, y)
    if (!tile) return
    this.data[y][x] = tileType
    tile.sprite.texture = this.resolveTileTexture(tileType)
    tile.setStyle(this.getTileStyle(tileType))
  }

  gridToScreen(x, y) {
    return {
      x: (x - y) * (this.tileWidth / 2),
      y: (x + y) * (this.tileHeight / 2),
    }
  }

  resolveTileTexture(tileType) {
    if (!this.tileKeys.length) {
      return undefined
    }

    if (typeof tileType === 'string') {
      return this.textures[tileType]
    }

    const index = Math.max(0, Number(tileType))
    const key = this.tileKeys[index % this.tileKeys.length]
    return this.textures[key]
  }

  getTileStyle(tileType) {
    if (typeof tileType !== 'string') {
      return { heightScale: 1, yOffset: 0 }
    }

    const isWall = tileType.includes('wall')
    if (isWall) {
      return { heightScale: 1.4, yOffset: -10 * this.tileScale }
    }

    if (tileType === 'tile_high_grass') {
      return { heightScale: 1.15, yOffset: -4 * this.tileScale }
    }

    return { heightScale: 1, yOffset: 0 }
  }

  screenToGrid(screenX, screenY) {
    const halfW = this.tileWidth / 2
    const halfH = this.tileHeight / 2
    const gridX = (screenY / halfH + screenX / halfW) / 2
    const gridY = (screenY / halfH - screenX / halfW) / 2

    return { x: gridX, y: gridY }
  }

  isWalkable(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return false
    }

    const tile = this.data[y][x]

    if (typeof tile === 'number') {
      return tile === 0
    }

    const blocked = new Set(['tile_wall_stone', 'tile_wall_wood', 'tile_water'])
    return !blocked.has(tile)
  }
}
