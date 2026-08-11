import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('framework documentation', () => {
  it('keeps the repository harness entrypoints available', async () => {
    await expect(access(resolve('AGENTS.md'))).resolves.toBeUndefined();
    await expect(access(resolve('INVARIANTS.md'))).resolves.toBeUndefined();
    await expect(access(resolve('ARCHITECTURE.md'))).resolves.toBeUndefined();
    await expect(
      access(resolve('docs/product-specs/index.md')),
    ).resolves.toBeUndefined();
    await expect(
      access(resolve('docs/design-docs/index.md')),
    ).resolves.toBeUndefined();
    await expect(
      access(resolve('docs/decisions/index.md')),
    ).resolves.toBeUndefined();
    await expect(
      access(resolve('docs/exec-plans/completed/luna/plan.md')),
    ).resolves.toBeUndefined();
    await expect(
      access(resolve('docs/exec-plans/completed/luna/verification.md')),
    ).resolves.toBeUndefined();
    await expect(
      access(resolve('docs/exec-plans/completed/terra/plan.md')),
    ).resolves.toBeUndefined();
    await expect(
      access(resolve('docs/exec-plans/completed/terra/verification.md')),
    ).resolves.toBeUndefined();
    await expect(
      access(resolve('.agents/skills/poker-rule-change/SKILL.md')),
    ).resolves.toBeUndefined();
    await expect(
      access(resolve('scripts/check-repository-harness.mjs')),
    ).resolves.toBeUndefined();
    await expect(
      access(resolve('docs/exec-plans/active/README.md')),
    ).resolves.toBeUndefined();
    await expect(
      access(resolve('docs/exec-plans/template/plan.md')),
    ).resolves.toBeUndefined();
    await expect(
      access(resolve('docs/exec-plans/template/verification.md')),
    ).resolves.toBeUndefined();
  });
});
