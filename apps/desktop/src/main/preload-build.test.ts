import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('desktop preload build', () => {
  it('bundles local dependencies for Electron sandbox compatibility', () => {
    const packageJson = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
    ) as { scripts?: { build?: string } };
    const buildScript = packageJson.scripts?.build;

    expect(buildScript).toContain(
      'esbuild src/preload/index.ts --bundle --platform=node --format=cjs',
    );
    expect(buildScript).toContain('--external:electron');
    expect(buildScript).toContain('--outfile=dist/preload/index.js');
  });
});
