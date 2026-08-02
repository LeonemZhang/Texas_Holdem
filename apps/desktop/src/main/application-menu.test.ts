import { describe, expect, it, vi } from 'vitest';

import { hideApplicationMenu } from './application-menu';

describe('application menu', () => {
  it('removes Electron’s default menu bar', () => {
    const setApplicationMenu = vi.fn();

    hideApplicationMenu({ setApplicationMenu });

    expect(setApplicationMenu).toHaveBeenCalledExactlyOnceWith(null);
  });
});
