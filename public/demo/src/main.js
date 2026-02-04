import './style.css'
import { AnimatedSprite, Application, Assets, Container, Graphics } from 'pixi.js'
import GameMap from './game/Map.js'
import Character from './game/Character.js'
import { isConnected, onMessage, onStatusChange, sendMessage } from './wsClient.js'

const app = new Application()
let appRoot = null
let loaderEl = null
let initPromise = null
let overlayEl = null
let overlayTitleEl = null
let overlayTextEl = null

const assetVersion = 'v3'
let tileSheet = null
let characterSheet = null

const tileWidth = 64
const tileHeight = 32

const mapWidth = 100
const mapHeight = 75

const createMapRng = (seed) => {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0xffffffff
  }
}

const generateMap = ({ width, height, seed }) => {
  const rng = createMapRng(seed)
  const mapData = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => 'tile_grass')
  )

  const fillRect = (x, y, w, h, tile) => {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        if (yy >= 0 && yy < height && xx >= 0 && xx < width) {
          mapData[yy][xx] = tile
        }
      }
    }
  }

  const penRects = []
  const penGaps = []

  const addPen = (x, y, w, h) => {
    const gapX = x + Math.floor(w / 2)
    const gapY = y + Math.floor(h / 2)

    const nearLeft = x <= 2
    const nearRight = x + w >= width - 2
    const nearTop = y <= 2
    const nearBottom = y + h >= height - 2

    let gapSide = 'bottom'
    if (nearLeft) gapSide = 'right'
    else if (nearRight) gapSide = 'left'
    else if (nearTop) gapSide = 'bottom'
    else if (nearBottom) gapSide = 'top'

    let gapPos = { x: gapX, y }
    if (gapSide === 'bottom') gapPos = { x: gapX, y: y + h - 1 }
    if (gapSide === 'left') gapPos = { x, y: gapY }
    if (gapSide === 'right') gapPos = { x: x + w - 1, y: gapY }

    for (let xx = x; xx < x + w; xx += 1) {
      if (!(gapSide === 'top' && xx === gapX)) {
        mapData[y][xx] = 'tile_wall_wood'
      }
      if (!(gapSide === 'bottom' && xx === gapX)) {
        mapData[y + h - 1][xx] = 'tile_wall_wood'
      }
    }

    for (let yy = y; yy < y + h; yy += 1) {
      if (!(gapSide === 'left' && yy === gapY)) {
        mapData[yy][x] = 'tile_wall_wood'
      }
      if (!(gapSide === 'right' && yy === gapY)) {
        mapData[yy][x + w - 1] = 'tile_wall_wood'
      }
    }

    penRects.push({ x, y, w, h })
    penGaps.push(gapPos)
  }

  const riverBaseX = 30 + Math.floor(rng() * 20)
  const riverAmpX = 2 + Math.floor(rng() * 3)
  const riverFreqX = 5 + Math.floor(rng() * 4)
  const riverShiftX = 18 + Math.floor(rng() * 20)
  const riverXAt = (y) =>
    riverBaseX + Math.floor(Math.sin((y + seed) / riverFreqX) * riverAmpX) + (y > riverShiftX ? 2 : 0)
  for (let y = 0; y < height; y += 1) {
    const riverX = riverXAt(y)
    mapData[y][riverX] = 'tile_water'
    mapData[y][riverX + 1] = 'tile_water'
  }
  const riverBaseY = 18 + Math.floor(rng() * 16)
  const riverAmpY = 1 + Math.floor(rng() * 3)
  const riverFreqY = 6 + Math.floor(rng() * 4)
  const riverShiftY = 40 + Math.floor(rng() * 25)
  const riverYAt = (x) =>
    riverBaseY + Math.floor(Math.sin((x + seed) / riverFreqY) * riverAmpY) + (x > riverShiftY ? 2 : 0)
  for (let x = 10; x < width - 10; x += 1) {
    const riverY = riverYAt(x)
    mapData[riverY][x] = 'tile_water'
    mapData[riverY + 1][x] = 'tile_water'
  }
  const river2BaseX = 60 + Math.floor(rng() * 25)
  const river2AmpX = 2 + Math.floor(rng() * 3)
  const river2FreqX = 4 + Math.floor(rng() * 4)
  const riverX2At = (y) => river2BaseX + Math.floor(Math.cos((y + seed) / river2FreqX) * river2AmpX)
  for (let y = 8; y < height - 8; y += 1) {
    const riverX2 = riverX2At(y)
    mapData[y][riverX2] = 'tile_water'
    mapData[y][riverX2 + 1] = 'tile_water'
  }

  const isAreaClear = (x, y, w, h) => {
    for (let yy = y; yy < y + h; yy += 1) {
      for (let xx = x; xx < x + w; xx += 1) {
        if (yy < 1 || yy >= height - 1 || xx < 1 || xx >= width - 1) return false
        if (mapData[yy][xx] !== 'tile_grass') return false
        for (let dy = -2; dy <= 2; dy += 1) {
          for (let dx = -2; dx <= 2; dx += 1) {
            const ny = yy + dy
            const nx = xx + dx
            if (ny < 0 || ny >= height || nx < 0 || nx >= width) continue
            if (mapData[ny][nx] === 'tile_water' || mapData[ny][nx] === 'tile_bridge') return false
          }
        }
      }
    }
    return true
  }

  const isPenTooClose = (x, y, w, h, minGap = 7) =>
    penRects.some(
      (pen) =>
        x < pen.x + pen.w + minGap &&
        x + w + minGap > pen.x &&
        y < pen.y + pen.h + minGap &&
        y + h + minGap > pen.y
    )

  const placePens = (count) => {
    let placed = 0
    let attempts = 0

    while (placed < count && attempts < count * 200) {
      attempts += 1
      const w = 5 + (rng() < 0.4 ? 1 : 0)
      const h = 4 + (rng() < 0.4 ? 1 : 0)
      const margin = 2
      const x = Math.floor(rng() * (width - w - margin * 2)) + margin
      const y = Math.floor(rng() * (height - h - margin * 2)) + margin

      if (!isAreaClear(x, y, w, h)) continue
      if (isPenTooClose(x, y, w, h, 7)) continue
      addPen(x, y, w, h)
      placed += 1
    }
  }

  const penCount = 6 + Math.floor(rng() * 6)
  placePens(penCount)

  const isInsidePen = (x, y) =>
    penRects.some((pen) => x >= pen.x && x < pen.x + pen.w && y >= pen.y && y < pen.y + pen.h)

  const isNearPen = (x, y, dist) =>
    penRects.some(
      (pen) =>
        x >= pen.x - dist &&
        x < pen.x + pen.w + dist &&
        y >= pen.y - dist &&
        y < pen.y + pen.h + dist
    )

  const isNearGap = (x, y) =>
    penGaps.some((gap) => Math.abs(gap.x - x) + Math.abs(gap.y - y) <= 2)

  const sprinkleHighGrass = (count) => {
    let placed = 0
    let attempts = 0
    while (placed < count && attempts < count * 20) {
      attempts += 1
      const x = Math.floor(rng() * width)
      const y = Math.floor(rng() * height)
      if (mapData[y][x] !== 'tile_grass') continue
      if (isInsidePen(x, y)) continue
      if (isNearGap(x, y)) continue
      mapData[y][x] = 'tile_high_grass'
      placed += 1
    }
  }

  sprinkleHighGrass(650)

  const bridges = []
  const isWater = (x, y) => mapData[y]?.[x] === 'tile_water'
  const canPlaceBridgeTile = (x, y) =>
    isWater(x, y) && !isInsidePen(x, y) && !isNearPen(x, y, 2)

  const placeVerticalBridgeAt = (y, xAt) => {
    if (y < 1 || y >= height - 2) return false
    const topX = xAt(y)
    const bottomX = xAt(y + 1)
    if (
      !canPlaceBridgeTile(topX, y) ||
      !canPlaceBridgeTile(topX + 1, y) ||
      !canPlaceBridgeTile(bottomX, y + 1) ||
      !canPlaceBridgeTile(bottomX + 1, y + 1)
    ) {
      return false
    }
    if (
      isWater(topX - 1, y) ||
      isWater(topX + 2, y) ||
      isWater(bottomX - 1, y + 1) ||
      isWater(bottomX + 2, y + 1)
    ) {
      return false
    }
    mapData[y][topX] = 'tile_bridge'
    mapData[y][topX + 1] = 'tile_bridge'
    mapData[y + 1][bottomX] = 'tile_bridge'
    mapData[y + 1][bottomX + 1] = 'tile_bridge'
    bridges.push({ x: topX, y })
    bridges.push({ x: bottomX, y: y + 1 })
    return true
  }

  const placeVerticalBridge = (y, xAt) => {
    const offsets = [0, 2, -2, 4, -4, 6, -6]
    for (const offset of offsets) {
      if (placeVerticalBridgeAt(y + offset, xAt)) return
    }
  }

  const placeHorizontalBridgeAt = (x, yAt) => {
    if (x < 1 || x >= width - 2) return false
    const leftY = yAt(x)
    const rightY = yAt(x + 1)
    if (
      !canPlaceBridgeTile(x, leftY) ||
      !canPlaceBridgeTile(x, leftY + 1) ||
      !canPlaceBridgeTile(x + 1, rightY) ||
      !canPlaceBridgeTile(x + 1, rightY + 1)
    ) {
      return false
    }
    if (
      isWater(x, leftY - 1) ||
      isWater(x, leftY + 2) ||
      isWater(x + 1, rightY - 1) ||
      isWater(x + 1, rightY + 2)
    ) {
      return false
    }
    mapData[leftY][x] = 'tile_bridge'
    mapData[leftY + 1][x] = 'tile_bridge'
    mapData[rightY][x + 1] = 'tile_bridge'
    mapData[rightY + 1][x + 1] = 'tile_bridge'
    bridges.push({ x, y: leftY })
    bridges.push({ x: x + 1, y: rightY })
    return true
  }

  const placeHorizontalBridge = (x, yAt) => {
    const offsets = [0, 2, -2, 4, -4, 6, -6]
    for (const offset of offsets) {
      if (placeHorizontalBridgeAt(x + offset, yAt)) return
    }
  }

  placeVerticalBridge(20 + Math.floor(rng() * 20), riverXAt)
  placeVerticalBridge(40 + Math.floor(rng() * 20), riverXAt)
  placeVerticalBridge(16 + Math.floor(rng() * 20), riverX2At)
  placeVerticalBridge(36 + Math.floor(rng() * 20), riverX2At)

  placeHorizontalBridge(22 + Math.floor(rng() * 20), riverYAt)
  placeHorizontalBridge(50 + Math.floor(rng() * 20), riverYAt)

  fillRect(42, 28, 3, 3, 'tile_grass')
  fillRect(76, 32, 3, 2, 'tile_grass')
  fillRect(64, 56, 4, 3, 'tile_grass')

  const placeStone = (x, y) => {
    if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) return
    if (mapData[y][x] === 'tile_water') return
    if (mapData[y][x] === 'tile_wall_wood') return
    if (isInsidePen(x, y)) return
    mapData[y][x] = 'tile_wall_stone'
  }

  const shortWall = (x, y, length, horizontal = true, gaps = []) => {
    for (let i = 0; i < length; i += 1) {
      if (gaps.includes(i)) continue
      const wx = horizontal ? x + i : x
      const wy = horizontal ? y : y + i
      placeStone(wx, wy)
    }
  }

  shortWall(12, 15, 8, true, [3])
  shortWall(16, 17, 6, true, [1, 4])
  shortWall(20, 20, 7, true, [5])
  shortWall(14, 22, 5, false, [2])

  shortWall(46, 16, 9, true, [2, 6])
  shortWall(52, 19, 6, false, [3])
  shortWall(60, 26, 7, true, [4])

  shortWall(34, 36, 8, true, [1, 5])
  shortWall(40, 40, 6, true, [2])
  shortWall(30, 42, 5, false, [1])

  for (let x = 0; x < width; x += 1) {
    mapData[0][x] = 'tile_wall_stone'
    mapData[height - 1][x] = 'tile_wall_stone'
  }
  for (let y = 0; y < height; y += 1) {
    mapData[y][0] = 'tile_wall_stone'
    mapData[y][width - 1] = 'tile_wall_stone'
  }

  const clearBridgeApproach = (x, y) => {
    for (let yy = y - 2; yy <= y + 3; yy += 1) {
      for (let xx = x - 2; xx <= x + 3; xx += 1) {
        if (yy < 1 || yy >= height - 1 || xx < 1 || xx >= width - 1) continue
        if (isInsidePen(xx, yy)) continue
        if (mapData[yy][xx] === 'tile_wall_wood' || mapData[yy][xx] === 'tile_wall_stone') {
          mapData[yy][xx] = 'tile_grass'
        }
      }
    }
  }

  bridges.forEach((bridge) => {
    clearBridgeApproach(bridge.x, bridge.y)
  })

  const isPenIntact = (pen, gap) => {
    const { x, y, w, h } = pen
    const gapKey = `${gap.x},${gap.y}`
    for (let xx = x; xx < x + w; xx += 1) {
      const topKey = `${xx},${y}`
      const bottomKey = `${xx},${y + h - 1}`
      if (topKey !== gapKey && mapData[y][xx] !== 'tile_wall_wood') return false
      if (bottomKey !== gapKey && mapData[y + h - 1][xx] !== 'tile_wall_wood') return false
    }
    for (let yy = y; yy < y + h; yy += 1) {
      const leftKey = `${x},${yy}`
      const rightKey = `${x + w - 1},${yy}`
      if (leftKey !== gapKey && mapData[yy][x] !== 'tile_wall_wood') return false
      if (rightKey !== gapKey && mapData[yy][x + w - 1] !== 'tile_wall_wood') return false
    }
    return true
  }

  const clearPenArea = (pen) => {
    for (let yy = pen.y; yy < pen.y + pen.h; yy += 1) {
      for (let xx = pen.x; xx < pen.x + pen.w; xx += 1) {
        if (mapData[yy][xx] === 'tile_wall_wood') {
          mapData[yy][xx] = 'tile_grass'
        }
      }
    }
  }

  const relocateBrokenPens = () => {
    const intactPens = []
    const intactGaps = []
    let brokenCount = 0

    penRects.forEach((pen, index) => {
      if (!isPenIntact(pen, penGaps[index])) {
        clearPenArea(pen)
        brokenCount += 1
      } else {
        intactPens.push(pen)
        intactGaps.push(penGaps[index])
      }
    })

    if (brokenCount === 0) return

    penRects.length = 0
    penGaps.length = 0
    intactPens.forEach((pen, index) => {
      penRects.push(pen)
      penGaps.push(intactGaps[index])
    })

    placePens(brokenCount)
  }

  relocateBrokenPens()

  return { mapData, penRects }
}

const originalSeed = 1337
const grassCount = 24
const penCount = 4
let activeSeed = null
let startPayload = null
let localPlayerId = null
let localPlayerColor = null
let currentRole = null

const grassIds = new Set()
const penIds = new Set()
let generatedGrassIds = []
let penRects = []
let penIdsByRect = []
const grassEatIntervalMs = 1000
let lastGrassTileId = null
let lastGrassEatAt = 0
let activePenId = null
let dayEndsAt = 0
let dayStartAt = 0
let dayLengthMs = 0
let lastDayEndsAt = 0

let map
let world
let character
let effectsLayer
let lightingOverlay
const activeEffects = []
const remotePlayers = new Map()

const parseTint = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const hex = value.trim().replace('#', '')
    if (/^[0-9a-fA-F]{6}$/.test(hex)) return Number.parseInt(hex, 16)
  }
  return null
}

const randomColor = () => {
  const colors = [0xff6b6b, 0x4dabf7, 0xffd43b, 0x51cf66, 0x845ef7]
  return colors[Math.floor(Math.random() * colors.length)]
}

const getRandomWalkableTile = (currentMap) => {
  for (let i = 0; i < 500; i += 1) {
    const x = Math.floor(Math.random() * mapWidth)
    const y = Math.floor(Math.random() * mapHeight)
    if (currentMap.isWalkable(x, y)) {
      return { x, y }
    }
  }
  return { x: 1, y: 1 }
}

const buildGame = (seed) => {
  const { mapData, penRects: nextPenRects } = generateMap({ width: mapWidth, height: mapHeight, seed })
  generatedGrassIds = collectGrassIdsFromMap(mapData)
  penRects = Array.isArray(nextPenRects) ? nextPenRects : []
  penIdsByRect = penRects.map((_, index) => `pen_${index + 1}`)

  if (world) {
    app.stage.removeChild(world)
    world.destroy({ children: true })
  }

  map = new GameMap({
    data: mapData,
    textures: tileSheet.textures,
    tileWidth,
    tileHeight,
    tileScale: 1,
  })

  world = new Container()
  world.sortableChildren = true
  world.addChild(map.container)

  effectsLayer = new Container()
  effectsLayer.sortableChildren = true
  effectsLayer.zIndex = 10000

  lightingOverlay = new Graphics()
  lightingOverlay.rect(-10000, -10000, 20000, 20000)
  lightingOverlay.fill({ color: 0x081018, alpha: 1 })
  lightingOverlay.zIndex = 500000

  character = new Character({
    map,
    textures: characterSheet.animations.walk,
    tileWidth,
    tileHeight,
    renderScale: 0.2,
    colorTint: localPlayerColor ?? 0xffffff,
  })

  const spawnTile = getRandomWalkableTile(map)
  character.gridX = spawnTile.x
  character.gridY = spawnTile.y
  const spawnScreen = map.gridToScreen(spawnTile.x, spawnTile.y)
  character.screenX = spawnScreen.x
  character.screenY = spawnScreen.y
  character.updatePosition()

  world.addChild(character.sprite)
  world.addChild(lightingOverlay)
  world.addChild(effectsLayer)
  app.stage.addChild(world)
  centerWorld()
}

const cameraOffsetY = 120
const centerWorld = () => {
  if (!world) return
  let targetSprite = character?.sprite
  if (!localIsAlive && spectateTargetId) {
    targetSprite = remotePlayers.get(spectateTargetId)?.sprite ?? targetSprite
  }
  if (!targetSprite) return
  world.x = app.screen.width / 2 - targetSprite.x
  world.y = app.screen.height / 2 - targetSprite.y + cameraOffsetY
}

let seedLabel
let statusLabel
let roleLabel
let roomLabel
let countdownLabel
let dayLabel
let dayTimerLabel
let lifeLabel
let deathLabel
let gameEndLabel

let started = false
let startSent = false
let lastPositionSentAt = 0
let hasRole = false
let countdownTimer = null
let gameOver = false
let localIsAlive = true
let localDeathReason = null
let gameEndInfo = null
let loaderVisible = false
let spectateTargetId = null

function setLoaderVisible(visible) {
  if (!loaderEl) return
  loaderVisible = Boolean(visible)
  loaderEl.classList.toggle('is-visible', Boolean(visible))
}

function setStatus(text) {
  if (!statusLabel) return
  statusLabel.textContent = `Status: ${text}`
}

function setRole(text) {
  if (!roleLabel) return
  roleLabel.textContent = `Role: ${text}`
}

function setRoom(text) {
  if (!roomLabel) return
  roomLabel.textContent = `Room: ${text}`
}

function setCountdown(text) {
  if (!countdownLabel) return
  countdownLabel.textContent = `Countdown: ${text}`
}

function setDay(text) {
  if (!dayLabel) return
  dayLabel.textContent = `Day: ${text}`
}

function setDayTimer(text) {
  if (!dayTimerLabel) return
  dayTimerLabel.textContent = `Day ends: ${text}`
}

function setLabelVisible(label, visible) {
  if (!label) return
  label.style.display = visible ? 'block' : 'none'
}

function setLife(text) {
  if (!lifeLabel) return
  lifeLabel.textContent = `Life: ${text}`
  setLabelVisible(lifeLabel, text !== '-' && text !== 'Alive')
}

function setDeath(text) {
  if (!deathLabel) return
  deathLabel.textContent = `Death: ${text}`
  setLabelVisible(deathLabel, text !== '-')
}

function setGameEnd(text) {
  if (!gameEndLabel) return
  gameEndLabel.textContent = `Game: ${text}`
  setLabelVisible(gameEndLabel, text !== '-')
}

function setRightHudVisible(visible) {
  setLabelVisible(countdownLabel, visible)
  setLabelVisible(dayLabel, visible)
  setLabelVisible(dayTimerLabel, visible)
  setLabelVisible(lifeLabel, visible)
  setLabelVisible(deathLabel, visible)
  setLabelVisible(gameEndLabel, visible)
}

function setOverlayVisible(visible) {
  if (!overlayEl) return
  overlayEl.style.display = visible ? 'flex' : 'none'
}

function showOverlay(title, message) {
  if (!overlayEl || !overlayTitleEl || !overlayTextEl) return
  overlayTitleEl.textContent = title
  overlayTextEl.textContent = message
  setOverlayVisible(true)
}

const deathReasonLabel = (reason) => {
  switch (reason) {
    case 0:
      return 'Wolf in pen'
    case 1:
      return 'Not in pen'
    case 2:
      return 'Not enough grass'
    case 3:
      return 'Wolf hunger'
    default:
      return 'Unknown'
  }
}

const gameEndReasonLabel = (reason) => {
  switch (reason) {
    case 0:
      return 'Wolves eliminated'
    case 1:
      return 'Sheep eliminated'
    case 2:
      return 'Survived days'
    default:
      return '-'
  }
}

function currentPositionPayload() {
  if (!character?.sprite) return { x: 0, y: 0 }
  return { x: character.sprite.x, y: character.sprite.y }
}

function tileIdFor(x, y) {
  return `tile_${x}_${y}`
}

function applyGrassTiles(ids) {
  if (!map || !Array.isArray(ids)) return
  for (const id of ids) {
    const match = /^tile_(\d+)_(\d+)$/.exec(id)
    if (!match) continue
    const x = Number(match[1])
    const y = Number(match[2])
    if (Number.isFinite(x) && Number.isFinite(y)) {
      map.setTile(x, y, 'tile_high_grass')
    }
  }
}

function collectGrassIdsFromMap(mapData) {
  if (!Array.isArray(mapData)) return []
  const ids = []
  for (let y = 0; y < mapData.length; y += 1) {
    const row = mapData[y]
    if (!Array.isArray(row)) continue
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === 'tile_high_grass') {
        ids.push(`tile_${x}_${y}`)
      }
    }
  }
  return ids
}

function findPenRectIndex(x, y) {
  for (let i = 0; i < penRects.length; i += 1) {
    const pen = penRects[i]
    if (!pen) continue
    if (x >= pen.x && x < pen.x + pen.w && y >= pen.y && y < pen.y + pen.h) {
      return i
    }
  }
  return -1
}

function createSeededRng(seed) {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function collectSpawnTiles() {
  if (!map) return []
  const tiles = []
  for (let y = 1; y < map.height - 1; y += 1) {
    for (let x = 1; x < map.width - 1; x += 1) {
      if (map.isWalkable(x, y)) {
        tiles.push({ x, y })
      }
    }
  }
  return tiles
}

function generateSpawnIdsFromMap(seed, count, salt) {
  const rng = createSeededRng((seed + salt) >>> 0)
  const tiles = collectSpawnTiles()
  for (let i = tiles.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[tiles[i], tiles[j]] = [tiles[j], tiles[i]]
  }
  return tiles.slice(0, Math.min(count, tiles.length)).map((tile) => `tile_${tile.x}_${tile.y}`)
}

function handleRoomStart(payload) {
  if (!payload) return
  activeSeed = Number.isFinite(payload.seed) ? payload.seed : originalSeed
  seedLabel.textContent = `Seed: ${activeSeed}`
  buildGame(activeSeed)
  clearRemotePlayers()
  grassIds.clear()
  penIds.clear()
  penIdsByRect = penRects.map((_, index) => `pen_${index + 1}`)
  lastGrassTileId = null
  lastGrassEatAt = 0
  activePenId = null
  dayEndsAt = 0
  currentRole = null
  if (Array.isArray(payload.grass)) {
    payload.grass.forEach((id) => grassIds.add(id))
    applyGrassTiles(payload.grass)
  }
  if (Array.isArray(payload.pens)) {
    payload.pens.forEach((id) => penIds.add(id))
    if (payload.pens.length === penIdsByRect.length) {
      penIdsByRect = [...payload.pens]
    }
  }
  started = false
  hasRole = false
  gameOver = false
  localIsAlive = true
  localDeathReason = null
  gameEndInfo = null
  setLife('-')
  setDeath('-')
  setGameEnd('-')
  setRightHudVisible(true)
  setOverlayVisible(false)
  setLoaderVisible(true)
  if (countdownTimer) clearInterval(countdownTimer)
  let seconds = 3
  setCountdown(seconds)
  countdownTimer = setInterval(() => {
    seconds -= 1
    if (seconds <= 0) {
      clearInterval(countdownTimer)
      countdownTimer = null
      setCountdown('Waiting for role…')
      return
    }
    setCountdown(seconds)
  }, 1000)
  if (payload.startId) {
    sendMessage('RoomStartAck', {
      startId: payload.startId,
      position: currentPositionPayload(),
    })
  }
}

function handleRoomState(payload) {
  if (!payload) return
  const status = payload.started ? 'started' : 'waiting'
  const players = Array.isArray(payload.players) ? payload.players.length : 0
  const alive = Array.isArray(payload.players)
    ? payload.players.filter((player) => player?.isAlive !== false).length
    : 0
  setRoom(`${payload.roomId ?? 'unknown'} (${alive}/${players} alive, ${status})`)
  updateDayFromState(payload)
  applyLocalPlayerColor(payload.players)
  updateRemotePlayers(payload.players)
  updateLocalLifeState(payload.players)
  updateSpectateTarget(payload.players)
  if (payload.started && hasRole && localIsAlive && !gameOver) started = true
}

function updateLocalLifeState(players) {
  if (!localPlayerId || !Array.isArray(players)) return
  const local = players.find((player) => player?.id === localPlayerId)
  if (!local) return
  localIsAlive = local.isAlive !== false
  localDeathReason = local.deathReason ?? null
  if (character?.sprite) character.sprite.visible = localIsAlive
  setLife(localIsAlive ? 'Alive' : 'Dead')
  setDeath(localIsAlive ? '-' : deathReasonLabel(localDeathReason))
  if (!localIsAlive) {
    started = false
    setCountdown('Spectating')
    if (!gameOver) {
      showOverlay('You Died', `Reason: ${deathReasonLabel(localDeathReason)}`)
    }
  }
}

function updateSpectateTarget(players) {
  if (localIsAlive || !Array.isArray(players)) {
    spectateTargetId = null
    return
  }

  const alive = players.filter((player) => player?.isAlive !== false && player.id !== localPlayerId)
  if (!alive.length) {
    spectateTargetId = null
    return
  }

  const stillAlive = alive.find((player) => player.id === spectateTargetId)
  if (stillAlive) return

  const pick = alive[Math.floor(Math.random() * alive.length)]
  spectateTargetId = pick?.id ?? null
}

function updateDayFromState(payload) {
  const day = Number.isFinite(payload?.day) ? payload.day : null
  if (day !== null) setDay(`${day}/${payload?.totalDays ?? '?'}`)
  const nextEndsAt = Number.isFinite(payload?.dayEndsAt) ? payload.dayEndsAt : 0
  if (nextEndsAt && nextEndsAt !== lastDayEndsAt) {
    dayEndsAt = nextEndsAt
    dayStartAt = Date.now()
    dayLengthMs = Math.max(0, dayEndsAt - dayStartAt)
    lastDayEndsAt = nextEndsAt
  }
}

function applyLocalPlayerColor(players) {
  if (!character || !localPlayerId || !Array.isArray(players)) return
  const local = players.find((player) => player?.id === localPlayerId)
  if (!local) return
  const tint = parseTint(local.color)
  if (tint === null) return
  if (localPlayerColor !== tint) {
    localPlayerColor = tint
    character.sprite.tint = tint
  }
}

function createRemoteSprite(color) {
  const sprite = new AnimatedSprite(characterSheet.animations.walk)
  sprite.animationSpeed = 0.15
  sprite.play()
  sprite.anchor.set(0.5, 1)
  sprite.scale.set(0.2)
  const tint = parseTint(color)
  if (tint !== null) sprite.tint = tint
  return sprite
}

function updateRemotePlayers(players) {
  if (!world || !Array.isArray(players)) return
  const seen = new Set()
  for (const player of players) {
    if (!player || player.id === localPlayerId) continue
    if (player.isAlive === false) continue
    seen.add(player.id)
    let remote = remotePlayers.get(player.id)
    if (!remote) {
      const sprite = createRemoteSprite(player.color)
      remote = {
        sprite,
        targetX: Number.isFinite(player.x) ? player.x : 0,
        targetY: Number.isFinite(player.y) ? player.y : 0,
        baseScaleX: sprite.scale.x,
        baseScaleY: sprite.scale.y,
        lastGrassTileId: null,
        lastGrassAt: 0,
      }
      sprite.x = remote.targetX
      sprite.y = remote.targetY
      sprite.zIndex = sprite.y + 1
      remotePlayers.set(player.id, remote)
      world.addChild(sprite)
    }
    const tint = parseTint(player.color)
    if (tint !== null) remote.sprite.tint = tint
    if (Number.isFinite(player.x) && Number.isFinite(player.y)) {
      remote.targetX = player.x
      remote.targetY = player.y
    }
  }

  for (const [id, remote] of remotePlayers.entries()) {
    if (seen.has(id)) continue
    world.removeChild(remote.sprite)
    remote.sprite.destroy()
    remotePlayers.delete(id)
  }
}

function clearRemotePlayers() {
  for (const remote of remotePlayers.values()) {
    world?.removeChild(remote.sprite)
    remote.sprite.destroy()
  }
  remotePlayers.clear()
}

function updateRemoteMovement(deltaMS) {
  const alpha = 1 - Math.exp(-deltaMS / 120)
  for (const remote of remotePlayers.values()) {
    const { sprite, targetX, targetY, baseScaleX, baseScaleY } = remote
    if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) continue
    const dx = targetX - sprite.x
    const dy = targetY - sprite.y
    sprite.x += dx * alpha
    sprite.y += dy * alpha
    sprite.zIndex = sprite.y + 1
    if (Math.abs(dx) > 0.5) {
      sprite.scale.x = dx < 0 ? -Math.abs(baseScaleX) : Math.abs(baseScaleX)
      sprite.scale.y = baseScaleY
    }

    if (map && grassIds.size) {
      const grid = map.screenToGrid(sprite.x, sprite.y - tileHeight / 2)
      const gx = Math.round(grid.x)
      const gy = Math.round(grid.y)
      const tileId = tileIdFor(gx, gy)
      const now = performance.now()
      if (grassIds.has(tileId)) {
        if (remote.lastGrassTileId !== tileId) {
          remote.lastGrassTileId = tileId
          remote.lastGrassAt = now
        } else if (now - remote.lastGrassAt >= grassEatIntervalMs) {
          remote.lastGrassAt = now
          spawnEatEffectAtTile(gx, gy)
        }
      } else {
        remote.lastGrassTileId = null
        remote.lastGrassAt = 0
      }
    }
  }
}

function spawnEatEffectAtTile(x, y) {
  if (!map || !effectsLayer) return
  const pos = map.gridToScreen(x, y)
  spawnEatEffect(pos.x, pos.y)
}

function spawnEatEffect(x, y) {
  if (!effectsLayer) return
  const ring = new Graphics()
  ring.lineStyle(2, 0x9cff57, 1)
  ring.drawCircle(0, 0, 10)
  ring.endFill()
  ring.x = x
  ring.y = y
  ring.zIndex = y + 1000
  effectsLayer.addChild(ring)

  activeEffects.push({
    sprite: ring,
    life: 0,
    duration: 350,
    startScale: 0.6,
    endScale: 1.4,
  })
}

function updateEffects(deltaMS) {
  if (!activeEffects.length) return
  for (let i = activeEffects.length - 1; i >= 0; i -= 1) {
    const effect = activeEffects[i]
    effect.life += deltaMS
    const t = Math.min(1, effect.life / effect.duration)
    const scale = effect.startScale + (effect.endScale - effect.startScale) * t
    effect.sprite.scale.set(scale)
    effect.sprite.alpha = 1 - t
    if (t >= 1) {
      effectsLayer?.removeChild(effect.sprite)
      effect.sprite.destroy()
      activeEffects.splice(i, 1)
    }
  }
}

function updateDayNight() {
  if (!lightingOverlay) return
  if (!dayEndsAt || dayEndsAt <= Date.now()) {
    lightingOverlay.alpha = 0
    return
  }
  const totalMs = Math.max(1, dayLengthMs || (dayEndsAt - dayStartAt))
  const remaining = Math.max(0, dayEndsAt - Date.now())
  const t = 1 - remaining / totalMs
  const nightFactor = Math.min(1, Math.max(0, (t - 0.3) / 0.7))
  lightingOverlay.alpha = 0.08 + 0.8 * nightFactor
}

function trySendRoomStart() {
  if (startSent || !startPayload || startPayload.host !== true) return
  if (!map) return

  const seed = Number.isFinite(startPayload.seed) ? startPayload.seed : activeSeed
  if (!Number.isFinite(seed)) return

  const grass = generatedGrassIds.length ? [...generatedGrassIds] : generateSpawnIdsFromMap(seed, grassCount, 101)
  const pens = penIdsByRect.length ? [...penIdsByRect] : generateSpawnIdsFromMap(seed, penCount, 707)
  sendMessage('RoomStart', { roomId: startPayload.roomId, seed, grass, pens })
  startSent = true
}

function registerNetworkHandlers() {
  onMessage((message) => {
    const { type, payload } = message ?? {}

    if (type === 'RoomStart') {
      handleRoomStart(payload)
      return
    }

    if (type === 'PlayerRole') {
      if (payload?.role) {
        setRole(payload.role)
        currentRole = payload.role
        hasRole = true
        started = true
        if (countdownTimer) {
          clearInterval(countdownTimer)
          countdownTimer = null
        }
        setCountdown('GO')
        setLoaderVisible(false)
      }
      return
    }

    if (type === 'GrassEat') {
      const grassId = payload?.grassId
      if (typeof grassId === 'string' && grassIds.has(grassId)) {
        grassIds.delete(grassId)
        const match = /^tile_(\d+)_(\d+)$/.exec(grassId)
        if (match && map) {
          const x = Number(match[1])
          const y = Number(match[2])
          if (Number.isFinite(x) && Number.isFinite(y)) {
            map.setTile(x, y, 'tile_grass')
            spawnEatEffectAtTile(x, y)
          }
        }
      }
      return
    }

    if (type === 'DayStart') {
      const day = Number.isFinite(payload?.day) ? payload.day : 0
      setDay(`${day}`)
      dayEndsAt = Number.isFinite(payload?.dayEndsAt) ? payload.dayEndsAt : 0
      dayStartAt = Date.now()
      dayLengthMs = dayEndsAt ? Math.max(0, dayEndsAt - dayStartAt) : 0
      if (!gameOver && hasRole && localIsAlive) {
        started = true
        setCountdown('GO')
      }
      return
    }

    if (type === 'DayEnd') {
      setDay(`ended (${payload?.day ?? '-'})`)
      dayEndsAt = 0
      dayStartAt = 0
      dayLengthMs = 0
      setDayTimer('-')
      started = false
      setCountdown('Day ended')
      return
    }

    if (type === 'GameEnd') {
      const winner = payload?.winner ? String(payload.winner) : '-'
      const reason = gameEndReasonLabel(payload?.reason)
      setDay('game over')
      dayEndsAt = 0
      dayStartAt = 0
      dayLengthMs = 0
      setDayTimer('-')
      started = false
      gameOver = true
      gameEndInfo = { winner, reason }
      setGameEnd(`${winner} (${reason})`)
      setCountdown('Game over')
      setRightHudVisible(true)
      const deathNote =
        !localIsAlive || localDeathReason !== null
          ? `You died: ${deathReasonLabel(localDeathReason)}`
          : ''
      const details = [reason, deathNote].filter(Boolean).join(' • ')
      showOverlay(`Game Over - ${winner} wins`, details || '-')
      return
    }

    if (type === 'RoomState') {
      handleRoomState(payload)
    }
  })
}

export async function initGame() {
  if (initPromise) return initPromise

  initPromise = (async () => {
    await app.init({
      backgroundColor: 0x1b1b1b,
      resizeTo: window,
      antialias: true,
    })

    appRoot = document.querySelector('#app')
    loaderEl = document.querySelector('#loader')
    appRoot.appendChild(app.canvas)

    ;[tileSheet, characterSheet] = await Promise.all([
      Assets.load(`/assets/tilesheet.json?${assetVersion}`),
      Assets.load(`/assets/character_sheet.json?${assetVersion}`),
    ])

    seedLabel = document.createElement('div')
    seedLabel.className = 'ui-button'
    seedLabel.textContent = 'Seed: waiting'
    appRoot.appendChild(seedLabel)

    statusLabel = document.createElement('div')
    statusLabel.className = 'ui-button'
    statusLabel.style.top = '60px'
    statusLabel.textContent = 'Status: offline'
    appRoot.appendChild(statusLabel)

    roomLabel = document.createElement('div')
    roomLabel.className = 'ui-button'
    roomLabel.style.top = '104px'
    roomLabel.textContent = 'Room: ?'
    appRoot.appendChild(roomLabel)

    roleLabel = document.createElement('div')
    roleLabel.className = 'ui-button'
    roleLabel.style.top = '148px'
    roleLabel.textContent = 'Role: ?'
    appRoot.appendChild(roleLabel)

    countdownLabel = document.createElement('div')
    countdownLabel.className = 'ui-button'
    countdownLabel.style.top = '192px'
    countdownLabel.style.right = '16px'
    countdownLabel.style.left = 'auto'
    countdownLabel.style.display = 'none'
    countdownLabel.textContent = 'Countdown: -'
    appRoot.appendChild(countdownLabel)

    dayLabel = document.createElement('div')
    dayLabel.className = 'ui-button'
    dayLabel.style.top = '236px'
    dayLabel.style.right = '16px'
    dayLabel.style.left = 'auto'
    dayLabel.style.display = 'none'
    dayLabel.textContent = 'Day: -'
    appRoot.appendChild(dayLabel)

    dayTimerLabel = document.createElement('div')
    dayTimerLabel.className = 'ui-button'
    dayTimerLabel.style.top = '280px'
    dayTimerLabel.style.right = '16px'
    dayTimerLabel.style.left = 'auto'
    dayTimerLabel.style.display = 'none'
    dayTimerLabel.textContent = 'Day ends: -'
    appRoot.appendChild(dayTimerLabel)

    overlayEl = document.createElement('div')
    overlayEl.style.position = 'absolute'
    overlayEl.style.inset = '0'
    overlayEl.style.display = 'none'
    overlayEl.style.alignItems = 'center'
    overlayEl.style.justifyContent = 'center'
    overlayEl.style.background = 'rgba(0, 0, 0, 0.6)'
    overlayEl.style.zIndex = '99999'

    const overlayCard = document.createElement('div')
    overlayCard.style.padding = '24px 28px'
    overlayCard.style.borderRadius = '12px'
    overlayCard.style.background = 'rgba(20, 20, 20, 0.92)'
    overlayCard.style.border = '2px solid rgba(255, 255, 255, 0.15)'
    overlayCard.style.boxShadow = '0 12px 30px rgba(0,0,0,0.45)'
    overlayCard.style.textAlign = 'center'
    overlayCard.style.minWidth = '280px'

    overlayTitleEl = document.createElement('div')
    overlayTitleEl.style.fontSize = '24px'
    overlayTitleEl.style.fontWeight = '700'
    overlayTitleEl.style.marginBottom = '8px'
    overlayTitleEl.style.color = '#fff'

    overlayTextEl = document.createElement('div')
    overlayTextEl.style.fontSize = '16px'
    overlayTextEl.style.color = 'rgba(255,255,255,0.8)'

    overlayCard.appendChild(overlayTitleEl)
    overlayCard.appendChild(overlayTextEl)
    overlayEl.appendChild(overlayCard)
    appRoot.appendChild(overlayEl)

    lifeLabel = document.createElement('div')
    lifeLabel.className = 'ui-button'
    lifeLabel.style.top = '324px'
    lifeLabel.textContent = 'Life: -'
    lifeLabel.style.right = '16px'
    lifeLabel.style.left = 'auto'
    lifeLabel.style.display = 'none'
    appRoot.appendChild(lifeLabel)

    deathLabel = document.createElement('div')
    deathLabel.className = 'ui-button'
    deathLabel.style.top = '368px'
    deathLabel.textContent = 'Death: -'
    deathLabel.style.right = '16px'
    deathLabel.style.left = 'auto'
    deathLabel.style.display = 'none'
    appRoot.appendChild(deathLabel)

    gameEndLabel = document.createElement('div')
    gameEndLabel.className = 'ui-button'
    gameEndLabel.style.top = '412px'
    gameEndLabel.textContent = 'Game: -'
    gameEndLabel.style.right = '16px'
    gameEndLabel.style.left = 'auto'
    gameEndLabel.style.display = 'none'
    appRoot.appendChild(gameEndLabel)

    setRightHudVisible(true)

    setStatus(isConnected() ? 'connected' : 'offline')
    onStatusChange((status) => setStatus(status))

    centerWorld()
    window.addEventListener('resize', centerWorld)
    window.addEventListener('keydown', (event) => {
      character?.handleKey(event.key.toLowerCase(), true)
    })
    window.addEventListener('keyup', (event) => {
      character?.handleKey(event.key.toLowerCase(), false)
    })

    app.ticker.add((ticker) => {
      if (!character) return
      if (localIsAlive && !gameOver && !loaderVisible) {
        character.update(ticker.deltaMS)
      }
      centerWorld()
      updateRemoteMovement(ticker.deltaMS)
      updateEffects(ticker.deltaMS)
      updateDayNight()

      if (dayEndsAt) {
        const remaining = Math.max(0, Math.ceil((dayEndsAt - Date.now()) / 1000))
        setDayTimer(`${remaining}s`)
      }

      if (started && localIsAlive && !gameOver && !loaderVisible) {
        updatePenState()
        tryEatGrass()
        const now = performance.now()
        if (now - lastPositionSentAt > 100) {
          lastPositionSentAt = now
          sendMessage('PlayerPosition', { ...currentPositionPayload(), z: 0 })
        }
      }
    })

    registerNetworkHandlers()
  })()

  return initPromise
}

export function setGameVisible(visible) {
  const gameRoot = document.querySelector('#gameRoot')
  if (!gameRoot) return
  gameRoot.classList.toggle('is-hidden', !visible)
}

export function startGameSession(payload) {
  startPayload = payload
  localPlayerId = payload?.playerId ?? null
  const tint = parseTint(payload?.color)
  if (tint !== null) {
    localPlayerColor = tint
    if (character?.sprite) character.sprite.tint = tint
  }
  if (payload?.host) {
    activeSeed = Number.isFinite(payload.seed) ? payload.seed : originalSeed
    seedLabel.textContent = `Seed: ${activeSeed}`
    buildGame(activeSeed)
    setLoaderVisible(true)
    grassIds.clear()
    penIds.clear()
    penIdsByRect = penRects.map((_, index) => `pen_${index + 1}`)
    lastGrassTileId = null
    lastGrassEatAt = 0
    activePenId = null
    dayEndsAt = 0
    trySendRoomStart()
    return
  }

  if (payload?.seed !== undefined) {
    handleRoomStart(payload)
  }
}

function updatePenState() {
  if (!character || penIdsByRect.length === 0) return
  const tileId = tileIdFor(character.gridX, character.gridY)
  const penIndex = findPenRectIndex(character.gridX, character.gridY)
  const nextPenId = penIndex >= 0 ? penIdsByRect[penIndex] : null
  if (nextPenId === activePenId) return
  const penId = nextPenId ?? activePenId
  if (penId) {
    sendMessage('PenUpdate', { penId, inPen: Boolean(nextPenId) })
  }
  activePenId = nextPenId
}

function tryEatGrass() {
  if (!character || grassIds.size === 0) return
  const tileId = tileIdFor(character.gridX, character.gridY)
  if (!grassIds.has(tileId)) {
    lastGrassTileId = null
    lastGrassEatAt = 0
    return
  }

  const now = performance.now()
  if (lastGrassTileId !== tileId) {
    lastGrassTileId = tileId
    lastGrassEatAt = now
    return
  }

  if (now - lastGrassEatAt >= grassEatIntervalMs) {
    lastGrassEatAt = now
    if (currentRole !== 'wolf') {
      sendMessage('GrassEat', { grassId: tileId })
    }
    const match = /^tile_(\d+)_(\d+)$/.exec(tileId)
    if (match) {
      const x = Number(match[1])
      const y = Number(match[2])
      if (Number.isFinite(x) && Number.isFinite(y)) {
        spawnEatEffectAtTile(x, y)
      }
    }
  }
}
