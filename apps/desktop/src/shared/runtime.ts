export interface DesktopRuntimeInfo {
  kind: 'desktop';
  appVersion: string;
  platform: string;
}

export interface DesktopBridge {
  getRuntimeInfo(): Promise<DesktopRuntimeInfo>;
}
