import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { dirname, relative, resolve } from 'node:path';

import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const rootDirectory = resolve(import.meta.dirname, '..');
const sourcePath = resolve(rootDirectory, 'assets/branding/app-icon.svg');
const clientPublicDirectory = resolve(rootDirectory, 'apps/client/public');
const desktopBuildDirectory = resolve(rootDirectory, 'apps/desktop/build');
const icoSizes = [16, 24, 32, 48, 64, 128, 256];

const manifest = `${JSON.stringify(
  {
    name: 'Texas Holdem',
    short_name: 'Texas Holdem',
    description: 'Local-first no-limit Texas Holdem for friends',
    start_url: './',
    display: 'standalone',
    background_color: '#071a16',
    theme_color: '#071a16',
    icons: [
      {
        src: './icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: './icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: './maskable-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  },
  null,
  2,
)}\n`;

const browserConfig = `<?xml version="1.0" encoding="utf-8"?>
<browserconfig>
  <msapplication>
    <tile>
      <square150x150logo src="./mstile-150x150.png" />
      <TileColor>#071a16</TileColor>
    </tile>
  </msapplication>
</browserconfig>
`;

async function renderPng(svg, size) {
  return sharp(svg)
    .resize(size, size)
    .png({ adaptiveFiltering: true, compressionLevel: 9 })
    .toBuffer();
}

async function renderMaskablePng(svg) {
  const safeArtwork = await sharp(svg)
    .resize(384, 384)
    .png({ adaptiveFiltering: true, compressionLevel: 9 })
    .toBuffer();
  return sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: '#071a16',
    },
  })
    .composite([{ input: safeArtwork, left: 64, top: 64 }])
    .png({ adaptiveFiltering: true, compressionLevel: 9 })
    .toBuffer();
}

function renderSafariPinnedTabSvg(svg) {
  const source = svg.toString('utf8');
  const overrides = `  <style>
    #brand-background { display: none; }
    #brand-mark { fill: #000; filter: none; }
  </style>
`;
  if (!source.includes('<defs>')) {
    throw new Error('Brand SVG is missing the expected <defs> element.');
  }
  return Buffer.from(source.replace('  <defs>\n', `${overrides}  <defs>\n`));
}

async function expectedAssets() {
  const svg = await readFile(sourcePath);
  const icoFrames = await Promise.all(
    icoSizes.map((size) => renderPng(svg, size)),
  );
  const ico = await pngToIco(icoFrames);
  const pngBySize = new Map(
    await Promise.all(
      [16, 32, 150, 180, 192, 512].map(async (size) => [
        size,
        await renderPng(svg, size),
      ]),
    ),
  );

  return new Map([
    [resolve(desktopBuildDirectory, 'icon.ico'), ico],
    [resolve(desktopBuildDirectory, 'icon.png'), pngBySize.get(512)],
    [resolve(clientPublicDirectory, 'favicon.svg'), svg],
    [
      resolve(clientPublicDirectory, 'safari-pinned-tab.svg'),
      renderSafariPinnedTabSvg(svg),
    ],
    [resolve(clientPublicDirectory, 'favicon.ico'), ico],
    [resolve(clientPublicDirectory, 'favicon-16x16.png'), pngBySize.get(16)],
    [resolve(clientPublicDirectory, 'favicon-32x32.png'), pngBySize.get(32)],
    [
      resolve(clientPublicDirectory, 'apple-touch-icon.png'),
      pngBySize.get(180),
    ],
    [resolve(clientPublicDirectory, 'icon-192.png'), pngBySize.get(192)],
    [resolve(clientPublicDirectory, 'icon-512.png'), pngBySize.get(512)],
    [
      resolve(clientPublicDirectory, 'maskable-icon-512.png'),
      await renderMaskablePng(svg),
    ],
    [resolve(clientPublicDirectory, 'mstile-150x150.png'), pngBySize.get(150)],
    [resolve(clientPublicDirectory, 'site.webmanifest'), Buffer.from(manifest)],
    [
      resolve(clientPublicDirectory, 'browserconfig.xml'),
      Buffer.from(browserConfig),
    ],
  ]);
}

async function writeAssets(assets) {
  for (const [path, contents] of assets) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
    globalThis.console.log(`generated ${relative(rootDirectory, path)}`);
  }
}

async function checkAssets(assets) {
  const stale = [];
  for (const [path, expected] of assets) {
    const actual = await readFile(path).catch(() => null);
    if (!actual?.equals(expected)) stale.push(relative(rootDirectory, path));
  }
  if (stale.length) {
    throw new Error(
      `Brand assets are missing or stale:\n${stale.join('\n')}\nRun pnpm brand:generate.`,
    );
  }
  globalThis.console.log(
    `Brand assets are current (${assets.size} files, ICO sizes: ${icoSizes.join(', ')}).`,
  );
}

const command = globalThis.process.argv[2];
const assets = await expectedAssets();
if (command === '--write') await writeAssets(assets);
else if (command === '--check') await checkAssets(assets);
else throw new Error('Usage: pnpm brand:generate | pnpm brand:check');
