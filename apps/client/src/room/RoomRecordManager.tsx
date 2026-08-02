import { useEffect, useState } from 'react';

import type { RoomRecordSummary, RuntimeAdapter } from '../runtime.js';
import type { RoomSessionResponse } from '@texas-holdem/protocol';

const statusLabels: Record<RoomRecordSummary['status'], string> = {
  running: '进行中',
  recoverable: '可恢复',
  closed: '已结束',
  archived: '已归档',
};

export function RoomRecordManager({
  runtime,
  onCreateRoom,
  onClose,
  onRecovered,
}: {
  readonly runtime: RuntimeAdapter;
  readonly onCreateRoom: () => void;
  readonly onClose: () => void;
  readonly onRecovered: (session: RoomSessionResponse) => void;
}) {
  const [records, setRecords] = useState<readonly RoomRecordSummary[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RoomRecordSummary | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setError(null);
      if (typeof runtime.listRoomRecords !== 'function') {
        throw new Error('桌面组件版本已更新，请完全退出并重新启动 Electron');
      }
      setRecords(await runtime.listRoomRecords(includeArchived));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '读取对局记录失败');
    }
  };

  useEffect(() => {
    void refresh();
  }, [includeArchived]);

  const mutate = async (operation: () => Promise<void>) => {
    try {
      setError(null);
      await operation();
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '对局记录操作失败');
    }
  };

  const recover = async (roomId: string) => {
    try {
      setError(null);
      onRecovered(await runtime.recoverRoomRecord(roomId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '恢复对局失败');
    }
  };

  const deleteRecord = async () => {
    if (!deleteTarget) return;
    try {
      setError(null);
      await runtime.deleteRoomRecord(deleteTarget.roomId);
      setDeleteTarget(null);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '删除对局记录失败');
    }
  };

  return (
    <section
      className="desktop-room-records"
      aria-labelledby="room-records-title"
    >
      <header className="desktop-room-records__header">
        <div>
          <p className="connection-home__kicker">房主控制台</p>
          <h2 id="room-records-title">管理对局记录</h2>
          <p>恢复未完成的牌局，或归档和删除不再需要的历史记录。</p>
        </div>
        <div className="desktop-room-records__header-actions">
          <button
            type="button"
            className="button button--primary"
            onClick={onCreateRoom}
          >
            创建新房间
          </button>
          <button
            type="button"
            className="button button--secondary"
            onClick={onClose}
          >
            返回首页
          </button>
        </div>
      </header>
      <div className="desktop-room-records__toolbar">
        <label>
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => setIncludeArchived(event.target.checked)}
          />
          显示已归档对局
        </label>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => void refresh()}
        >
          刷新记录
        </button>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {records.length === 0 ? (
        <p className="desktop-room-records__empty">暂无可管理的对局记录。</p>
      ) : null}
      <ul className="desktop-room-records__list">
        {records.map((record) => (
          <li className="desktop-room-records__item" key={record.roomId}>
            <div className="desktop-room-records__details">
              <div className="desktop-room-records__title-row">
                <strong>{record.roomName}</strong>
                <span
                  className={`desktop-room-records__status desktop-room-records__status--${record.status}`}
                >
                  {statusLabels[record.status]}
                </span>
              </div>
              <p>
                房主 {record.hostNickname} · {record.playerCount} 人 · 已完成{' '}
                {record.completedHands} 手
              </p>
              <small>
                最近活动：{new Date(record.lastActiveAt).toLocaleString()}
              </small>
            </div>
            <div className="desktop-room-records__actions">
              {record.status === 'recoverable' ? (
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => void recover(record.roomId)}
                >
                  恢复对局
                </button>
              ) : null}
              {record.status === 'archived' ? (
                <>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() =>
                      void mutate(async () => {
                        await runtime.restoreRoomRecord(record.roomId);
                      })
                    }
                  >
                    取消归档
                  </button>
                  <button
                    className="button button--danger"
                    type="button"
                    onClick={() => setDeleteTarget(record)}
                  >
                    删除记录
                  </button>
                </>
              ) : null}
              {record.status === 'recoverable' || record.status === 'closed' ? (
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() =>
                    void mutate(async () => {
                      await runtime.archiveRoomRecord(record.roomId);
                    })
                  }
                >
                  归档
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {deleteTarget ? (
        <div
          className="desktop-room-records__delete-confirmation"
          role="alertdialog"
          aria-label="确认删除对局记录"
          aria-modal="true"
        >
          <strong>确认删除“{deleteTarget.roomName}”吗？</strong>
          <p>
            此操作会永久删除该对局的玩家、事件、快照和统计数据，删除后不可恢复。
          </p>
          <button
            className="button button--danger"
            type="button"
            onClick={() => void deleteRecord()}
          >
            确认删除
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => setDeleteTarget(null)}
          >
            取消
          </button>
        </div>
      ) : null}
    </section>
  );
}
