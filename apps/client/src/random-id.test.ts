import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRandomId } from './random-id.js';

const nativeCrypto = globalThis.crypto;

afterEach(() => {
  vi.stubGlobal('crypto', nativeCrypto);
});

describe('createRandomId', () => {
  it('uses randomUUID when the runtime provides it', () => {
    const randomUUID = vi.fn(() => 'native-random-id');
    vi.stubGlobal('crypto', { randomUUID });

    expect(createRandomId()).toBe('native-random-id');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('creates an RFC 4122 v4 id when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.set([
          0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a,
          0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
        ]);
        return bytes;
      },
    });

    expect(createRandomId()).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
  });
});
