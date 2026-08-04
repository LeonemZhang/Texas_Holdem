import { describe, expect, it } from 'vitest';

import { ClipboardImageDataUrlSchema } from './runtime';

describe('ClipboardImageDataUrlSchema', () => {
  it('accepts a PNG data URL and rejects non-PNG clipboard payloads', () => {
    expect(
      ClipboardImageDataUrlSchema.parse('data:image/png;base64,cXItY29kZQ=='),
    ).toBe('data:image/png;base64,cXItY29kZQ==');
    expect(() =>
      ClipboardImageDataUrlSchema.parse(
        'data:image/svg+xml;base64,cXItY29kZQ==',
      ),
    ).toThrow();
  });
});
