export function handleLobbyList({ game, socket, payload }) {
  const requestId = payload?.requestId;
  const list = game.getLobbyList();
  game.sendToSocket(socket, 'LobbyList', { requestId, lobbies: list });
}
