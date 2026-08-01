import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('framework documentation', () => {
  it('keeps both approved source-of-truth documents available', async () => {
    await expect(
      access(resolve('docs/product-spec.md')),
    ).resolves.toBeUndefined();
    await expect(
      access(resolve('docs/architecture.md')),
    ).resolves.toBeUndefined();
  });
});
