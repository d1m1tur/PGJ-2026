export class Room {
  constructor({ roomId, dayLengthMs, totalDays }) {
    this.roomId = roomId;
    this.state = {
      players: new Map(),
      grass: new Map(),
      pens: new Map(),
      day: {
        current: 0,
        endsAt: 0,
        totalDays,
        lengthMs: dayLengthMs,
      },
      stats: {
        grassEatenByPlayer: new Map(),
      },
    };
    this.sockets = new Map();
    this.lastUpdateMs = Date.now();
    this.started = false;
    this.starting = false;
    this.startId = null;
    this.pendingStartAcks = null;
    this.startTimeout = null;
    this.ended = false;
  }

  serialize() {
    const { players, grass, pens, day } = this.state;
    return {
      roomId: this.roomId,
      started: Boolean(this.started),
      ended: Boolean(this.ended),
      day: day.current,
      totalDays: day.totalDays,
      dayEndsAt: day.endsAt,
      players: [...players.values()],
    };
  }

  clearStart() {
    if (this.startTimeout) clearTimeout(this.startTimeout);
    this.startTimeout = null;
    this.starting = false;
    this.startId = null;
    this.pendingStartAcks = null;
  }

  resetDayCounters() {
    this.state.stats.grassEatenByPlayer = new Map();
    for (const player of this.state.players.values()) {
      if (player.role === 'sheep' && player.isAlive) {
        this.state.stats.grassEatenByPlayer.set(player.id, 0);
      }
    }
  }
}
