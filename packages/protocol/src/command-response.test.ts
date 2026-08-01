import { describe, expect, it } from 'vitest';

import {
  CommandResponseSchema,
  IncompatibleVersionResponseSchema,
} from './command-response.js';
import { PROTOCOL_VERSION } from './system.js';

const base = { protocolVersion: PROTOCOL_VERSION, commandId: 'command-1' };

describe('command responses', () => {
  it.each([
    { ...base, status: 'accepted', stateVersion: 2, sequence: 3 },
    {
      ...base,
      status: 'rejected',
      error: { code: 'FORBIDDEN', message: 'Not allowed' },
    },
    {
      ...base,
      status: 'conflict',
      expectedVersion: 1,
      currentVersion: 2,
      error: { code: 'CONFLICT', message: 'Version changed' },
    },
    {
      ...base,
      status: 'unauthorized',
      error: { code: 'UNAUTHORIZED', message: 'Sign in again' },
    },
    {
      ...base,
      status: 'resync-required',
      currentVersion: 5,
      latestSequence: 20,
      error: { code: 'RESYNC_REQUIRED', message: 'Snapshot required' },
    },
  ])('parses and preserves the stable $status outcome', (response) => {
    expect(CommandResponseSchema.parse(response).status).toBe(response.status);
  });

  it('distinguishes an incompatible protocol before command handling', () => {
    expect(
      IncompatibleVersionResponseSchema.parse({
        status: 'incompatible-version',
        supportedProtocolVersion: PROTOCOL_VERSION,
        receivedProtocolVersion: '99',
        error: {
          code: 'INCOMPATIBLE_VERSION',
          message: 'Upgrade the client',
        },
      }).status,
    ).toBe('incompatible-version');
  });
});
