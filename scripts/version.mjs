import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const rootDirectory = resolve(import.meta.dirname, '..');
const rootPackagePath = resolve(rootDirectory, 'package.json');
const packagePaths = [
  rootPackagePath,
  resolve(rootDirectory, 'apps/client/package.json'),
  resolve(rootDirectory, 'apps/desktop/package.json'),
  resolve(rootDirectory, 'apps/host/package.json'),
  resolve(rootDirectory, 'apps/mcp-server/package.json'),
  resolve(rootDirectory, 'packages/lan-discovery/package.json'),
  resolve(rootDirectory, 'packages/poker-core/package.json'),
  resolve(rootDirectory, 'packages/protocol/package.json'),
  resolve(rootDirectory, 'packages/test-support/package.json'),
  resolve(rootDirectory, 'packages/ui/package.json'),
];
const hostVersionPath = resolve(rootDirectory, 'apps/host/src/app-version.ts');
const mcpVersionPath = resolve(
  rootDirectory,
  'apps/mcp-server/src/app-version.ts',
);
const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function assertVersion(version) {
  if (!semverPattern.test(version)) {
    throw new Error(`版本号必须是有效的 SemVer：${version}`);
  }
}

async function expectedVersion() {
  const rootPackage = await readJson(rootPackagePath);
  assertVersion(rootPackage.version);
  return rootPackage.version;
}

async function synchronize(version) {
  await Promise.all(
    packagePaths.slice(1).map(async (path) => {
      const packageJson = await readJson(path);
      if (packageJson.version === version) return;
      packageJson.version = version;
      await writeFile(path, `${JSON.stringify(packageJson, null, 2)}\n`);
    }),
  );
  await writeFile(
    hostVersionPath,
    `export const APP_VERSION = '${version}' as const;\n`,
  );
  await writeFile(
    mcpVersionPath,
    `export const APP_VERSION = '${version}' as const;\n`,
  );
}

async function check(version) {
  const mismatches = [];
  for (const path of packagePaths.slice(1)) {
    const packageJson = await readJson(path);
    if (packageJson.version !== version) mismatches.push(path);
  }
  const expectedHostSource = `export const APP_VERSION = '${version}' as const;\n`;
  if ((await readFile(hostVersionPath, 'utf8')) !== expectedHostSource) {
    mismatches.push(hostVersionPath);
  }
  if ((await readFile(mcpVersionPath, 'utf8')) !== expectedHostSource) {
    mismatches.push(mcpVersionPath);
  }
  if (mismatches.length) {
    throw new Error(
      `版本未同步至 ${version}：\n${mismatches.join('\n')}\n运行 pnpm version:sync 修复。`,
    );
  }
}

const [command, value] = globalThis.process.argv.slice(2);
if (command === '--set') {
  assertVersion(value ?? '');
  const rootPackage = await readJson(rootPackagePath);
  rootPackage.version = value;
  await writeFile(rootPackagePath, `${JSON.stringify(rootPackage, null, 2)}\n`);
  await synchronize(value);
  globalThis.console.log(`已将源码版本更新为 ${value}`);
} else {
  const version = await expectedVersion();
  if (command === '--sync') {
    await synchronize(version);
    globalThis.console.log(`已同步源码版本 ${version}`);
  } else if (command === '--check') {
    await check(version);
    globalThis.console.log(`源码版本一致：${version}`);
  } else {
    throw new Error(
      '用法：pnpm version:check | pnpm version:sync | pnpm version:set <版本号>',
    );
  }
}
