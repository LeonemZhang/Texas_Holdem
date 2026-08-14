import type { ChipActivity } from '@texas-holdem/protocol';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';

import { ModalDialog } from './ModalDialog.js';
import { UtilityPanelHeader, UtilityTabs } from './UtilityPanel.js';

export interface ChipExchangePlayer {
  readonly playerId: string;
  readonly nickname: string;
  readonly chips: number;
  readonly status?: string;
}

export type ChipExchangeIntent =
  | {
      readonly type: 'request';
      readonly targetPlayerId: string;
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
  readonly records: readonly ChipActivity[];
  readonly presentation?: 'inline' | 'drawer';
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onAction: (intent: ChipExchangeIntent) => void;
}

const statusLabels = {
  pending: '待处理',
  rejected: '已拒绝',
  revoked: '已撤销',
  completed: '已完成',
} as const;

function formatActivityTime(timestampMs: number): string {
  const timestamp = new Date(timestampMs);
  return [timestamp.getHours(), timestamp.getMinutes(), timestamp.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

function activityTimestamp(record: ChipActivity): number {
  return record.kind === 'request' ? record.updatedAtMs : record.completedAtMs;
}

export function ChipExchangePanel({
  phase,
  currentPlayerId,
  players,
  records,
  presentation = 'inline',
  open: controlledOpen,
  onOpenChange,
  onAction,
}: ChipExchangePanelProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const available = phase === 'hand-ready';
  const [activeTab, setActiveTab] = useState<'exchange' | 'records'>(
    available ? 'exchange' : 'records',
  );
  const [confirmation, setConfirmation] = useState<ChipExchangeIntent | null>(
    null,
  );
  const candidates = players.filter(
    ({ playerId, status }) =>
      playerId !== currentPlayerId &&
      !['left', 'removed', 'eliminated'].includes(status ?? ''),
  );
  const [requestTargetId, setRequestTargetId] = useState(
    candidates[0]?.playerId ?? '',
  );
  const [requestAmount, setRequestAmount] = useState('100');
  const [receiverPlayerId, setReceiverPlayerId] = useState(
    candidates[0]?.playerId ?? '',
  );
  const [giveAmount, setGiveAmount] = useState('100');
  const [formError, setFormError] = useState<string | null>(null);
  const currentPlayer = players.find(
    ({ playerId }) => playerId === currentPlayerId,
  );
  const drawer = presentation === 'drawer';
  const open = controlledOpen ?? internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );

  useEffect(() => {
    if (!candidates.some(({ playerId }) => playerId === requestTargetId)) {
      setRequestTargetId(candidates[0]?.playerId ?? '');
    }
    if (!candidates.some(({ playerId }) => playerId === receiverPlayerId)) {
      setReceiverPlayerId(candidates[0]?.playerId ?? '');
    }
  }, [candidates, receiverPlayerId, requestTargetId]);

  const incomingPending = records.filter(
    (record) =>
      record.kind === 'request' &&
      record.status === 'pending' &&
      record.requesterId !== currentPlayerId &&
      record.targetPlayerId === currentPlayerId &&
      !record.rejectedByPlayerIds.includes(currentPlayerId),
  );
  useEffect(() => {
    if (incomingPending.length === 0) return;
    setOpen(true);
    setActiveTab('records');
  }, [incomingPending.length, setOpen]);

  useEffect(() => {
    if (!available) setActiveTab('records');
  }, [available]);

  const nameOf = (playerId: string) =>
    players.find((player) => player.playerId === playerId)?.nickname ??
    playerId;
  const requestTarget = players.find(
    ({ playerId }) => playerId === requestTargetId,
  );
  const requestLimit = requestTarget?.chips ?? 0;

  const prepareRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(requestAmount);
    if (!requestTargetId) {
      setFormError('请选择一名请求对象。');
      return;
    }
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setFormError('请输入大于 0 的整数筹码。');
      return;
    }
    if (amount > requestLimit) {
      setFormError(
        `请求筹码不能超过目标玩家持有的 ${requestLimit.toLocaleString('zh-CN')}。`,
      );
      return;
    }
    setFormError(null);
    setConfirmation({
      type: 'request',
      targetPlayerId: requestTargetId,
      amount,
    });
  };

  const prepareGive = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(giveAmount);
    if (
      !receiverPlayerId ||
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      amount > (currentPlayer?.chips ?? 0)
    ) {
      return;
    }
    setConfirmation({ type: 'give', receiverPlayerId, amount });
  };

  const confirm = () => {
    if (!confirmation) return;
    onAction(confirmation);
    setConfirmation(null);
    if (confirmation.type === 'approve' || confirmation.type === 'request') {
      setOpen(false);
    }
  };

  const rejectIncomingRequest = (requestId: string) => {
    onAction({ type: 'reject', requestId });
    setOpen(false);
  };

  const confirmationText = useMemo(() => {
    if (!confirmation) return '';
    if (confirmation.type === 'give') {
      return `给予 ${nameOf(confirmation.receiverPlayerId)} ${confirmation.amount.toLocaleString('zh-CN')} 筹码，余额将变为 ${((currentPlayer?.chips ?? 0) - confirmation.amount).toLocaleString('zh-CN')}`;
    }
    if (confirmation.type === 'request') {
      return `向 ${nameOf(confirmation.targetPlayerId)} 请求 ${confirmation.amount.toLocaleString('zh-CN')} 筹码`;
    }
    const request = records.find(
      (record) =>
        record.kind === 'request' &&
        record.requestId === confirmation.requestId,
    );
    return request?.kind === 'request'
      ? `批准 ${nameOf(request.requesterId)} 的 ${request.amount.toLocaleString('zh-CN')} 筹码请求，余额将变为 ${((currentPlayer?.chips ?? 0) - request.amount).toLocaleString('zh-CN')}`
      : '确认此筹码操作';
  }, [confirmation, currentPlayer?.chips, players, records]);

  if (!open) {
    return (
      <button
        className="button button--secondary"
        type="button"
        onClick={() => setOpen(true)}
      >
        筹码交换
      </button>
    );
  }

  return (
    <section
      className={`chip-exchange${drawer ? ' chip-exchange--drawer chip-exchange--open' : ''}`}
      aria-labelledby="chip-exchange-title"
    >
      <UtilityPanelHeader
        kicker="牌桌筹码服务"
        title="筹码交换"
        titleId="chip-exchange-title"
        summary={
          <strong>
            我的余额：{currentPlayer?.chips.toLocaleString('zh-CN') ?? 0}
          </strong>
        }
        onCollapse={() => setOpen(false)}
      />
      <UtilityTabs
        label="筹码交换视图"
        activeTab={activeTab}
        onChange={(tab) => setActiveTab(tab as typeof activeTab)}
        tabs={[
          { id: 'exchange', label: '筹码交换' },
          { id: 'records', label: '公开记录', badge: incomingPending.length },
        ]}
      />

      {activeTab === 'exchange' ? (
        <div
          id="exchange-panel"
          role="tabpanel"
          aria-labelledby="exchange-tab"
          className="chip-exchange__forms"
        >
          {!available ? (
            <p className="chip-exchange__locked" role="status">
              当前阶段不能新建请求或主动给予筹码，请在公开记录中处理已有请求。
            </p>
          ) : (
            <>
              <form
                className="chip-exchange__request-form"
                onSubmit={prepareRequest}
              >
                <h3>请求筹码</h3>
                <label>
                  向谁请求
                  <select
                    name="targetPlayerId"
                    value={requestTargetId}
                    disabled={candidates.length === 0}
                    onChange={(event) => {
                      setRequestTargetId(event.target.value);
                      setFormError(null);
                    }}
                  >
                    {candidates.map((player) => (
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
                    value={requestAmount}
                    onChange={(event) => setRequestAmount(event.target.value)}
                  />
                </label>
                {candidates.length === 0 ? <p>暂无可请求的玩家。</p> : null}
                {formError ? <p className="form-error">{formError}</p> : null}
                <button type="submit" disabled={candidates.length === 0}>
                  发起请求
                </button>
              </form>

              <form className="chip-exchange__give-form" onSubmit={prepareGive}>
                <h3>主动给予</h3>
                <label>
                  给予玩家
                  <select
                    name="receiverPlayerId"
                    value={receiverPlayerId}
                    disabled={candidates.length === 0}
                    onChange={(event) =>
                      setReceiverPlayerId(event.target.value)
                    }
                  >
                    {candidates.map((player) => (
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
                    max={currentPlayer?.chips ?? 0}
                    value={giveAmount}
                    onChange={(event) => setGiveAmount(event.target.value)}
                  />
                </label>
                <button type="submit" disabled={candidates.length === 0}>
                  准备给予
                </button>
              </form>
            </>
          )}
        </div>
      ) : (
        <div
          id="records-panel"
          role="tabpanel"
          aria-labelledby="records-tab"
          className="chip-records"
        >
          {records.length === 0 ? <p>暂无筹码交换记录</p> : null}
          <ul>
            {records.map((record) => {
              if (record.kind === 'direct-transfer') {
                const timestampMs = activityTimestamp(record);
                return (
                  <li key={record.transferId}>
                    <div className="chip-records__entry">
                      <span>
                        {nameOf(record.fromPlayerId)} 给予{' '}
                        {nameOf(record.toPlayerId)}{' '}
                        {record.amount.toLocaleString('zh-CN')} · 已完成
                      </span>
                      <time dateTime={new Date(timestampMs).toISOString()}>
                        {formatActivityTime(timestampMs)}
                      </time>
                    </div>
                  </li>
                );
              }
              const timestampMs = activityTimestamp(record);
              const canRespond =
                record.status === 'pending' &&
                record.requesterId !== currentPlayerId &&
                record.targetPlayerId === currentPlayerId &&
                !record.rejectedByPlayerIds.includes(currentPlayerId);
              const canRevoke =
                record.status === 'pending' &&
                record.requesterId === currentPlayerId;
              return (
                <li key={record.requestId}>
                  <div className="chip-records__entry">
                    <span>
                      {nameOf(record.requesterId)} 向{' '}
                      {nameOf(record.targetPlayerId)} 请求{' '}
                      {record.amount.toLocaleString('zh-CN')} ·{' '}
                      {statusLabels[record.status]}
                      {record.completedByPlayerId
                        ? ` · 由 ${nameOf(record.completedByPlayerId)} 批准`
                        : ''}
                    </span>
                    <time dateTime={new Date(timestampMs).toISOString()}>
                      {formatActivityTime(timestampMs)}
                    </time>
                  </div>
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
                        同意
                      </button>
                      <button
                        type="button"
                        onClick={() => rejectIncomingRequest(record.requestId)}
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
      )}

      {confirmation ? (
        <ModalDialog
          title="确认筹码操作"
          role="alertdialog"
          confirmAction={{ label: '确认', onClick: confirm }}
          onCancel={() => setConfirmation(null)}
        >
          <p>{confirmationText}</p>
        </ModalDialog>
      ) : null}
    </section>
  );
}
