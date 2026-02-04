import { handleGrassEat } from './grassEat.js';
import { handleLobbyList } from './lobbyList.js';
import { handlePenUpdate } from './penUpdate.js';
import { handlePlayerPosition } from './playerPosition.js';
import { handleRoomJoin } from './roomJoin.js';
import { handleRoomStart } from './roomStart.js';
import { handleRoomStartAck } from './roomStartAck.js';

export function createHandlers() {
  return new Map([
    ['RoomJoin', handleRoomJoin],
    ['PlayerPosition', handlePlayerPosition],
    ['PenUpdate', handlePenUpdate],
    ['RoomStart', handleRoomStart],
    ['RoomStartAck', handleRoomStartAck],
    ['GrassEat', handleGrassEat],
    ['LobbyListRequest', handleLobbyList],
  ]);
}
