import './lobby.css'
import { connect, onMessage, onStatusChange, sendMessage, isConnected, waitForOpen } from './wsClient.js'

const statusEl = document.querySelector('#status')
const socketIdEl = document.querySelector('#socketId')
const playersEl = document.querySelector('#players')
const roomStateEl = document.querySelector('#roomState')
const hostInfoEl = document.querySelector('#hostInfo')
const lobbyListEl = document.querySelector('#lobbyList')
const refreshBtn = document.querySelector('#refresh')
const nameEl = document.querySelector('#name')
const roomEl = document.querySelector('#room')
const createBtn = document.querySelector('#create')
const joinBtn = document.querySelector('#join')
const leaveBtn = document.querySelector('#leave')
const startBtn = document.querySelector('#start')
const lobbyRoot = document.querySelector('#lobbyRoot')

let lobbyInfo = null
let currentState = null
let localPlayerId = null
let localPlayerColor = null
let hostId = null
let startHandler = null
let lobbyList = []
const pendingRequests = new Map()

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
      return ''
  }
}

function setStatus(text) {
  statusEl.textContent = text
}

function updateControlState() {
  const connected = isConnected()
  const isHost = Boolean(localPlayerId && hostId && localPlayerId === hostId)
  joinBtn.disabled = connected
  createBtn.disabled = connected
  leaveBtn.disabled = !connected
  startBtn.disabled = !connected || !isHost
}

function renderLobby() {
  if (!currentState && !lobbyInfo) {
    roomStateEl.textContent = '(none)'
    hostInfoEl.textContent = ''
    playersEl.innerHTML = ''
    return
  }

  if (!currentState) {
    const status = lobbyInfo?.started ? 'started' : 'waiting'
    const roomId = lobbyInfo?.roomId ?? '(unknown)'
    const names = Array.isArray(lobbyInfo?.players) ? lobbyInfo.players : []
    hostId = lobbyInfo?.hostId ?? null
    const isHost = Boolean(localPlayerId && hostId && localPlayerId === hostId)
    roomStateEl.textContent = `${roomId} (${names.length} players, ${status})`
    hostInfoEl.textContent = hostId
      ? `Host: ${isHost ? 'you' : hostId.slice(0, 8)}${isHost ? ' (you)' : ''}`
      : 'Host: (pending)'
    playersEl.innerHTML = ''
    for (const name of names) {
      const li = document.createElement('li')
      li.textContent = name
      li.style.opacity = '0.7'
      playersEl.appendChild(li)
    }
    updateControlState()
    return
  }

  const status = currentState.started ? 'started' : 'waiting'
  const roomId = currentState.roomId ?? '(unknown)'
  const players = Array.isArray(currentState.players) ? currentState.players : []
  const alive = players.filter((player) => player?.isAlive !== false).length
  roomStateEl.textContent = `${roomId} (${alive}/${players.length} alive, ${status})`
  hostInfoEl.textContent = hostId ? `Host: ${hostId.slice(0, 8)}` : ''

  playersEl.innerHTML = ''
  for (const player of players) {
    const li = document.createElement('li')
    const me = player.id === localPlayerId ? ' (you)' : ''
    const aliveText = player.isAlive === false ? ' - dead' : ''
    const reasonText = player.isAlive === false ? ` (${deathReasonLabel(player.deathReason) || 'unknown'})` : ''
    li.textContent = `${player.name}${me}${aliveText}${reasonText}`
    if (player.color) li.style.color = player.color
    playersEl.appendChild(li)
  }
}

function renderLobbyList() {
  lobbyListEl.innerHTML = ''
  if (!lobbyList.length) {
    const li = document.createElement('li')
    li.textContent = 'No open lobbies.'
    li.style.opacity = '0.7'
    lobbyListEl.appendChild(li)
    return
  }

  for (const lobby of lobbyList) {
    const li = document.createElement('li')
    li.className = 'lobby-item'

    const label = document.createElement('span')
    const status = lobby.started ? 'started' : 'open'
    label.textContent = `${lobby.roomId} (${lobby.players} players, ${status})`

    const join = document.createElement('button')
    join.textContent = 'Join'
    join.addEventListener('click', () => {
      roomEl.value = lobby.roomId
      joinRoom()
    })

    li.appendChild(label)
    li.appendChild(join)
    lobbyListEl.appendChild(li)
  }
}

function requestLobbyList() {
  connect()
  sendMessage('LobbyListRequest', { requestId: createRequestId() })
}

function initSocketHandlers() {
  onStatusChange((status) => {
    setStatus(status)
    if (status === 'disconnected') {
      socketIdEl.textContent = ''
      lobbyInfo = null
      currentState = null
      localPlayerId = null
      updateControlState()
      renderLobby()
      for (const { reject } of pendingRequests.values()) {
        reject?.(new Error('socket closed'))
      }
      pendingRequests.clear()
    }
  })

  onMessage((message) => {
    const { type, payload } = message ?? {}

    if (type === 'SessionWelcome') {
      socketIdEl.textContent = `session: ${payload?.sessionId ?? ''}`
      return
    }

    if (type === 'RoomLobby') {
      lobbyInfo = payload
      currentState = null
      hostId = payload?.hostId ?? null
      renderLobby()
      return
    }

    if (type === 'RoomState') {
      currentState = payload
      lobbyInfo = null
      renderLobby()
      return
    }

    if (type === 'RoomStart') {
      if (payload?.roomId && startHandler) {
        startHandler({
          roomId: payload.roomId,
          seed: payload.seed,
          grass: payload.grass,
          pens: payload.pens,
          startId: payload.startId,
          host: false,
          playerId: localPlayerId,
          color: localPlayerColor,
        })
      }
      return
    }

    if (type === 'LobbyList') {
      lobbyList = Array.isArray(payload?.lobbies) ? payload.lobbies : []
      renderLobbyList()
      return
    }

    if (type === 'RoomJoinAck' && payload?.requestId && pendingRequests.has(payload.requestId)) {
      const { resolve } = pendingRequests.get(payload.requestId)
      pendingRequests.delete(payload.requestId)
      resolve?.(payload)
    }
  })
}

function createRequestId() {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID()
  return `req_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

async function joinRoom({ create = false } = {}) {
  connect()
  await waitForOpen().catch(() => null)

  const roomId = roomEl.value
  const name = nameEl.value

  const requestId = createRequestId()
  const ack = await new Promise((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject })
    sendMessage('RoomJoin', { roomId, name, requestId, create })
    setTimeout(() => {
      if (!pendingRequests.has(requestId)) return
      pendingRequests.delete(requestId)
      reject(new Error('Join timed out'))
    }, 5000)
  }).catch((err) => ({ ok: false, error: err?.message ?? String(err) }))

  if (!ack?.ok) {
    alert(ack?.error ?? 'Failed to join')
    return
  }

  localPlayerId = ack.playerId
  localPlayerColor = ack.color ?? null
  currentState = null
  lobbyInfo = null
  const safeRoomId = typeof roomId === 'string' ? roomId.trim() : ''
  const safeName = typeof name === 'string' ? name.trim() : ''
  if (safeRoomId && safeName) {
    localStorage.setItem('pgj-lobby', JSON.stringify({ roomId: safeRoomId, name: safeName }))
  }
}

function disconnect() {
  window.location.reload()
}

function startRoom() {
  const seed = Date.now()
  const roomId = roomEl.value
  if (roomId && startHandler) {
    startHandler({ roomId, seed, host: true, playerId: localPlayerId, color: localPlayerColor })
  }
}

function generateRoomId() {
  return `room-${Math.random().toString(36).slice(2, 8)}`
}

function createRoom() {
  if (isConnected() && localPlayerId) return
  const name = nameEl.value.trim()
  if (!name) {
    alert('Enter a name first')
    return
  }
  const currentRoom = roomEl.value.trim()
  roomEl.value = currentRoom || generateRoomId()
  joinRoom({ create: true })
}

createBtn.addEventListener('click', () => {
  createRoom()
})

joinBtn.addEventListener('click', () => {
  joinRoom()
})

leaveBtn.addEventListener('click', () => {
  disconnect()
})

startBtn.addEventListener('click', () => {
  startRoom()
})

refreshBtn.addEventListener('click', () => {
  requestLobbyList()
})

export function initLobby({ onStart }) {
  startHandler = onStart
  initSocketHandlers()
  connect()
  requestLobbyList()
  updateControlState()
  renderLobby()
}

export function setLobbyVisible(visible) {
  if (!lobbyRoot) return
  lobbyRoot.classList.toggle('is-hidden', !visible)
}
