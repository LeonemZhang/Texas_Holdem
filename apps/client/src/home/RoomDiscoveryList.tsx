import type { RoomDiscoveryResponse } from '@texas-holdem/lan-discovery/messages';

export type RoomCompatibility =
  'checking' | 'compatible' | 'incompatible' | 'unreachable';

export interface RoomDiscoveryListItem {
  readonly room: RoomDiscoveryResponse;
  readonly compatibility: RoomCompatibility;
  readonly latencyMs: number | null;
  readonly expired: boolean;
}

export interface RoomDiscoveryListProps {
  readonly rooms: readonly RoomDiscoveryListItem[];
  readonly refreshing: boolean;
  readonly onRefresh: () => void;
  readonly onJoin: (room: RoomDiscoveryResponse) => void;
}

const phaseLabel: Record<RoomDiscoveryResponse['phase'], string> = {
  lobby: '等待中',
  playing: '对局中',
  'hand-ready': '手牌准备',
  paused: '已暂停',
};

const compatibilityLabel: Record<RoomCompatibility, string> = {
  checking: '验证中',
  compatible: '可加入',
  incompatible: '版本不兼容',
  unreachable: '无法连接',
};

export function RoomDiscoveryList({
  rooms,
  refreshing,
  onRefresh,
  onJoin,
}: RoomDiscoveryListProps) {
  return (
    <section className="room-browser" aria-labelledby="room-browser-heading">
      <div className="room-browser__heading">
        <div>
          <p className="connection-home__kicker">局域网房间</p>
          <h2 id="room-browser-heading">附近的牌桌</h2>
        </div>
        <button
          type="button"
          className="button button--secondary"
          onClick={onRefresh}
          disabled={refreshing}
        >
          {refreshing ? '刷新中…' : '刷新列表'}
        </button>
      </div>
      {rooms.length === 0 ? (
        <p className="room-browser__empty">
          {refreshing ? '正在寻找房间…' : '暂未发现房间，可使用 IP 直连。'}
        </p>
      ) : (
        <ul className="room-list">
          {rooms.map((item) => {
            const disabled =
              item.expired || item.compatibility !== 'compatible';
            return (
              <li className="room-list__item" key={item.room.roomId}>
                <div className="room-list__title">
                  <strong>{item.room.roomName}</strong>
                  <span>
                    {item.expired ? '已过期' : phaseLabel[item.room.phase]}
                  </span>
                </div>
                <dl>
                  <div>
                    <dt>房主</dt>
                    <dd>{item.room.hostNickname}</dd>
                  </div>
                  <div>
                    <dt>人数</dt>
                    <dd>
                      {item.room.playerCount}/{item.room.maxPlayers}
                    </dd>
                  </div>
                  <div>
                    <dt>盲注</dt>
                    <dd>
                      {item.room.smallBlind}/{item.room.bigBlind}
                    </dd>
                  </div>
                  <div>
                    <dt>延迟</dt>
                    <dd>
                      {item.latencyMs === null ? '—' : `${item.latencyMs} ms`}
                    </dd>
                  </div>
                </dl>
                <div className="room-list__footer">
                  <span data-compatibility={item.compatibility}>
                    {compatibilityLabel[item.compatibility]}
                  </span>
                  <button
                    type="button"
                    className="button button--primary"
                    disabled={disabled}
                    onClick={() => onJoin(item.room)}
                  >
                    加入
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
