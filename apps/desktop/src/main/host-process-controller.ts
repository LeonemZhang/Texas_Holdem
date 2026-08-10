import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

import {
  HostStartInputSchema,
  type HostServiceExitEvent,
  type HostServiceInfo,
  type HostStartInput,
} from '../shared/runtime';

interface HostManagementRequest extends Readonly<Record<string, unknown>> {
  readonly requestId: string;
}

interface HostManagementResponse {
  readonly protocolVersion: '3';
  readonly requestId: string;
  readonly status: 'accepted' | 'rejected';
  readonly result?: unknown;
  readonly error?: { readonly message: string };
}

interface HostReadyMessage {
  readonly type: 'host.ready';
  readonly instanceId: string;
}

function parseManagementResponse(
  value: unknown,
): HostManagementResponse | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    (value as HostManagementResponse).protocolVersion !== '3' ||
    typeof (value as HostManagementResponse).requestId !== 'string' ||
    !['accepted', 'rejected'].includes((value as HostManagementResponse).status)
  ) {
    return null;
  }
  return value as HostManagementResponse;
}

function isHostReadyMessage(value: unknown): value is HostReadyMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as HostReadyMessage).type === 'host.ready' &&
    typeof (value as HostReadyMessage).instanceId === 'string'
  );
}

export interface HostSubprocess {
  once(event: 'exit', listener: (exitCode: number) => void): void;
  on(event: 'message', listener: (message: unknown) => void): void;
  kill(): boolean;
  postMessage(message: unknown): void;
}

export interface SpawnHostProcessInput {
  readonly env: Readonly<Record<string, string>>;
}

export interface HostProcessControllerOptions {
  readonly dataDirectory: string;
  readonly staticDirectory: string;
  readonly spawn: (input: SpawnHostProcessInput) => HostSubprocess;
  readonly isPortAvailable: (port: number) => Promise<boolean>;
  readonly healthCheck?: (url: string) => Promise<boolean>;
  readonly delay?: (milliseconds: number) => Promise<void>;
  readonly readinessAttempts?: number;
}

const defaultHealthCheck = async (url: string) => {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
};

type ActiveHost =
  | {
      readonly mode: 'management';
      readonly process: HostSubprocess;
    }
  | {
      readonly mode: 'room';
      readonly process: HostSubprocess;
      readonly info: HostServiceInfo;
    };

export class HostProcessController {
  #active: ActiveHost | null = null;
  #expectedStop = false;
  #stopping: {
    readonly process: HostSubprocess;
    readonly completion: Promise<void>;
    readonly resolve: () => void;
  } | null = null;
  readonly #listeners = new Set<(event: HostServiceExitEvent) => void>();
  readonly #managementRequests = new Map<
    string,
    {
      readonly resolve: (result: unknown) => void;
      readonly reject: (reason: Error) => void;
    }
  >();

  constructor(private readonly options: HostProcessControllerOptions) {}

  async start(rawInput: HostStartInput): Promise<HostServiceInfo> {
    const input = HostStartInputSchema.parse(rawInput);
    if (this.#active) {
      if (this.#active.mode === 'management') {
        await this.stop();
      } else if (
        this.#active.info.port === input.port &&
        this.#active.info.advertisedAddress === input.advertisedAddress
      ) {
        return this.#active.info;
      } else {
        throw new Error('Host service is already running on another address');
      }
    }
    if (!(await this.options.isPortAvailable(input.port))) {
      throw new Error('Host service port is already in use');
    }
    await mkdir(this.options.dataDirectory, { recursive: true });
    const joinUrl = `http://${input.advertisedAddress}:${input.port}`;
    const info = Object.freeze({
      port: input.port,
      advertisedAddress: input.advertisedAddress,
      joinUrl,
      dataDirectory: this.options.dataDirectory,
      ...(input.networkName ? { networkName: input.networkName } : {}),
    });
    const instanceId = randomUUID();
    const process = this.options.spawn({
      env: {
        HOST_MODE: 'room',
        HOST_PORT: String(input.port),
        HOST_ADDRESS: '0.0.0.0',
        HOST_ADVERTISED_ADDRESS: input.advertisedAddress,
        HOST_NETWORK_NAME: input.networkName ?? '本机网卡',
        HOST_DATA_DIR: this.options.dataDirectory,
        CLIENT_DIST_DIR: this.options.staticDirectory,
        HOST_INSTANCE_ID: instanceId,
      },
    });
    let childReady = false;
    this.#expectedStop = false;
    this.#active = { mode: 'room', process, info };
    this.observe(process, instanceId, () => {
      childReady = true;
    });

    const healthUrl = `http://127.0.0.1:${input.port}/health`;
    const attempts = this.options.readinessAttempts ?? 30;
    const healthCheck = this.options.healthCheck ?? defaultHealthCheck;
    const delay = this.delay();
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (!this.#active)
        throw new Error('Host service exited before readiness');
      if (childReady && (await healthCheck(healthUrl))) return info;
      await delay(100);
    }
    this.#expectedStop = true;
    process.kill();
    this.#active = null;
    throw new Error(
      'Host service readiness timed out; another host may still be using this port',
    );
  }

  async startManagement(): Promise<void> {
    if (this.#active) return;
    await mkdir(this.options.dataDirectory, { recursive: true });
    const instanceId = randomUUID();
    const process = this.options.spawn({
      env: {
        HOST_MODE: 'management',
        HOST_DATA_DIR: this.options.dataDirectory,
        HOST_INSTANCE_ID: instanceId,
      },
    });
    let childReady = false;
    this.#expectedStop = false;
    this.#active = { mode: 'management', process };
    this.observe(process, instanceId, () => {
      childReady = true;
    });
    const attempts = this.options.readinessAttempts ?? 30;
    const delay = this.delay();
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (!this.#active)
        throw new Error(
          'Host service exited before record management readiness',
        );
      if (childReady) return;
      await delay(100);
    }
    this.#expectedStop = true;
    process.kill();
    this.#active = null;
    throw new Error('Room record management readiness timed out');
  }

  current(): HostServiceInfo | null {
    return this.#active?.mode === 'room' ? this.#active.info : null;
  }

  stop(): Promise<void> {
    if (!this.#active) return Promise.resolve();
    if (this.#stopping?.process === this.#active.process) {
      return this.#stopping.completion;
    }
    let resolve: () => void = () => undefined;
    const completion = new Promise<void>((done) => {
      resolve = done;
    });
    const process = this.#active.process;
    this.#stopping = { process, completion, resolve };
    this.#expectedStop = true;
    if (!process.kill()) {
      this.#stopping = null;
      this.#expectedStop = false;
      return Promise.reject(new Error('Unable to stop host service'));
    }
    return completion;
  }

  manage(request: HostManagementRequest): Promise<unknown> {
    const active = this.#active;
    if (!active)
      return Promise.reject(new Error('Host service is not running'));
    if (this.#managementRequests.has(request.requestId)) {
      return Promise.reject(new Error('Management request is already pending'));
    }
    return new Promise((resolve, reject) => {
      this.#managementRequests.set(request.requestId, { resolve, reject });
      active.process.postMessage(request);
    });
  }

  subscribe(listener: (event: HostServiceExitEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  private delay(): (milliseconds: number) => Promise<void> {
    return (
      this.options.delay ??
      ((milliseconds) =>
        new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))
    );
  }

  private observe(
    process: HostSubprocess,
    instanceId: string,
    onReady: () => void,
  ): void {
    process.on('message', (rawResponse) => {
      if (
        isHostReadyMessage(rawResponse) &&
        rawResponse.instanceId === instanceId
      ) {
        onReady();
        return;
      }
      const response = parseManagementResponse(rawResponse);
      if (!response) return;
      const pending = this.#managementRequests.get(response.requestId);
      if (!pending) return;
      this.#managementRequests.delete(response.requestId);
      if (response.status === 'accepted') {
        pending.resolve(response.result);
      } else {
        pending.reject(
          new Error(response.error?.message ?? 'Management failed'),
        );
      }
    });
    process.once('exit', (exitCode) => {
      if (this.#active?.process !== process) return;
      const event = Object.freeze({
        expected: this.#expectedStop,
        exitCode,
      });
      this.#active = null;
      if (this.#stopping?.process === process) {
        this.#stopping.resolve();
        this.#stopping = null;
      }
      this.rejectManagementRequests(
        new Error('Host service exited before completing management request'),
      );
      this.#listeners.forEach((listener) => listener(event));
    });
  }

  private rejectManagementRequests(reason: Error): void {
    for (const pending of this.#managementRequests.values()) {
      pending.reject(reason);
    }
    this.#managementRequests.clear();
  }
}
