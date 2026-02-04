import { connect } from './wsClient.js'
import { initLobby, setLobbyVisible } from './lobby.js'
import { initGame, setGameVisible, startGameSession } from './main.js'

connect()

initLobby({
  onStart: async (startPayload) => {
    setLobbyVisible(false)
    setGameVisible(true)
    await initGame()
    startGameSession(startPayload)
  },
})
