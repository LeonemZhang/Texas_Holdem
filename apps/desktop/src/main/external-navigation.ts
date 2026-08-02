export interface ExternalNavigationInput {
  readonly url: string;
  readonly isTrustedRendererUrl: (url: string) => boolean;
  readonly preventDefault: () => void;
  readonly openExternal: (url: string) => Promise<void>;
}

function isHttpUrl(url: string) {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function openInBrowser(
  url: string,
  openExternal: (url: string) => Promise<void>,
) {
  if (isHttpUrl(url)) {
    void openExternal(url).catch(() => undefined);
  }
}

export function guardMainWindowNavigation(input: ExternalNavigationInput) {
  if (input.isTrustedRendererUrl(input.url)) {
    return;
  }

  input.preventDefault();
  openInBrowser(input.url, input.openExternal);
}

export function guardNewWindowOpen(
  url: string,
  openExternal: (url: string) => Promise<void>,
): { action: 'deny' } {
  openInBrowser(url, openExternal);
  return { action: 'deny' };
}
