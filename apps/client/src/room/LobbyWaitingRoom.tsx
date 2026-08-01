export interface LobbyPlayerView {
  readonly playerId: string;
  readonly nickname: string;
  readonly seatIndex: number;
  readonly isHost: boolean;
  readonly ready: boolean;
  readonly connected: boolean;
}

export interface LobbyWaitingRoomProps {
  readonly roomName: string;
  readonly currentPlayerId: string;
  readonly players: readonly LobbyPlayerView[];
  readonly onSetReady: (ready: boolean) => void;
  readonly onStartFirstHand: () => void;
}

export function LobbyWaitingRoom({
  roomName,
  currentPlayerId,
  players,
  onSetReady,
  onStartFirstHand,
}: LobbyWaitingRoomProps) {
  const currentPlayer = players.find(
    ({ playerId }) => playerId === currentPlayerId,
  );
  const seatedPlayers = players.filter(({ seatIndex }) => seatIndex >= 0);
  const allReady =
    seatedPlayers.length >= 2 &&
    seatedPlayers.every(({ ready, connected }) => ready && connected);

  return (
    <section className="lobby" aria-labelledby="lobby-title">
      <header className="lobby__heading">
        <div>
          <p className="connection-home__kicker">第一局开始前</p>
          <h2 id="lobby-title">{roomName}</h2>
          <p>所有玩家准备后，由房主手动开始游戏。</p>
        </div>
        <strong className="lobby__count">
          {seatedPlayers.filter(({ ready }) => ready).length}/
          {seatedPlayers.length} 已准备
        </strong>
      </header>

      <ol className="lobby__players" aria-label="房间玩家">
        {seatedPlayers.map((player) => (
          <li
            className={`lobby-player${player.ready ? ' lobby-player--ready' : ''}`}
            key={player.playerId}
          >
            <span className="lobby-player__seat">
              座位 {player.seatIndex + 1}
            </span>
            <strong>{player.nickname}</strong>
            <span className="lobby-player__badges">
              {player.isHost ? <em>房主 · 玩家</em> : null}
              {!player.connected ? (
                <span>已掉线</span>
              ) : player.ready ? (
                <span>已准备</span>
              ) : (
                <span>等待准备</span>
              )}
            </span>
          </li>
        ))}
      </ol>

      <footer className="lobby__actions">
        <button
          className="button button--secondary"
          type="button"
          disabled={!currentPlayer?.connected}
          onClick={() => onSetReady(!currentPlayer?.ready)}
        >
          {currentPlayer?.ready ? '取消准备' : '准备'}
        </button>
        {currentPlayer?.isHost ? (
          <button
            className="button button--primary"
            type="button"
            disabled={!allReady}
            onClick={onStartFirstHand}
          >
            开始游戏
          </button>
        ) : (
          <p>等待房主开始游戏</p>
        )}
      </footer>
    </section>
  );
}
