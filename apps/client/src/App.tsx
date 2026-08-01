import { PROTOCOL_VERSION } from '@texas-holdem/protocol';
import { PageShell } from '@texas-holdem/ui';
import { useEffect, useState } from 'react';
import { getRuntimeAdapter, type RuntimeInfo } from './runtime';

export function App() {
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);

  useEffect(() => {
    void getRuntimeAdapter().getRuntimeInfo().then(setRuntime);
  }, []);

  return (
    <PageShell
      title="Texas Hold'em"
      subtitle="面向朋友局域网对战的桌面房主与多端玩家框架"
    >
      <div className="status-grid" aria-label="框架状态">
        <article className="status-card">
          <span>运行环境</span>
          <strong>{runtime?.kind ?? '检测中'}</strong>
          <small>{runtime?.platform ?? '正在读取运行时信息'}</small>
        </article>
        <article className="status-card">
          <span>协议版本</span>
          <strong>v{PROTOCOL_VERSION}</strong>
          <small>客户端与房主服务共享</small>
        </article>
        <article className="status-card">
          <span>服务连接</span>
          <strong>未连接</strong>
          <small>房间功能将在增量模块中接入</small>
        </article>
      </div>
    </PageShell>
  );
}
