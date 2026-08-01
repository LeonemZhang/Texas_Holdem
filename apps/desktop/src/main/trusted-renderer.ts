export function isTrustedRendererUrl(url: string, developmentUrl?: string) {
  if (url.startsWith('file://')) {
    return true;
  }

  if (!developmentUrl) {
    return false;
  }

  try {
    return new URL(url).origin === new URL(developmentUrl).origin;
  } catch {
    return false;
  }
}
