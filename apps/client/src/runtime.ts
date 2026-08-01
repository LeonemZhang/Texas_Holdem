export type RuntimeKind = 'browser' | 'desktop';

export interface RuntimeInfo {
  kind: RuntimeKind;
  appVersion: string;
  platform: string;
}

export interface RuntimeAdapter {
  getRuntimeInfo(): Promise<RuntimeInfo>;
}

declare global {
  interface Window {
    texasHoldemDesktop?: RuntimeAdapter;
  }
}

const browserAdapter: RuntimeAdapter = {
  async getRuntimeInfo() {
    return {
      kind: 'browser',
      appVersion: 'web',
      platform: navigator.platform || 'web',
    };
  },
};

export function getRuntimeAdapter(): RuntimeAdapter {
  return window.texasHoldemDesktop ?? browserAdapter;
}
