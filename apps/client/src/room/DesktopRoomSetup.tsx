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
  readonly mode: 'create' | 'records';
  readonly existingService?: HostServiceInfo | null;
  readonly onClose: () => void;
  readonly onHosted: (
    service: HostServiceInfo,
    room: CreateRoomFormValue,
  ) => Promise<HostServiceInfo>;
  readonly onManageRecords: (service: HostServiceInfo) => Promise<void>;
}

export function DesktopRoomSetup({
  runtime,
  mode,
  existingService = null,
  onClose,
  onHosted,
  onManageRecords,
}: DesktopRoomSetupProps) {
  const [interfaces, setInterfaces] = useState<
    readonly DesktopNetworkInterface[]
  >([]);
  const [selectedAddress, setSelectedAddress] = useState(
    existingService?.advertisedAddress ?? '',
  );
  const [service, setService] = useState<HostServiceInfo | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void runtime
      .listNetworkInterfaces()
      .then((result) => {
        setInterfaces(result);
        setSelectedAddress(
          existingService?.advertisedAddress ?? result[0]?.address ?? '',
        );
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : '读取网卡失败'),
      );
  }, [existingService?.advertisedAddress, runtime]);

  const startOrReuseHostService = async () => {
    if (existingService) return existingService;
    if (!selectedAddress) {
      throw new Error('请选择用于朋友联机的 IPv4 网卡');
    }
    return runtime.startHostService({
      port: 32_100,
      advertisedAddress: selectedAddress,
    });
  };

  const create = async (room: CreateRoomFormValue) => {
    setCreating(true);
    setError(null);
    try {
      const hosted = await startOrReuseHostService();
      setService(await onHosted(hosted, room));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '房主服务启动失败');
    } finally {
      setCreating(false);
    }
  };

  const manageRecords = async () => {
    setCreating(true);
    setError(null);
    try {
      await onManageRecords(await startOrReuseHostService());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '读取对局记录失败');
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
      <div className="desktop-room-setup__network">
        <header className="desktop-room-setup__header">
          <div>
            <p className="connection-home__kicker">
              {mode === 'create' ? '创建牌桌' : '房主控制台'}
            </p>
            <h2>{mode === 'create' ? '选择房主网络' : '打开对局记录管理'}</h2>
          </div>
          <button
            type="button"
            className="button button--secondary"
            onClick={onClose}
          >
            返回首页
          </button>
        </header>
        <label className="desktop-room-setup__adapter">
          联机网卡
          <select
            value={selectedAddress}
            disabled={existingService !== null}
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
            {existingService &&
            !interfaces.some(
              (network) =>
                network.address === existingService.advertisedAddress,
            ) ? (
              <option value={existingService.advertisedAddress}>
                当前房主服务 · {existingService.advertisedAddress}
              </option>
            ) : null}
          </select>
        </label>
        <p className="form-help">
          {existingService
            ? `房主服务已在 ${existingService.advertisedAddress}:${existingService.port} 运行，将直接复用。`
            : '请选择朋友也能访问的网卡，例如虚拟局域网的 10.126.126.1。'}
        </p>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {mode === 'records' ? (
          <button
            type="button"
            className="button button--primary desktop-room-setup__open-records"
            disabled={creating}
            onClick={() => void manageRecords()}
          >
            {creating ? '正在打开…' : '打开对局记录'}
          </button>
        ) : null}
      </div>
      {mode === 'create' ? (
        <div aria-busy={creating}>
          <CreateRoomForm onCreate={(room) => void create(room)} />
        </div>
      ) : null}
    </section>
  );
}
