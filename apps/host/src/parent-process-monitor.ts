export interface ParentProcessMonitorScheduler {
  setInterval(callback: () => void, milliseconds: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface ParentProcessMonitorOptions {
  readonly parentPid: number | null;
  readonly onParentExit: () => void | Promise<void>;
  readonly intervalMs?: number;
  readonly isProcessAlive?: (pid: number) => boolean;
  readonly scheduler?: ParentProcessMonitorScheduler;
}

const defaultScheduler: ParentProcessMonitorScheduler = {
  setInterval: (callback, milliseconds) => setInterval(callback, milliseconds),
  clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout),
};

function defaultIsProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'EPERM'
    );
  }
}

export function parentPidFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): number | null {
  const rawPid = environment.HOST_PARENT_PID?.trim();
  if (!rawPid) return null;
  const parentPid = Number(rawPid);
  return Number.isSafeInteger(parentPid) && parentPid > 0 ? parentPid : null;
}

export function startParentProcessMonitor({
  parentPid,
  onParentExit,
  intervalMs = 1_000,
  isProcessAlive = defaultIsProcessAlive,
  scheduler = defaultScheduler,
}: ParentProcessMonitorOptions): () => void {
  if (parentPid === null || parentPid === process.pid) return () => undefined;

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    scheduler.clearInterval(handle);
  };
  const checkParent = () => {
    if (stopped || isProcessAlive(parentPid)) return;
    stop();
    void onParentExit();
  };

  const handle = scheduler.setInterval(checkParent, intervalMs);
  checkParent();
  return stop;
}
