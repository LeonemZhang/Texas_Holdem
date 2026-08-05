import { type DragEvent, useRef, useState } from 'react';

import { CopyableQRCode } from './CopyableQRCode.js';
import { ModalDialog } from './ModalDialog.js';

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
  readonly onReseatPlayer?: (playerId: string, seatIndex: number) => void;
  readonly onShuffleSeats?: () => void;
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
  onReseatPlayer,
  onShuffleSeats,
}: LobbyWaitingRoomProps) {
  const [removeCandidate, setRemoveCandidate] =
    useState<LobbyPlayerView | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const draggedPlayerIdRef = useRef<string | null>(null);
  const [draggedPlayerId, setDraggedPlayerId] = useState<string | null>(null);
  const [dropSeatIndex, setDropSeatIndex] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const currentPlayer = players.find(
    ({ playerId }) => playerId === currentPlayerId,
  );
  const seatedPlayers = [...players]
    .filter(({ seatIndex }) => seatIndex >= 0)
    .sort((left, right) => left.seatIndex - right.seatIndex);
  const playerBySeat = new Map(
    seatedPlayers.map((player) => [player.seatIndex, player]),
  );
  const readyPlayerCount = seatedPlayers.filter(
    ({ ready, connected }) => ready && connected,
  ).length;
  const canStartFirstHand =
    seatedPlayers.length >= 2 &&
    seatedPlayers.every(({ ready, connected }) => ready && connected);
  const waitingPlayerCount = seatedPlayers.length - readyPlayerCount;
  const isHost = currentPlayer?.isHost === true;
  const seatsAreCompact = seatedPlayers.every(
    ({ seatIndex }, index) => seatIndex === index,
  );
  const canDragSeats = isHost && seatsAreCompact;
  const shuffleDisabled =
    seatedPlayers.length === 0 ||
    (seatedPlayers.length === 1 && seatedPlayers[0]?.seatIndex === 0);

  const copyInvite = async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const clearSeatDrag = () => {
    draggedPlayerIdRef.current = null;
    setDraggedPlayerId(null);
    setDropSeatIndex(null);
  };

  const startSeatDrag = (event: DragEvent<HTMLLIElement>, playerId: string) => {
    if (!canDragSeats) return;
    draggedPlayerIdRef.current = playerId;
    setDraggedPlayerId(playerId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', playerId);
  };

  const dragOverSeat = (event: DragEvent<HTMLLIElement>, seatIndex: number) => {
    if (
      !canDragSeats ||
      !draggedPlayerIdRef.current ||
      !playerBySeat.has(seatIndex)
    ) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropSeatIndex(seatIndex);
  };

  const dropOnSeat = (event: DragEvent<HTMLLIElement>, seatIndex: number) => {
    event.preventDefault();
    const playerId =
      draggedPlayerIdRef.current || event.dataTransfer.getData('text/plain');
    const player = seatedPlayers.find(
      (candidate) => candidate.playerId === playerId,
    );
    const occupant = playerBySeat.get(seatIndex);
    if (canDragSeats && player && occupant && player.seatIndex !== seatIndex) {
      onReseatPlayer?.(player.playerId, seatIndex);
    }
    clearSeatDrag();
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
        <div className="lobby__heading-actions">
          <strong className="lobby__count">
            {readyPlayerCount}/{seatedPlayers.length} 已准备
          </strong>
        </div>
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

      <div className="lobby__seat-area">
        <ol className="lobby__players" aria-label="房间座位">
          {Array.from({ length: 10 }, (_, seatIndex) => {
            const player = playerBySeat.get(seatIndex);
            if (!player) {
              return (
                <li
                  className="lobby-player lobby-player--empty"
                  key={seatIndex}
                >
                  <span className="lobby-player__seat">
                    座位 {seatIndex + 1}
                  </span>
                  <strong>空座位</strong>
                </li>
              );
            }
            return (
              <li
                className={`lobby-player${player.ready ? ' lobby-player--ready' : ''}${canDragSeats ? ' lobby-player--draggable' : ''}${draggedPlayerId === player.playerId ? ' lobby-player--dragging' : ''}${dropSeatIndex === seatIndex ? ' lobby-player--drop-target' : ''}`}
                draggable={canDragSeats}
                key={player.playerId}
                onDragStart={(event) => startSeatDrag(event, player.playerId)}
                onDragOver={(event) => dragOverSeat(event, seatIndex)}
                onDrop={(event) => dropOnSeat(event, seatIndex)}
                onDragEnd={clearSeatDrag}
                title={
                  canDragSeats
                    ? `${player.nickname}：拖动到另一名玩家卡片上交换座位`
                    : undefined
                }
              >
                <span className="lobby-player__seat">
                  座位 {player.seatIndex + 1}
                </span>
                <strong title={player.nickname}>{player.nickname}</strong>
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
                {currentPlayer?.isHost &&
                player.playerId !== currentPlayerId ? (
                  <button
                    className="lobby-player__remove"
                    type="button"
                    onClick={() => setRemoveCandidate(player)}
                  >
                    移出
                  </button>
                ) : null}
              </li>
            );
          })}
        </ol>
        {isHost ? (
          <div className="lobby__seat-action">
            <button
              className="button button--secondary"
              type="button"
              disabled={shuffleDisabled}
              onClick={() => onShuffleSeats?.()}
            >
              随机打乱
            </button>
            <span className="lobby__seat-hint">
              {seatsAreCompact
                ? '拖动玩家卡片交换座位'
                : '请先随机打乱以整理座位'}
            </span>
          </div>
        ) : null}
      </div>

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
              onClick={() => canStartFirstHand && onStartFirstHand()}
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
        <ModalDialog
          title="确认移出玩家"
          role="alertdialog"
          confirmAction={{
            label: '确认移出',
            className: 'button button--danger',
            onClick: () => {
              onRemovePlayer?.(removeCandidate.playerId);
              setRemoveCandidate(null);
            },
          }}
          onCancel={() => setRemoveCandidate(null)}
        >
          <strong>确认将 {removeCandidate.nickname} 移出房间？</strong>
        </ModalDialog>
      ) : null}
      {confirmClose ? (
        <ModalDialog
          title="确认关闭房间"
          role="alertdialog"
          confirmAction={{
            label: '确认关闭',
            className: 'button button--danger',
            onClick: () => {
              onCloseRoom?.();
              setConfirmClose(false);
            },
          }}
          onCancel={() => setConfirmClose(false)}
        >
          <strong>确认关闭房间和当前对局？</strong>
        </ModalDialog>
      ) : null}
    </section>
  );
}
