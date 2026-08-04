import { useEffect, useState, type FormEvent } from 'react';

export interface ChipExchangePlayer {
  readonly playerId: string;
  readonly nickname: string;
  readonly chips: number;
}

export interface ChipExchangeRecord {
  readonly requestId: string;
  readonly requesterId: string;
  readonly targetPlayerId: string | null;
  readonly amount: number;
  readonly status: 'pending' | 'rejected' | 'revoked' | 'completed';
}

export type ChipExchangeIntent =
  | {
      readonly type: 'request';
      readonly targetPlayerId: string | null;
      readonly amount: number;
    }
  | {
      readonly type: 'give';
      readonly receiverPlayerId: string;
      readonly amount: number;
    }
  | { readonly type: 'approve'; readonly requestId: string }
  | { readonly type: 'reject'; readonly requestId: string }
  | { readonly type: 'revoke'; readonly requestId: string };

export interface ChipExchangePanelProps {
  readonly phase: 'lobby' | 'playing' | 'hand-ready' | 'paused' | 'closed';
  readonly currentPlayerId: string;
  readonly players: readonly ChipExchangePlayer[];
  readonly records: readonly ChipExchangeRecord[];
  readonly presentation?: 'inline' | 'drawer';
  readonly onAction: (intent: ChipExchangeIntent) => void;
}

const statusLabels: Record<ChipExchangeRecord['status'], string> = {
  pending: '待处理',
  rejected: '已拒绝',
  revoked: '已撤销',
  completed: '已完成',
};

export function ChipExchangePanel({
  phase,
  currentPlayerId,
  players,
  records,
  presentation = 'inline',
  onAction,
}: ChipExchangePanelProps) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<ChipExchangeIntent | null>(
    null,
  );
  const [requestTargetId, setRequestTargetId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const currentPlayer = players.find(
    ({ playerId }) => playerId === currentPlayerId,
  );
  const available = phase === 'hand-ready';
  const drawer = presentation === 'drawer';
  const requestTarget = players.find(
    (player) => player.playerId === requestTargetId,
  );
  const requestLimit = requestTarget
    ? requestTarget.chips
    : Math.max(
        0,
        ...players
          .filter((player) => player.playerId !== currentPlayerId)
          .map((player) => player.chips),
      );
  const nameOf = (playerId: string | null) =>
    playerId === null
      ? '任意玩家'
      : (players.find((player) => player.playerId === playerId)?.nickname ??
        playerId);

  const incomingPendingRequest = records.some(
    (record) =>
      record.status === 'pending' &&
      record.requesterId !== currentPlayerId &&
      (record.targetPlayerId === null ||
        record.targetPlayerId === currentPlayerId),
  );
  useEffect(() => {
    if (incomingPendingRequest) setOpen(true);
  }, [incomingPendingRequest]);

  const prepareRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get('amount'));
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setFormError('请输入大于 0 的整数筹码。');
      return;
    }
    const targetPlayerId = String(form.get('targetPlayerId') ?? '') || null;
    if (amount > requestLimit) {
      setFormError(
        `请求筹码不能超过${targetPlayerId ? '目标玩家' : '任意可响应玩家'}持有的 ${requestLimit.toLocaleString('zh-CN')}。`,
      );
      return;
    }
    setFormError(null);
    setConfirmation({ type: 'request', targetPlayerId, amount });
  };

  const prepareGive = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get('amount'));
    const receiverPlayerId = String(form.get('receiverPlayerId') ?? '');
    if (
      !receiverPlayerId ||
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      amount > (currentPlayer?.chips ?? 0)
    )
      return;
    setConfirmation({ type: 'give', receiverPlayerId, amount });
  };

  const confirm = () => {
    if (!confirmation) return;
    onAction(confirmation);
    setConfirmation(null);
  };

  return (
    <section
      className={`chip-exchange${drawer ? ' chip-exchange--drawer' : ''}${drawer && open ? ' chip-exchange--open' : ''}${drawer && !open ? ' chip-exchange--closed' : ''}`}
      aria-labelledby="chip-exchange-title"
    >
      <header>
        {!drawer || open ? (
          <div>
            <p className="connection-home__kicker">牌桌筹码服务</p>
            <h2 id="chip-exchange-title">筹码交换</h2>
          </div>
        ) : null}
        <div className="chip-exchange__summary">
          {!drawer || open ? (
            <strong>
              我的余额：{currentPlayer?.chips.toLocaleString('zh-CN') ?? 0}
            </strong>
          ) : null}
          <button
            className={drawer ? 'button button--secondary' : undefined}
            type="button"
            aria-expanded={open}
            aria-controls="chip-exchange-content"
            onClick={() => setOpen((current) => !current)}
          >
            {open
              ? drawer
                ? '关闭筹码交换'
                : '收起筹码交换'
              : drawer
                ? '筹码交换'
                : '展开筹码交换'}
          </button>
        </div>
      </header>

      {open && !available ? (
        <p className="chip-exchange__locked" role="status">
          对局进行中不能新建请求或主动给予筹码；已收到的请求仍可批准、拒绝或撤销，批准后立即同步余额。
        </p>
      ) : null}

      {open && available ? (
        <div id="chip-exchange-content" className="chip-exchange__forms">
          <form onSubmit={prepareRequest}>
            <h3>请求筹码</h3>
            <label>
              向谁请求
              <select
                name="targetPlayerId"
                value={requestTargetId}
                onChange={(event) => {
                  setRequestTargetId(event.target.value);
                  setFormError(null);
                }}
              >
                <option value="">任意玩家</option>
                {players
                  .filter(({ playerId }) => playerId !== currentPlayerId)
                  .map((player) => (
                    <option key={player.playerId} value={player.playerId}>
                      {player.nickname}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              数量
              <input
                name="amount"
                type="number"
                min="1"
                step="1"
                max={requestLimit}
                defaultValue={Math.min(100, requestLimit)}
              />
            </label>
            {formError ? <p className="form-error">{formError}</p> : null}
            <button type="submit">发起请求</button>
          </form>

          <form onSubmit={prepareGive}>
            <h3>主动给予</h3>
            <label>
              给予玩家
              <select name="receiverPlayerId">
                {players
                  .filter(({ playerId }) => playerId !== currentPlayerId)
                  .map((player) => (
                    <option key={player.playerId} value={player.playerId}>
                      {player.nickname}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              数量
              <input
                name="amount"
                type="number"
                min="1"
                step="1"
                defaultValue="100"
              />
            </label>
            <button type="submit">准备给予</button>
          </form>
        </div>
      ) : null}

      {open && confirmation ? (
        <div
          className="chip-confirmation"
          role="alertdialog"
          aria-label="确认筹码操作"
        >
          <strong>请再次确认</strong>
          <p>
            {confirmation.type === 'give'
              ? `给予 ${nameOf(confirmation.receiverPlayerId)} ${confirmation.amount} 筹码，余额将变为 ${(currentPlayer?.chips ?? 0) - confirmation.amount}`
              : confirmation.type === 'request'
                ? `向 ${nameOf(confirmation.targetPlayerId)} 请求 ${confirmation.amount} 筹码`
                : '确认此筹码操作'}
          </p>
          <button
            className="button button--primary"
            type="button"
            onClick={confirm}
          >
            确认
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => setConfirmation(null)}
          >
            取消
          </button>
        </div>
      ) : null}

      {open ? (
        <div className="chip-records">
          <h3>公开记录</h3>
          {records.length === 0 ? <p>暂无筹码交换记录</p> : null}
          <ul>
            {records.map((record) => {
              const canRespond =
                record.status === 'pending' &&
                record.requesterId !== currentPlayerId &&
                (record.targetPlayerId === null ||
                  record.targetPlayerId === currentPlayerId);
              const canRevoke =
                record.status === 'pending' &&
                record.requesterId === currentPlayerId;
              return (
                <li key={record.requestId}>
                  <span>
                    {nameOf(record.requesterId)} 向{' '}
                    {nameOf(record.targetPlayerId)} 请求{' '}
                    {record.amount.toLocaleString('zh-CN')} ·{' '}
                    {statusLabels[record.status]}
                  </span>
                  {canRespond ? (
                    <span className="chip-records__actions">
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmation({
                            type: 'approve',
                            requestId: record.requestId,
                          })
                        }
                      >
                        批准
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onAction({
                            type: 'reject',
                            requestId: record.requestId,
                          })
                        }
                      >
                        拒绝
                      </button>
                    </span>
                  ) : null}
                  {canRevoke ? (
                    <button
                      type="button"
                      onClick={() =>
                        onAction({
                          type: 'revoke',
                          requestId: record.requestId,
                        })
                      }
                    >
                      撤销
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
