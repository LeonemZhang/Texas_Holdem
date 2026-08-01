import { describe, expect, it } from 'vitest';
import {
  HealthResponseSchema,
  PROTOCOL_VERSION,
  SystemHelloRequestSchema,
  SystemHelloResponseSchema,
} from './system.js';

describe('framework system protocol', () => {
  it('accepts a versioned hello exchange', () => {
    expect(
      SystemHelloRequestSchema.parse({ protocolVersion: PROTOCOL_VERSION }),
    ).toEqual({ protocolVersion: PROTOCOL_VERSION });

    expect(
      SystemHelloResponseSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        serverVersion: '0.0.0',
        serverTime: '2026-08-01T00:00:00.000Z',
      }),
    ).toBeDefined();
  });

  it('rejects an invalid health status', () => {
    expect(() =>
      HealthResponseSchema.parse({
        status: 'broken',
        protocolVersion: PROTOCOL_VERSION,
        serverVersion: '0.0.0',
      }),
    ).toThrow();
  });
});
