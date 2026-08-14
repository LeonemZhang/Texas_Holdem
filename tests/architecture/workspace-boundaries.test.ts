import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const checkerPath = resolve('scripts/check-workspace-boundaries.mjs');
const temporaryDirectories: string[] = [];

async function writeFixtureFile(
  root: string,
  path: string,
  source: string,
): Promise<void> {
  const filePath = join(root, path);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, source, 'utf8');
}

async function createFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'texas-boundaries-'));
  temporaryDirectories.push(root);
  return root;
}

async function runChecker(
  root: string,
): Promise<{ readonly ok: boolean; readonly output: string }> {
  try {
    const result = await execFileAsync(
      process.execPath,
      [checkerPath, '--root', root],
      {
        cwd: resolve('.'),
        encoding: 'utf8',
      },
    );
    return { ok: true, output: `${result.stdout}${result.stderr}` };
  } catch (error) {
    const result = error as { stdout?: string; stderr?: string };
    return {
      ok: false,
      output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    };
  }
}

afterAll(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('workspace boundary architecture gate', () => {
  it('accepts the current workspace and reports an explicit success message', async () => {
    const result = await runChecker(resolve('.'));

    expect(result.ok).toBe(true);
    expect(result.output).toContain('架构边界检查通过');
    expect(result.output).toContain('未发现违规 import');
  });

  it('rejects a shared package importing an app through a type-only import', async () => {
    const root = await createFixture();
    await writeFixtureFile(
      root,
      'packages/shared/src/index.ts',
      "import type { Host } from '../../../apps/host/src/index.js';\n",
    );
    await writeFixtureFile(
      root,
      'apps/host/src/index.ts',
      'export type Host = unknown;\n',
    );

    const result = await runChecker(root);

    expect(result.ok).toBe(false);
    expect(result.output).toContain('packages/shared/src/index.ts:1:');
    expect(result.output).toContain('共享包禁止反向导入应用层');
    expect(result.output).toContain('../../../apps/host/src/index.js');
  });

  it('rejects poker-core imports of forbidden runtime boundaries, including type imports', async () => {
    const root = await createFixture();
    await writeFixtureFile(
      root,
      'packages/poker-core/src/index.ts',
      "import type { ReactNode } from 'react';\nimport { randomUUID } from 'node:crypto';\n",
    );

    const result = await runChecker(root);

    expect(result.ok).toBe(false);
    expect(result.output).toContain('packages/poker-core/src/index.ts:1:');
    expect(result.output).toContain('poker-core 禁止导入UI模块：react');
    expect(result.output).toContain('packages/poker-core/src/index.ts:2:');
    expect(result.output).toContain(
      'poker-core 禁止导入全局随机源模块：node:crypto',
    );
  });

  it('rejects poker-core use of global time and random sources', async () => {
    const root = await createFixture();
    await writeFixtureFile(
      root,
      'packages/poker-core/src/index.ts',
      'export const now = Date.now();\nexport const random = Math.random();\n',
    );

    const result = await runChecker(root);

    expect(result.ok).toBe(false);
    expect(result.output).toContain('poker-core 禁止使用系统时间：Date.now');
    expect(result.output).toContain(
      'poker-core 禁止使用全局随机源：Math.random',
    );
  });
});
