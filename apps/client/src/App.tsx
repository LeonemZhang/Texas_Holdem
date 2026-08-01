import { PageShell } from '@texas-holdem/ui';
import { useEffect, useState } from 'react';
import { ConnectionHome } from './home/ConnectionHome';
import {
  RoomDiscoveryList,
  type RoomDiscoveryListItem,
} from './home/RoomDiscoveryList';
import { DesktopRoomSetup } from './room/DesktopRoomSetup';
import { getRuntimeAdapter, type RuntimeInfo } from './runtime';
import { UiSmokePreview } from './test/UiSmokePreview';

export function App() {
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [joinAddress, setJoinAddress] = useState<string | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [rooms, setRooms] = useState<readonly RoomDiscoveryListItem[]>([]);
  const [refreshingRooms, setRefreshingRooms] = useState(false);
  const adapter = getRuntimeAdapter();

  useEffect(() => {
    void adapter.getRuntimeInfo().then(setRuntime);
  }, []);

  const refreshRooms = async () => {
    setRefreshingRooms(true);
    try {
      const discovered = await adapter.scanLanRooms({
        requestId: crypto.randomUUID(),
        discoveryPort: 32_101,
      });
      setRooms(
        discovered.map((room) => ({
          room,
          compatibility: 'compatible',
          latencyMs: null,
          expired: false,
        })),
      );
    } finally {
      setRefreshingRooms(false);
    }
  };

  const preview = import.meta.env.DEV
    ? new URLSearchParams(window.location.search).get('preview')
    : null;
  if (preview) return <UiSmokePreview page={preview} />;

  return (
    <PageShell
      title="Texas Hold'em"
      subtitle="面向朋友局域网对战的桌面房主与多端玩家框架"
    >
      <ConnectionHome
        runtimeKind={runtime?.kind ?? 'browser'}
        onCreateRoom={() => setCreatingRoom(true)}
        onRefreshRooms={() => void refreshRooms()}
        onJoinAddress={setJoinAddress}
      />
      {runtime?.kind === 'desktop' && creatingRoom ? (
        <DesktopRoomSetup
          runtime={adapter}
          onHosted={(service) => setJoinAddress(service.joinUrl)}
        />
      ) : null}
      {runtime?.kind === 'desktop' ? (
        <RoomDiscoveryList
          rooms={rooms}
          refreshing={refreshingRooms}
          onRefresh={() => void refreshRooms()}
          onJoin={(room) =>
            setJoinAddress(`http://${room.hostAddress}:${room.httpPort}`)
          }
        />
      ) : null}
      {joinAddress ? (
        <p className="connection-target" role="status">
          准备连接：{joinAddress}
        </p>
      ) : null}
    </PageShell>
  );
}
