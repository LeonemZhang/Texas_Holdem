import { describe, expect, it } from 'vitest';

import { networkErrorMessage } from './error-message.js';

describe('networkErrorMessage', () => {
  it('replaces raw transport errors with a retryable Chinese message', () => {
    expect(networkErrorMessage('Socket is not connected')).toBe(
      '网络异常，请重试',
    );
  });

  it('preserves a Chinese domain message', () => {
    expect(networkErrorMessage('版本不兼容')).toBe('版本不兼容');
  });
});
