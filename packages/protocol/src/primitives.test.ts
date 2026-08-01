import { describe, expect, it } from 'vitest';

import {
  AmountSchema,
  ErrorEnvelopeSchema,
  IdSchema,
  ProtocolVersionSchema,
  SequenceSchema,
  StateVersionSchema,
} from './primitives.js';

describe('protocol primitives', () => {
  it('rejects incompatible protocol versions and empty identifiers', () => {
    expect(ProtocolVersionSchema.safeParse('2').success).toBe(false);
    expect(IdSchema.safeParse('   ').success).toBe(false);
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid safe integer amount %s',
    (amount) => {
      expect(AmountSchema.safeParse(amount).success).toBe(false);
    },
  );

  it('uses non-negative safe integers for sequence and state version', () => {
    expect(SequenceSchema.parse(0)).toBe(0);
    expect(StateVersionSchema.parse(42)).toBe(42);
    expect(SequenceSchema.safeParse(-1).success).toBe(false);
  });

  it('parses one stable error envelope shape', () => {
    expect(
      ErrorEnvelopeSchema.parse({
        error: { code: 'CONFLICT', message: 'State version changed' },
      }),
    ).toEqual({
      error: { code: 'CONFLICT', message: 'State version changed' },
    });
  });
});
