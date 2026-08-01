import { mkdir } from 'node:fs/promises';

import {
  HostStartInputSchema,
  type HostServiceExitEvent,
  type HostServiceInfo,
  type HostStartInput,
} from '../shared/runtime';

export interface HostSubprocess {
  once(event: 'exit', listener: (exitCode: number) => void): void;
  kill(): boolean;
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

  constructor(private readonly options: HostProcessControllerOptions) {}

  async start(rawInput: HostStartInput): Promise<HostServiceInfo> {
    if (this.#active) throw new Error('Host service is already running');
    const input = HostStartInputSchema.parse(rawInput);
    await mkdir(this.options.dataDirectory, { recursive: true });
    const joinUrl = `http://${input.advertisedAddress}:${input.port}`;
    const info = Object.freeze({
      port: input.port,
      advertisedAddress: input.advertisedAddress,
      joinUrl,
      dataDirectory: this.options.dataDirectory,
    });
    const process = this.options.spawn({
      env: {
        HOST_PORT: String(input.port),
        HOST_ADDRESS: '0.0.0.0',
        HOST_ADVERTISED_ADDRESS: input.advertisedAddress,
        HOST_DATA_DIR: this.options.dataDirectory,
        CLIENT_DIST_DIR: this.options.staticDirectory,
      },
    });
    this.#expectedStop = false;
    this.#active = { process, info };
    process.once('exit', (exitCode) => {
      if (this.#active?.process !== process) return;
      const event = Object.freeze({
        expected: this.#expectedStop,
        exitCode,
      });
      this.#active = null;
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
      if (await healthCheck(healthUrl)) return info;
      await delay(100);
    }
    this.#expectedStop = true;
    process.kill();
    this.#active = null;
    throw new Error('Host service readiness timed out');
  }

  stop(): void {
    if (!this.#active) return;
    this.#expectedStop = true;
    this.#active.process.kill();
  }

  subscribe(listener: (event: HostServiceExitEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}
