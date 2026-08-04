import { useEffect, useState } from 'react';

import type {
  DesktopNetworkInterface,
  HostServiceInfo,
  RuntimeAdapter,
} from '../runtime.js';

export interface NetworkDiagnosticsProps {
  readonly runtime: RuntimeAdapter;
  readonly hostService: HostServiceInfo | null;
}

export function NetworkDiagnostics({
  runtime,
  hostService,
}: NetworkDiagnosticsProps) {
  const [interfaces, setInterfaces] = useState<
    readonly DesktopNetworkInterface[]
  >([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setInterfaces(await runtime.listNetworkInterfaces());
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '网卡读取失败');
    }
  };

  useEffect(() => {
    void refresh();
  }, [runtime]);

  return (
    <section className="network-diagnostics">
      <div className="network-diagnostics__content">
        <header>
          <div>
            <p className="connection-home__kicker">Windows 联机检查</p>
            <h2>网卡、端口与防火墙</h2>
          </div>
          <button type="button" onClick={() => void refresh()}>
            重新检测
          </button>
        </header>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <ul className="network-adapters">
          {interfaces.map((network) => (
            <li key={`${network.name}-${network.address}`}>
              <strong>{network.name}</strong>
              <span>{network.address}</span>
              <small>掩码 {network.netmask}</small>
            </li>
          ))}
        </ul>
        <dl className="network-ports">
          <div>
            <dt>游戏与网页端口</dt>
            <dd>{hostService?.port ?? 32_100} / TCP</dd>
          </div>
          <div>
            <dt>房间发现端口</dt>
            <dd>32101 / UDP</dd>
          </div>
          <div>
            <dt>当前邀请地址</dt>
            <dd>{hostService?.joinUrl ?? '尚未启动房主服务'}</dd>
          </div>
        </dl>
        <p className="network-diagnostics__tip">
          若朋友无法发现或连接，请在 Windows
          防火墙中允许本程序的专用网络访问，并确认所有玩家已加入同一虚拟局域网。广播失败时仍可使用房主
          IP 直连。
        </p>
      </div>
    </section>
  );
}
