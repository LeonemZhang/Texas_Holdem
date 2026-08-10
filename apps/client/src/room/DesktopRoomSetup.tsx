import { useEffect, useRef, useState } from 'react';

import type { CreateRoomFormValue } from './CreateRoomForm.js';
import { CopyableQRCode } from './CopyableQRCode.js';
import { CreateRoomForm } from './CreateRoomForm.js';
import type {
  DesktopNetworkInterface,
  HostServiceInfo,
  RuntimeAdapter,
} from '../runtime.js';
import { RoomSessionRequestError } from '../connection/room-session-client.js';
import type { RoomSessionResponse } from '@texas-holdem/protocol';

interface RunningRoomConflict {
  readonly room: CreateRoomFormValue;
  readonly roomId: string;
}

export interface DesktopRoomSetupProps {
  readonly runtime: RuntimeAdapter;
  readonly existingService?: HostServiceInfo | null;
  readonly onClose: () => void;
  readonly onHosted: (
    service: HostServiceInfo,
    room: CreateRoomFormValue,
  ) => Promise<HostServiceInfo>;
  readonly onRecovered: (session: RoomSessionResponse) => void;
}

export function DesktopRoomSetup({
  runtime,
  existingService = null,
  onClose,
  onHosted,
  onRecovered,
}: DesktopRoomSetupProps) {
  const [interfaces, setInterfaces] = useState<
    readonly DesktopNetworkInterface[]
  >([]);
  const [selectedAddress, setSelectedAddress] = useState(
    existingService?.advertisedAddress ?? '',
  );
  const [activeService, setActiveService] = useState<HostServiceInfo | null>(
    existingService,
  );
  const [service, setService] = useState<HostServiceInfo | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiresNewHostService, setRequiresNewHostService] = useState(false);
  const [runningRoomConflict, setRunningRoomConflict] =
    useState<RunningRoomConflict | null>(null);
  const activeServiceRequest = useRef(0);

  useEffect(() => {
    activeServiceRequest.current += 1;
    setActiveService(existingService);
  }, [existingService]);

  useEffect(() => {
    let disposed = false;
    const request = ++activeServiceRequest.current;
    void runtime
      .getActiveHostService()
      .then((current) => {
        if (!disposed && activeServiceRequest.current === request) {
          setActiveService(current);
        }
      })
      .catch(() => {
        if (!disposed && activeServiceRequest.current === request) {
          setActiveService(null);
        }
      });
    return () => {
      disposed = true;
    };
  }, [runtime]);

  useEffect(() => {
    void runtime
      .listNetworkInterfaces()
      .then((result) => {
        setInterfaces(result);
        setSelectedAddress((current) => {
          const activeAddress = activeService?.advertisedAddress;
          if (activeAddress) return activeAddress;
          return result.some((network) => network.address === current)
            ? current
            : '';
        });
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : '读取网卡失败'),
      );
  }, [activeService?.advertisedAddress, runtime]);

  const startOrReuseHostService = async () => {
    if (activeService && !requiresNewHostService) return activeService;
    if (!selectedAddress) {
      throw new Error('请选择用于朋友联机的 IPv4 网卡');
    }
    try {
      const started = await runtime.startHostService({
        port: 32_100,
        advertisedAddress: selectedAddress,
        networkName:
          interfaces.find((network) => network.address === selectedAddress)
            ?.name ?? '本机网卡',
      });
      activeServiceRequest.current += 1;
      setActiveService(started);
      return started;
    } catch (reason) {
      const current = await runtime.getActiveHostService().catch(() => null);
      if (current) {
        activeServiceRequest.current += 1;
        setActiveService(current);
        return current;
      }
      if (
        reason instanceof Error &&
        reason.message.includes(
          'Host service is already running on another address',
        )
      ) {
        throw new Error(
          '房主服务状态已变化，请稍候重试；如仍有进行中的对局，请打开对局记录恢复。',
          { cause: reason },
        );
      }
      if (
        reason instanceof Error &&
        reason.message.includes('Host service port is already in use')
      ) {
        throw new Error(
          '本机的游戏端口已被另一个游戏进程或其他程序占用。请关闭重复打开的 Texas Holdem 后重试。',
          { cause: reason },
        );
      }
      throw reason;
    }
  };

  const create = async (room: CreateRoomFormValue) => {
    setCreating(true);
    setError(null);
    let hosted: HostServiceInfo | null = null;
    try {
      hosted = await startOrReuseHostService();
      setService(await onHosted(hosted, room));
    } catch (reason) {
      if (
        reason instanceof RoomSessionRequestError &&
        reason.code === 'ROOM_ALREADY_RUNNING' &&
        reason.roomId &&
        hosted
      ) {
        setRunningRoomConflict({
          room,
          roomId: reason.roomId,
        });
        return;
      }
      setError(reason instanceof Error ? reason.message : '房主服务启动失败');
    } finally {
      setCreating(false);
    }
  };

  const recoverRunningRoom = async () => {
    if (!runningRoomConflict) return;
    setCreating(true);
    setError(null);
    try {
      onRecovered(
        await runtime.recoverRoomRecord({
          roomId: runningRoomConflict.roomId,
        }),
      );
      setRunningRoomConflict(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '恢复对局失败');
    } finally {
      setCreating(false);
    }
  };

  const closeAndCreate = async () => {
    if (!runningRoomConflict) return;
    setCreating(true);
    setError(null);
    try {
      await runtime.closeRunningRoomRecord(runningRoomConflict.roomId);
      await runtime.stopHostService();
      activeServiceRequest.current += 1;
      setActiveService(null);
      setRequiresNewHostService(true);
      setSelectedAddress('');
      setRunningRoomConflict(null);
      setError('上次对局已关闭，请重新选择网卡后创建新房间。');
    } catch {
      setError('关闭进行中对局或停止房主服务失败，请重试。');
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
        <CopyableQRCode
          value={service.joinUrl}
          size={176}
          title="加入房间二维码"
        />
      </section>
    );
  }

  return (
    <section className="desktop-room-setup">
      <div className="desktop-room-setup__network">
        <header className="desktop-room-setup__header">
          <div>
            <p className="connection-home__kicker">创建牌桌</p>
            <h2>选择房主网络</h2>
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
            disabled={activeService !== null && !requiresNewHostService}
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
            {activeService &&
            !requiresNewHostService &&
            !interfaces.some(
              (network) => network.address === activeService.advertisedAddress,
            ) ? (
              <option value={activeService.advertisedAddress}>
                当前房主服务 · {activeService.advertisedAddress}
              </option>
            ) : null}
          </select>
        </label>
        <p className="form-help">
          {activeService && !requiresNewHostService
            ? `房主服务已在 ${activeService.advertisedAddress}:${activeService.port} 运行，将直接复用。`
            : '请选择朋友也能访问的网卡，例如虚拟局域网的 10.126.126.1。'}
        </p>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div aria-busy={creating}>
        <CreateRoomForm onCreate={(room) => void create(room)} />
      </div>
      {runningRoomConflict ? (
        <div
          className="desktop-room-records__delete-confirmation"
          role="alertdialog"
          aria-label="本机已有进行中的对局"
          aria-modal="true"
        >
          <strong>本机已有进行中的对局</strong>
          <p>请恢复上次对局，或正常关闭它后创建新房间。</p>
          <button
            className="button button--primary"
            type="button"
            disabled={creating}
            onClick={() => void recoverRunningRoom()}
          >
            恢复上次对局
          </button>
          <button
            className="button button--danger"
            type="button"
            disabled={creating}
            onClick={() => void closeAndCreate()}
          >
            关闭上次对局并重新选择网卡
          </button>
          <button
            className="button button--secondary"
            type="button"
            disabled={creating}
            onClick={() => setRunningRoomConflict(null)}
          >
            取消
          </button>
        </div>
      ) : null}
    </section>
  );
}
