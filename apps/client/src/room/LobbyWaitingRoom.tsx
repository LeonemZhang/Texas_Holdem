import { useState } from 'react';

import { CopyableQRCode } from './CopyableQRCode.js';

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
  readonly joinUrl?: string;
  readonly onSetReady: (ready: boolean) => void;
  readonly onStartFirstHand: () => void;
  readonly onRemovePlayer?: (playerId: string) => void;
  readonly onCloseRoom?: () => void;
}

export function LobbyWaitingRoom({
  roomName,
  currentPlayerId,
  players,
  joinUrl,
  onSetReady,
  onStartFirstHand,
  onRemovePlayer,
  onCloseRoom,
}: LobbyWaitingRoomProps) {
  const [removeCandidate, setRemoveCandidate] =
    useState<LobbyPlayerView | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [copied, setCopied] = useState(false);
  const currentPlayer = players.find(
    ({ playerId }) => playerId === currentPlayerId,
  );
  const seatedPlayers = players.filter(({ seatIndex }) => seatIndex >= 0);
  const readyPlayerCount = seatedPlayers.filter(
    ({ ready, connected }) => ready && connected,
  ).length;
  const canStartFirstHand =
    seatedPlayers.length >= 2 &&
    seatedPlayers.every(({ ready, connected }) => ready && connected);
  const waitingPlayerCount = seatedPlayers.length - readyPlayerCount;

  const copyInvite = async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section
      className={`lobby${currentPlayer?.isHost && joinUrl ? ' lobby--with-invite' : ''}`}
      aria-labelledby="lobby-title"
    >
      <header className="lobby__heading">
        <div>
          <p className="connection-home__kicker">第一局开始前</p>
          <h2 id="lobby-title">{roomName}</h2>
          <p>房主默认已准备；其他玩家准备后，由房主手动开始游戏。</p>
        </div>
        <strong className="lobby__count">
          {readyPlayerCount}/{seatedPlayers.length} 已准备
        </strong>
      </header>

      {currentPlayer?.isHost && joinUrl ? (
        <section className="lobby__invite" aria-label="房间邀请">
          <div>
            <span>邀请朋友加入</span>
            <button
              className="button button--secondary"
              type="button"
              onClick={copyInvite}
            >
              {copied ? '已复制邀请链接' : '复制邀请链接'}
            </button>
          </div>
          <CopyableQRCode value={joinUrl} size={58} title="加入房间二维码" />
        </section>
      ) : null}

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
            {currentPlayer?.isHost && player.playerId !== currentPlayerId ? (
              <button
                className="lobby-player__remove"
                type="button"
                onClick={() => setRemoveCandidate(player)}
              >
                移出
              </button>
            ) : null}
          </li>
        ))}
      </ol>

      <footer className="lobby__actions">
        {!currentPlayer?.isHost ? (
          <button
            className="button button--secondary"
            type="button"
            disabled={!currentPlayer?.connected}
            onClick={() => onSetReady(!currentPlayer?.ready)}
          >
            {currentPlayer?.ready ? '取消准备' : '准备'}
          </button>
        ) : null}
        {currentPlayer?.isHost ? (
          <div className="lobby__start-control">
            <button
              className="button button--primary"
              type="button"
              disabled={!canStartFirstHand}
              aria-describedby="lobby-start-status"
              onClick={() => {
                if (canStartFirstHand) onStartFirstHand();
              }}
            >
              开始游戏
            </button>
            <small id="lobby-start-status">
              {canStartFirstHand
                ? '全员已准备，可以开始游戏'
                : `还有 ${waitingPlayerCount} 位玩家未准备`}
            </small>
          </div>
        ) : (
          <p>等待房主开始游戏</p>
        )}
        {currentPlayer?.isHost ? (
          <button
            className="button button--danger"
            type="button"
            onClick={() => setConfirmClose(true)}
          >
            关闭房间
          </button>
        ) : null}
      </footer>

      {removeCandidate ? (
        <div
          className="lobby__confirmation"
          role="alertdialog"
          aria-label="确认移出玩家"
        >
          <strong>确认将 {removeCandidate.nickname} 移出房间？</strong>
          <div>
            <button
              className="button button--danger"
              type="button"
              onClick={() => {
                onRemovePlayer?.(removeCandidate.playerId);
                setRemoveCandidate(null);
              }}
            >
              确认移出
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => setRemoveCandidate(null)}
            >
              取消
            </button>
          </div>
        </div>
      ) : null}
      {confirmClose ? (
        <div
          className="lobby__confirmation"
          role="alertdialog"
          aria-label="确认关闭房间"
        >
          <strong>确认关闭房间和当前对局？</strong>
          <div>
            <button
              className="button button--danger"
              type="button"
              onClick={onCloseRoom}
            >
              确认关闭
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => setConfirmClose(false)}
            >
              取消
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
