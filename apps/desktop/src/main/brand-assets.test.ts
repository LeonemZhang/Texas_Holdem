import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Windows brand icon', () => {
  it('contains all required ICO frames including 256x256', async () => {
    const icon = await readFile(resolve(process.cwd(), 'build/icon.ico'));
    expect(icon.readUInt16LE(0)).toBe(0);
    expect(icon.readUInt16LE(2)).toBe(1);

    const entryCount = icon.readUInt16LE(4);
    const sizes = Array.from({ length: entryCount }, (_, index) => {
      const offset = 6 + index * 16;
      const width = icon.readUInt8(offset) || 256;
      const height = icon.readUInt8(offset + 1) || 256;
      return `${width}x${height}`;
    });

    expect(sizes).toEqual([
      '16x16',
      '24x24',
      '32x32',
      '48x48',
      '64x64',
      '128x128',
      '256x256',
    ]);
  });
});
