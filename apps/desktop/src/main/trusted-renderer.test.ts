import { describe, expect, it } from 'vitest';
import { isTrustedRendererUrl } from './trusted-renderer';

describe('trusted renderer validation', () => {
  it('allows packaged files and the configured development origin', () => {
    expect(isTrustedRendererUrl('file:///C:/app/index.html')).toBe(true);
    expect(
      isTrustedRendererUrl(
        'http://localhost:5173/table',
        'http://localhost:5173',
      ),
    ).toBe(true);
  });

  it('rejects unrelated and malformed URLs', () => {
    expect(
      isTrustedRendererUrl(
        'http://example.test/attack',
        'http://localhost:5173',
      ),
    ).toBe(false);
    expect(isTrustedRendererUrl('not a url')).toBe(false);
  });
});
