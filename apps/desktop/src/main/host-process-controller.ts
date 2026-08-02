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
  readonly protocolVersion: '1';
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
    (value as HostManagementResponse).protocolVersion !== '1' ||
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

export class HostProcessController {
  #active: { process: HostSubprocess; info: HostServiceInfo } | null = null;
  #expectedStop = false;
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
      if (
        this.#active.info.port === input.port &&
        this.#active.info.advertisedAddress === input.advertisedAddress
      ) {
        return this.#active.info;
      }
      throw new Error('Host service is already running on another address');
    }
    await mkdir(this.options.dataDirectory, { recursive: true });
    const joinUrl = `http://${input.advertisedAddress}:${input.port}`;
    const info = Object.freeze({
      port: input.port,
      advertisedAddress: input.advertisedAddress,
      joinUrl,
      dataDirectory: this.options.dataDirectory,
    });
    const instanceId = randomUUID();
    const process = this.options.spawn({
      env: {
        HOST_PORT: String(input.port),
        HOST_ADDRESS: '0.0.0.0',
        HOST_ADVERTISED_ADDRESS: input.advertisedAddress,
        HOST_DATA_DIR: this.options.dataDirectory,
        CLIENT_DIST_DIR: this.options.staticDirectory,
        HOST_INSTANCE_ID: instanceId,
      },
    });
    let childReady = false;
    this.#expectedStop = false;
    this.#active = { process, info };
    process.on('message', (rawResponse) => {
      if (
        isHostReadyMessage(rawResponse) &&
        rawResponse.instanceId === instanceId
      ) {
        childReady = true;
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
      this.rejectManagementRequests(
        new Error('Host service exited before completing management request'),
      );
      this.#listeners.forEach((listener) => listener(event));
    });

    const healthUrl = `http://127.0.0.1:${input.port}/health`;
    const attempts = this.options.readinessAttempts ?? 30;
    const healthCheck = this.options.healthCheck ?? defaultHealthCheck;
    const delay =
      this.options.delay ??
      ((milliseconds) =>
        new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
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

  current(): HostServiceInfo | null {
    return this.#active?.info ?? null;
  }

  stop(): void {
    if (!this.#active) return;
    this.#expectedStop = true;
    this.#active.process.kill();
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

  private rejectManagementRequests(reason: Error): void {
    for (const pending of this.#managementRequests.values()) {
      pending.reject(reason);
    }
    this.#managementRequests.clear();
  }
}
