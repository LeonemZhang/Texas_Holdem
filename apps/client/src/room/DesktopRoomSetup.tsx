import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

import type { CreateRoomFormValue } from './CreateRoomForm.js';
import { CreateRoomForm } from './CreateRoomForm.js';
import type {
  DesktopNetworkInterface,
  HostServiceInfo,
  RuntimeAdapter,
} from '../runtime.js';

export interface DesktopRoomSetupProps {
  readonly runtime: RuntimeAdapter;
  readonly onHosted: (
    service: HostServiceInfo,
    room: CreateRoomFormValue,
  ) => Promise<HostServiceInfo>;
}

export function DesktopRoomSetup({ runtime, onHosted }: DesktopRoomSetupProps) {
  const [interfaces, setInterfaces] = useState<
    readonly DesktopNetworkInterface[]
  >([]);
  const [selectedAddress, setSelectedAddress] = useState('');
  const [service, setService] = useState<HostServiceInfo | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void runtime
      .listNetworkInterfaces()
      .then((result) => {
        setInterfaces(result);
        setSelectedAddress((current) => current || result[0]?.address || '');
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : '读取网卡失败'),
      );
  }, [runtime]);

  const create = async (room: CreateRoomFormValue) => {
    if (!selectedAddress) {
      setError('请选择用于朋友联机的 IPv4 网卡');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const hosted = await runtime.startHostService({
        port: 32_100,
        advertisedAddress: selectedAddress,
      });
      setService(await onHosted(hosted, room));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '房主服务启动失败');
    } finally {
      setCreating(false);
    }
  };

  if (service) {
    return (
      <section className="host-share" aria-labelledby="host-share-title">
        <div>
          <p className="connection-home__kicker">房主服务已就绪</p>
          <h2 id="host-share-title">邀请朋友加入</h2>
          <p>电脑和手机连接同一虚拟局域网后，打开下方地址或扫描二维码。</p>
          <a href={service.joinUrl}>{service.joinUrl}</a>
        </div>
        <QRCodeSVG value={service.joinUrl} size={176} title="加入房间二维码" />
      </section>
    );
  }

  return (
    <section className="desktop-room-setup">
      <label className="desktop-room-setup__adapter">
        联机网卡
        <select
          value={selectedAddress}
          onChange={(event) => setSelectedAddress(event.target.value)}
        >
          <option value="" disabled>
            选择 IPv4 网卡
          </option>
          {interfaces.map((network) => (
            <option
              key={`${network.name}-${network.address}`}
              value={network.address}
            >
              {network.name} · {network.address}
            </option>
          ))}
        </select>
      </label>
      <p className="form-help">
        请选择朋友也能访问的网卡，例如虚拟局域网的 10.126.126.1。
      </p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div aria-busy={creating}>
        <CreateRoomForm onCreate={(room) => void create(room)} />
      </div>
    </section>
  );
}
