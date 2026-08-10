import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';

import { isTcpPortAvailable } from './host-port';

describe('isTcpPortAvailable', () => {
  it('reports a port held by another local process as unavailable', async () => {
    const occupied = createServer();
    await new Promise<void>((resolve, reject) => {
      occupied.once('error', reject);
      occupied.listen({ port: 0, host: '0.0.0.0' }, resolve);
    });
    const address = occupied.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected the occupied TCP server to expose its port');
    }

    try {
      await expect(isTcpPortAvailable(address.port)).resolves.toBe(false);
    } finally {
      await new Promise<void>((resolve, reject) => {
        occupied.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
