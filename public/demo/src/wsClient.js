const listeners = new Set()
const statusListeners = new Set()
let socket = null

function notifyStatus(status) {
  for (const cb of statusListeners) {
    cb(status)
  }
}

function getSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.hostname}:${window.location.port}/ws`
}

export function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return socket
  }

  socket = new WebSocket(getSocketUrl())
  notifyStatus('connecting')

  socket.addEventListener('open', () => {
    notifyStatus('connected')
  })

  socket.addEventListener('close', () => {
    notifyStatus('disconnected')
  })

  socket.addEventListener('message', (event) => {
    let message = null
    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }

    for (const cb of listeners) {
      cb(message)
    }
  })

  return socket
}

export function waitForOpen() {
  if (socket && socket.readyState === WebSocket.OPEN) return Promise.resolve()

  return new Promise((resolve, reject) => {
    if (!socket) {
      reject(new Error('socket not created'))
      return
    }

    const onOpen = () => {
      cleanup()
      resolve()
    }

    const onClose = () => {
      cleanup()
      reject(new Error('socket closed'))
    }

    const cleanup = () => {
      socket?.removeEventListener('open', onOpen)
      socket?.removeEventListener('close', onClose)
    }

    socket.addEventListener('open', onOpen)
    socket.addEventListener('close', onClose)
  })
}

export function onMessage(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function onStatusChange(cb) {
  statusListeners.add(cb)
  return () => statusListeners.delete(cb)
}

export function sendMessage(type, payload, requestId) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return
  const message = { type, payload }
  if (requestId) message.requestId = requestId
  socket.send(JSON.stringify(message))
}

export function isConnected() {
  return Boolean(socket && socket.readyState === WebSocket.OPEN)
}
