import { useEffect, useState } from 'react';

import type { RoomRecordSummary, RuntimeAdapter } from '../runtime.js';
import type {
  RoomRecordStatistics,
  RoomSessionResponse,
} from '@texas-holdem/protocol';
import { StatisticsPanel } from '../statistics/StatisticsPanel.js';

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
  readonly onCreateRoom: (hostServiceStopped?: boolean) => void;
  readonly onClose: () => void;
  readonly onRecovered: (session: RoomSessionResponse) => void;
}) {
  const [records, setRecords] = useState<readonly RoomRecordSummary[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RoomRecordSummary | null>(
    null,
  );
  const [replacementTarget, setReplacementTarget] =
    useState<RoomRecordSummary | null>(null);
  const [recoveryTarget, setRecoveryTarget] =
    useState<RoomRecordSummary | null>(null);
  const [recoveryNetworks, setRecoveryNetworks] = useState<
    readonly { readonly name: string; readonly address: string }[]
  >([]);
  const [recoveryAddress, setRecoveryAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [statisticsTarget, setStatisticsTarget] =
    useState<RoomRecordSummary | null>(null);
  const [recordStatistics, setRecordStatistics] =
    useState<RoomRecordStatistics | null>(null);
  const [statisticsLoading, setStatisticsLoading] = useState(false);

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

  const chooseRecoveryNetwork = async (record: RoomRecordSummary) => {
    try {
      const networks = await runtime.listNetworkInterfaces();
      const initialNetwork = networks[0];
      if (!initialNetwork) {
        setError('没有可用于恢复对局的 IPv4 网卡。');
        return;
      }
      setRecoveryNetworks(networks);
      setRecoveryAddress(initialNetwork.address);
      setRecoveryTarget(record);
      setError(null);
    } catch {
      setError('读取可用网卡失败，请重试。');
    }
  };

  const recover = async (
    record: RoomRecordSummary,
    network?: { readonly name: string; readonly address: string },
  ) => {
    try {
      setError(null);
      if (!network && record.status === 'recoverable') {
        const networks = await runtime.listNetworkInterfaces();
        const savedAddress = record.network?.address;
        if (
          !savedAddress ||
          !networks.some((candidate) => candidate.address === savedAddress)
        ) {
          const initialNetwork = networks[0];
          if (!initialNetwork) {
            setError('没有可用于恢复对局的 IPv4 网卡。');
            return;
          }
          setRecoveryNetworks(networks);
          setRecoveryAddress(initialNetwork.address);
          setRecoveryTarget(record);
          return;
        }
      }
      const session = await runtime.recoverRoomRecord({
        roomId: record.roomId,
        ...(network ? { network } : {}),
      });
      setReplacementTarget(null);
      setRecoveryTarget(null);
      onRecovered(session);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '恢复对局失败';
      if (
        !network &&
        (message.includes('未保存网卡') || message.includes('网卡已不可用'))
      ) {
        await chooseRecoveryNetwork(record);
        return;
      }
      setError(message);
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

  const openStatistics = async (record: RoomRecordSummary) => {
    try {
      if (!runtime.getRoomRecordStatistics) {
        throw new Error('桌面组件版本已更新，请完全退出并重新启动 Electron');
      }
      setError(null);
      setStatisticsTarget(record);
      setRecordStatistics(null);
      setStatisticsLoading(true);
      setRecordStatistics(await runtime.getRoomRecordStatistics(record.roomId));
    } catch (reason) {
      setStatisticsTarget(null);
      setError(reason instanceof Error ? reason.message : '读取对局统计失败');
    } finally {
      setStatisticsLoading(false);
    }
  };

  const closeAndCreate = async () => {
    if (!replacementTarget) return;
    try {
      setError(null);
      await runtime.closeRunningRoomRecord(replacementTarget.roomId);
      await runtime.stopHostService();
      setReplacementTarget(null);
      onCreateRoom(true);
    } catch {
      setError('关闭进行中对局或停止房主服务失败，请重试。');
    }
  };

  const runningRecord =
    records.find(({ status }) => status === 'running') ?? null;

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
            onClick={() => {
              if (runningRecord) {
                setReplacementTarget(runningRecord);
                return;
              }
              onCreateRoom();
            }}
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
                {record.completedHands} 局
              </p>
              <small>
                最近活动：{new Date(record.lastActiveAt).toLocaleString()}
              </small>
              <small>
                联机网卡：
                {record.network
                  ? `${record.network.name} · ${record.network.address}`
                  : '历史记录未保存网卡'}
              </small>
            </div>
            <div className="desktop-room-records__actions">
              {record.status === 'running' ||
              record.status === 'recoverable' ? (
                <button
                  className="button button--primary"
                  type="button"
                  onClick={() => void recover(record)}
                >
                  恢复对局
                </button>
              ) : null}
              <button
                className="button button--secondary"
                type="button"
                onClick={() => void openStatistics(record)}
              >
                查看统计
              </button>
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
      {statisticsTarget ? (
        statisticsLoading || !recordStatistics ? (
          <div className="modal-backdrop" role="presentation">
            <section
              className="modal-dialog"
              role="dialog"
              aria-label="正在读取对局统计"
            >
              <p>正在读取“{statisticsTarget.roomName}”的服务端统计…</p>
            </section>
          </div>
        ) : (
          <StatisticsPanel
            open
            presentation="modal"
            players={recordStatistics.players}
            titles={recordStatistics.titles}
            handPeaks={recordStatistics.handPeaks}
            summary={
              <>
                {statisticsTarget.roomName} ·{' '}
                {statusLabels[statisticsTarget.status]} · 已完成{' '}
                {statisticsTarget.completedHands} 局 · 最近活动{' '}
                {new Date(statisticsTarget.lastActiveAt).toLocaleString()}
              </>
            }
            onCollapse={() => {
              setStatisticsTarget(null);
              setRecordStatistics(null);
            }}
          />
        )
      ) : null}
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
      {replacementTarget ? (
        <div
          className="desktop-room-records__delete-confirmation"
          role="alertdialog"
          aria-label="确认替换进行中对局"
          aria-modal="true"
        >
          <strong>本地正在进行“{replacementTarget.roomName}”</strong>
          <p>请选择恢复上次对局，或正常关闭它后创建新房间。</p>
          <button
            className="button button--primary"
            type="button"
            onClick={() => void recover(replacementTarget)}
          >
            恢复上次对局
          </button>
          <button
            className="button button--danger"
            type="button"
            onClick={() => void closeAndCreate()}
          >
            关闭上次对局并重新选择网卡
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => setReplacementTarget(null)}
          >
            取消
          </button>
        </div>
      ) : null}
      {recoveryTarget ? (
        <div
          className="desktop-room-records__delete-confirmation"
          role="alertdialog"
          aria-label="选择恢复网卡"
          aria-modal="true"
        >
          <strong>选择用于恢复“{recoveryTarget.roomName}”的网卡</strong>
          <p>上次使用的网卡不可用或该历史记录尚未保存网卡。</p>
          <label className="desktop-room-setup__adapter">
            联机网卡
            <select
              value={recoveryAddress}
              onChange={(event) => setRecoveryAddress(event.target.value)}
            >
              {recoveryNetworks.map((network) => (
                <option key={network.address} value={network.address}>
                  {network.name} · {network.address}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button button--primary"
            type="button"
            disabled={!recoveryAddress}
            onClick={() => {
              const network = recoveryNetworks.find(
                (candidate) => candidate.address === recoveryAddress,
              );
              if (network) {
                void recover(recoveryTarget, {
                  name: network.name,
                  address: network.address,
                });
              }
            }}
          >
            使用此网卡恢复
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => setRecoveryTarget(null)}
          >
            取消
          </button>
        </div>
      ) : null}
    </section>
  );
}
