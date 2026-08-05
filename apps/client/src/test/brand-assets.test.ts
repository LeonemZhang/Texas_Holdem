// @vitest-environment node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const clientRoot = resolve(import.meta.dirname, '../..');

describe('browser brand assets', () => {
  it('uses relative branded links for browser and packaged Electron loading', async () => {
    const html = await readFile(resolve(clientRoot, 'index.html'), 'utf8');

    expect(html).toContain('<title>Texas Holdem</title>');
    expect(html).toContain('href="./favicon.svg"');
    expect(html).toContain('href="./favicon.ico"');
    expect(html).toContain('href="./apple-touch-icon.png"');
    expect(html).toContain('href="./site.webmanifest"');
    expect(html).not.toContain('data:image/svg+xml');
  });

  it('publishes installable icon metadata under the canonical product name', async () => {
    const manifest = JSON.parse(
      await readFile(resolve(clientRoot, 'public/site.webmanifest'), 'utf8'),
    ) as {
      readonly name: string;
      readonly short_name: string;
      readonly start_url: string;
      readonly icons: readonly {
        readonly src: string;
        readonly sizes: string;
        readonly purpose: string;
      }[];
    };

    expect(manifest).toMatchObject({
      name: 'Texas Holdem',
      short_name: 'Texas Holdem',
      start_url: './',
    });
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: '192x192', purpose: 'any' }),
        expect.objectContaining({ sizes: '512x512', purpose: 'any' }),
        expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }),
      ]),
    );
  });

  it('publishes a single-color Safari mask without the app-icon background', async () => {
    const mask = await readFile(
      resolve(clientRoot, 'public/safari-pinned-tab.svg'),
      'utf8',
    );

    expect(mask).toContain('#brand-background { display: none; }');
    expect(mask).toContain('#brand-mark { fill: #000; filter: none; }');
  });
});
