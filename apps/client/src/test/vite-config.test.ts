// @vitest-environment node

import { describe, expect, it } from 'vitest';

import viteConfig from '../../vite.config.js';

describe('Vite production paths', () => {
  it('uses relative assets so the packaged Electron file URL can load them', () => {
    expect(viteConfig).toMatchObject({ base: './' });
  });
});
