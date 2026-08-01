import { PageShell } from '@texas-holdem/ui';
import { useEffect, useState } from 'react';
import { ConnectionHome } from './home/ConnectionHome';
import { getRuntimeAdapter, type RuntimeInfo } from './runtime';
import { UiSmokePreview } from './test/UiSmokePreview';

export function App() {
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [joinAddress, setJoinAddress] = useState<string | null>(null);

  useEffect(() => {
    void getRuntimeAdapter().getRuntimeInfo().then(setRuntime);
  }, []);

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
        onCreateRoom={() => undefined}
        onRefreshRooms={() => undefined}
        onJoinAddress={setJoinAddress}
      />
      {joinAddress ? (
        <p className="connection-target" role="status">
          准备连接：{joinAddress}
        </p>
      ) : null}
    </PageShell>
  );
}
