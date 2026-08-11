import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const checkerPath = resolve('scripts/check-repository-harness.mjs');
const temporaryDirectories: string[] = [];

const requiredMarkdownFiles = [
  'AGENTS.md',
  'ARCHITECTURE.md',
  'docs/product-specs/index.md',
  'docs/product-specs/gameplay.md',
  'docs/product-specs/room-experience.md',
  'docs/product-specs/statistics.md',
  'docs/product-specs/desktop-experience.md',
  'docs/design-docs/index.md',
  'docs/design-docs/poker-domain.md',
  'docs/design-docs/hand-lifecycle.md',
  'docs/design-docs/room-domain.md',
  'docs/design-docs/protocol-and-sync.md',
  'docs/design-docs/network-and-discovery.md',
  'docs/design-docs/persistence-and-recovery.md',
  'docs/design-docs/client.md',
  'docs/design-docs/desktop.md',
  'docs/decisions/index.md',
  'docs/exec-plans/active/README.md',
  'docs/exec-plans/template/plan.md',
  'docs/exec-plans/template/verification.md',
  'docs/exec-plans/template/tasks/CHANGE-001.md',
] as const;

const validInvariant = `# 系统不变量

## INV-TEST — 测试边界

### INV-TEST-001 — 示例不变量

示例性质。

完整行为规范：[仓库规则](AGENTS.md)

执行方式：test
覆盖状态：complete
证据：[仓库规则](AGENTS.md)
`;

const validTaskDetail = `# CHANGE-001 — 示例任务

## 规范来源

- [仓库规则](../../../../../AGENTS.md)

## 相关不变量

- INV-TEST-001

## 允许范围

- 允许：只修改测试夹具。
- 禁止：修改夹具目录以外的文件。

## 完成条件

- Harness 接受有效契约。

## 验证命令

- 运行 Harness。

## 文档影响

- 执行计划。
`;

const validVerificationEntry = `# 示例验收证据

## CHANGE-001

### 覆盖不变量

- INV-TEST-001

### 自动化验证

- Harness 已运行。

### 场景

- 测试夹具。

### 执行方式

- Node.js 子进程。

### 覆盖状态

- complete

### 证据

- [仓库规则](../../../../AGENTS.md)
`;

interface PlanTask {
  readonly depends?: string;
  readonly detail?: string;
  readonly id: string;
  readonly status: string;
}

interface PlanOptions {
  readonly archiveReason?: string;
  readonly includeStatusSeparator?: boolean;
  readonly indexed?: boolean;
  readonly lifecycle?: string | null;
  readonly state?: 'active' | 'completed';
  readonly tasks?: readonly PlanTask[];
  readonly verification?: string;
}

async function writeFixtureFile(
  root: string,
  path: string,
  content: string,
): Promise<void> {
  const absolutePath = join(root, path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, 'utf8');
}

async function createFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'texas-harness-'));
  temporaryDirectories.push(root);

  for (const path of requiredMarkdownFiles) {
    await writeFixtureFile(root, path, `# ${path}\n`);
  }
  await writeFixtureFile(root, 'INVARIANTS.md', validInvariant);
  await writeFixtureFile(
    root,
    'docs/exec-plans/index.md',
    '# 执行计划地图\n\n## 进行中\n\n当前没有。\n\n## 已完成\n\n当前没有。\n',
  );
  await writeFixtureFile(
    root,
    '.agents/skills/poker-rule-change/SKILL.md',
    `---
name: poker-rule-change
description: >-
  Use when testing the repository harness.
metadata:
  owner: harness
---

# Test skill
`,
  );
  await mkdir(join(root, 'docs/exec-plans/completed'), { recursive: true });
  return root;
}

async function addPlan(root: string, options: PlanOptions = {}): Promise<void> {
  const state = options.state ?? 'active';
  const lifecycle =
    options.lifecycle === undefined ? 'normal' : options.lifecycle;
  const tasks = options.tasks ?? [
    { depends: '-', id: 'CHANGE-001', status: 'pending' },
  ];
  const metadata = [
    lifecycle === null ? null : `> 生命周期：${lifecycle}`,
    options.archiveReason ? `> 归档说明：${options.archiveReason}` : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
  const rows = tasks
    .map(
      (task) =>
        `| ${task.id} | ${task.status} | ${task.depends ?? '-'} | Harness | 契约通过 | ${task.detail ?? `[详情](tasks/${task.id}.md)`} |`,
    )
    .join('\n');
  const statusSeparator =
    options.includeStatusSeparator === false
      ? ''
      : '| --- | --- | --- | --- | --- | --- |\n';
  const planDirectory = `docs/exec-plans/${state}/sample`;

  await writeFixtureFile(
    root,
    `${planDirectory}/plan.md`,
    `# 示例计划

${metadata}

| ID | Status | Depends | Affected | Acceptance | Detail |
${statusSeparator}${rows}
`,
  );
  for (const task of tasks) {
    if (task.detail === '-') continue;
    await writeFixtureFile(
      root,
      `${planDirectory}/tasks/${task.id}.md`,
      validTaskDetail.replaceAll('CHANGE-001', task.id),
    );
  }
  await writeFixtureFile(
    root,
    `${planDirectory}/verification.md`,
    options.verification ?? '# 示例验收证据\n',
  );
  if (options.indexed !== false) {
    const activeEntry =
      state === 'active' ? '- [sample](active/sample/plan.md)' : '当前没有。';
    const completedEntry =
      state === 'completed'
        ? '- [sample](completed/sample/plan.md)'
        : '当前没有。';
    await writeFixtureFile(
      root,
      'docs/exec-plans/index.md',
      `# 执行计划地图

## 进行中

${activeEntry}

## 已完成

${completedEntry}
`,
    );
  }
}

function runHarness(root: string): Promise<{
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
}> {
  return new Promise((complete) => {
    execFile(
      process.execPath,
      [checkerPath, '--root', root],
      { cwd: root, encoding: 'utf8' },
      (error, stdout, stderr) => {
        complete({ ok: error === null, stdout, stderr });
      },
    );
  });
}

afterAll(async () => {
  const directories = temporaryDirectories.splice(0);
  await Promise.all(
    directories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe.concurrent('repository harness contract', () => {
  it('accepts a minimal valid repository contract and extended Skill YAML', async () => {
    const root = await createFixture();

    const result = await runHarness(root);

    expect(result).toMatchObject({
      ok: true,
      stderr: '',
      stdout: expect.stringContaining('Repository harness check passed.'),
    });
  });

  it('accepts a valid active plan with complete task evidence', async () => {
    const root = await createFixture();
    await addPlan(root, {
      tasks: [{ id: 'CHANGE-001', status: 'done' }],
      verification: validVerificationEntry,
    });

    const result = await runHarness(root);

    expect(result.ok).toBe(true);
  });

  it('rejects an active plan that is absent from the plan index', async () => {
    const root = await createFixture();
    await addPlan(root, { indexed: false });

    const result = await runHarness(root);

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain(
      'Plan active/sample is not listed in docs/exec-plans/index.md',
    );
  });

  it('rejects an empty required task-detail section', async () => {
    const root = await createFixture();
    await addPlan(root);
    await writeFixtureFile(
      root,
      'docs/exec-plans/active/sample/tasks/CHANGE-001.md',
      validTaskDetail.replace(
        '## 完成条件\n\n- Harness 接受有效契约。',
        '## 完成条件',
      ),
    );

    const result = await runHarness(root);

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('has empty section 完成条件');
  });

  it('requires both allowed and forbidden task scope entries', async () => {
    const root = await createFixture();
    await addPlan(root);
    await writeFixtureFile(
      root,
      'docs/exec-plans/active/sample/tasks/CHANGE-001.md',
      validTaskDetail.replace('- 禁止：修改夹具目录以外的文件。\n', ''),
    );

    const result = await runHarness(root);

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('允许范围 is missing 禁止： entry');
  });

  it('rejects a partial invariant without gap ownership and follow-up', async () => {
    const root = await createFixture();
    await writeFixtureFile(
      root,
      'INVARIANTS.md',
      validInvariant.replace('覆盖状态：complete', '覆盖状态：partial'),
    );

    const result = await runHarness(root);

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('with status partial is missing 缺口');
    expect(result.stderr).toContain('with status partial is missing 责任边界');
    expect(result.stderr).toContain('with status partial is missing 跟进');
  });

  it('rejects a done active task with incomplete verification evidence', async () => {
    const root = await createFixture();
    await addPlan(root, {
      tasks: [{ id: 'CHANGE-001', status: 'done' }],
      verification: validVerificationEntry.replace(
        '### 证据\n\n- [仓库规则](../../../../AGENTS.md)',
        '### 证据',
      ),
    });

    const result = await runHarness(root);

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('has empty section 证据');
  });

  it('rejects verification evidence hidden in a fenced code block', async () => {
    const root = await createFixture();
    await addPlan(root, {
      tasks: [{ id: 'CHANGE-001', status: 'done' }],
      verification: `# 示例验收证据

\`\`\`markdown
${validVerificationEntry}
\`\`\`
`,
    });

    const result = await runHarness(root);

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain(
      'Done task CHANGE-001 has no verification entry',
    );
  });

  it('rejects verification evidence hidden in an HTML comment', async () => {
    const root = await createFixture();
    await addPlan(root, {
      tasks: [{ id: 'CHANGE-001', status: 'done' }],
      verification: `# 示例验收证据

<!--
${validVerificationEntry}
-->
`,
    });

    const result = await runHarness(root);

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain(
      'Done task CHANGE-001 has no verification entry',
    );
  });

  it('keeps real evidence visible after comment markers inside code nodes', async () => {
    const root = await createFixture();
    await addPlan(root, {
      tasks: [{ id: 'CHANGE-001', status: 'done' }],
      verification: `# 示例验收证据

\`[失效链接](missing-inline.md) <!--\`

\`\`\`html
[失效链接](missing-fence.md)
<!--
\`\`\`

    [失效链接](missing-indented.md)

<!-- [失效链接](missing-comment.md) -->

${validVerificationEntry}
`,
    });

    const result = await runHarness(root);

    expect(result.ok).toBe(true);
  });

  it('rejects malformed task IDs instead of silently dropping rows', async () => {
    const root = await createFixture();
    await addPlan(root, {
      tasks: [
        { id: 'CHANGE-001', status: 'pending' },
        { id: 'change-002', status: 'active' },
      ],
    });

    const result = await runHarness(root);

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('invalid task ID change-002');
  });

  it('rejects a task status table without a Markdown separator row', async () => {
    const root = await createFixture();
    await addPlan(root, {
      includeStatusSeparator: false,
      tasks: [{ id: 'CHANGE-001', status: 'pending' }],
    });

    const result = await runHarness(root);

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain(
      'expected separator row after task status header',
    );
  });

  it('rejects a task status table hidden in indented code', async () => {
    const root = await createFixture();
    await addPlan(root);
    await writeFixtureFile(
      root,
      'docs/exec-plans/active/sample/plan.md',
      `# 示例计划

> 生命周期：normal

    | ID | Status | Depends | Affected | Acceptance | Detail |
    | --- | --- | --- | --- | --- | --- |
    | CHANGE-001 | pending | - | Harness | 契约通过 | [详情](tasks/CHANGE-001.md) |
`,
    );

    const result = await runHarness(root);

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain(
      'must contain exactly one task status table',
    );
  });

  it('rejects an active plan with multiple active tasks', async () => {
    const root = await createFixture();
    await addPlan(root, {
      tasks: [
        { id: 'CHANGE-001', status: 'active' },
        { id: 'CHANGE-002', status: 'active' },
      ],
    });

    const result = await runHarness(root);

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain(
      'Active plan sample has more than one active task',
    );
  });

  it('rejects an active task whose dependency is not done', async () => {
    const root = await createFixture();
    await addPlan(root, {
      tasks: [
        { id: 'CHANGE-001', status: 'pending' },
        { depends: 'CHANGE-001', id: 'CHANGE-002', status: 'active' },
      ],
    });

    const result = await runHarness(root);

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain(
      'Active task CHANGE-002 depends on non-done task CHANGE-001',
    );
  });

  it('rejects cycles among pending task dependencies', async () => {
    const root = await createFixture();
    await addPlan(root, {
      tasks: [
        {
          depends: 'CHANGE-002',
          id: 'CHANGE-001',
          status: 'pending',
        },
        {
          depends: 'CHANGE-001',
          id: 'CHANGE-002',
          status: 'pending',
        },
      ],
    });

    const result = await runHarness(root);

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('Dependency cycle in');
    expect(result.stderr).toContain('CHANGE-001 -> CHANGE-002 -> CHANGE-001');
  });

  it('rejects empty, contradictory, malformed, and duplicate dependencies', async () => {
    const root = await createFixture();
    await addPlan(root, {
      tasks: [
        { depends: '', id: 'CHANGE-001', status: 'pending' },
        { depends: 'external:', id: 'CHANGE-002', status: 'pending' },
        { depends: '-, CHANGE-001', id: 'CHANGE-003', status: 'pending' },
        {
          depends: 'CHANGE-001,,CHANGE-002',
          id: 'CHANGE-004',
          status: 'pending',
        },
        {
          depends: 'CHANGE-001, CHANGE-001',
          id: 'CHANGE-005',
          status: 'pending',
        },
      ],
    });

    const result = await runHarness(root);

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('Invalid Depends for CHANGE-001');
    expect(result.stderr).toContain(
      "must use '-' when there are no dependencies",
    );
    expect(result.stderr).toContain('Invalid Depends for CHANGE-002');
    expect(result.stderr).toContain(
      'external dependency must include a description',
    );
    expect(result.stderr).toContain('Invalid Depends for CHANGE-003');
    expect(result.stderr).toContain(
      "must not combine '-' with other dependencies",
    );
    expect(result.stderr).toContain('Invalid Depends for CHANGE-004');
    expect(result.stderr).toContain(
      'must not contain empty dependency entries',
    );
    expect(result.stderr).toContain('Invalid Depends for CHANGE-005');
    expect(result.stderr).toContain('contains duplicate dependency CHANGE-001');
  });

  it('rejects a missing or unknown plan lifecycle', async () => {
    const missingRoot = await createFixture();
    await addPlan(missingRoot, { lifecycle: null });
    const unknownRoot = await createFixture();
    await addPlan(unknownRoot, { lifecycle: 'unknown' });

    const [missingResult, unknownResult] = await Promise.all([
      runHarness(missingRoot),
      runHarness(unknownRoot),
    ]);

    expect(missingResult.ok).toBe(false);
    expect(missingResult.stderr).toContain('is missing 生命周期 metadata');
    expect(unknownResult.ok).toBe(false);
    expect(unknownResult.stderr).toContain('has invalid lifecycle unknown');
  });

  it('requires structured evidence for done tasks in normal completed plans', async () => {
    const root = await createFixture();
    await addPlan(root, {
      state: 'completed',
      tasks: [{ id: 'CHANGE-001', status: 'done' }],
    });

    const result = await runHarness(root);

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain(
      'Done task CHANGE-001 has no verification entry',
    );
  });

  it('rejects duplicate verification entries for the same done task', async () => {
    const root = await createFixture();
    await addPlan(root, {
      tasks: [{ id: 'CHANGE-001', status: 'done' }],
      verification: `${validVerificationEntry}\n${validVerificationEntry}`,
    });

    const result = await runHarness(root);

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain(
      'Done task CHANGE-001 has duplicate verification entries',
    );
  });

  it('requires task details to survive normal plan archival', async () => {
    const root = await createFixture();
    await addPlan(root, {
      state: 'completed',
      tasks: [{ detail: '-', id: 'CHANGE-001', status: 'done' }],
      verification: validVerificationEntry,
    });

    const result = await runHarness(root);

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain(
      'Normal completed plan task CHANGE-001 must link exactly one task detail file',
    );
  });

  it('accepts a normal completed plan with preserved details and evidence', async () => {
    const root = await createFixture();
    await addPlan(root, {
      state: 'completed',
      tasks: [{ id: 'CHANGE-001', status: 'done' }],
      verification: validVerificationEntry,
    });

    const result = await runHarness(root);

    expect(result.ok).toBe(true);
  });

  it('accepts an explicitly explained legacy completed plan', async () => {
    const root = await createFixture();
    await addPlan(root, {
      archiveReason: '计划完成于结构化证据契约建立之前。',
      lifecycle: 'legacy',
      state: 'completed',
      tasks: [{ id: 'CHANGE-001', status: 'done' }],
      verification: `# 聚合历史证据

## 归档范围

- 工程骨架。

## 历史状态

- 保留现有代码和测试记录。
`,
    });

    const result = await runHarness(root);

    expect(result.ok).toBe(true);
  });

  it('rejects legacy plans without an explanation or with unfinished tasks', async () => {
    const missingReasonRoot = await createFixture();
    await addPlan(missingReasonRoot, {
      lifecycle: 'legacy',
      state: 'completed',
      tasks: [{ id: 'CHANGE-001', status: 'done' }],
    });
    const unfinishedRoot = await createFixture();
    await addPlan(unfinishedRoot, {
      archiveReason: '历史计划。',
      lifecycle: 'legacy',
      state: 'completed',
      tasks: [{ id: 'CHANGE-001', status: 'pending' }],
    });

    const [missingReasonResult, unfinishedResult] = await Promise.all([
      runHarness(missingReasonRoot),
      runHarness(unfinishedRoot),
    ]);

    expect(missingReasonResult.ok).toBe(false);
    expect(missingReasonResult.stderr).toContain('is missing 归档说明');
    expect(unfinishedResult.ok).toBe(false);
    expect(unfinishedResult.stderr).toContain(
      'Completed plan sample has unfinished tasks: CHANGE-001',
    );
  });

  it('rejects duplicate Skill YAML keys', async () => {
    const root = await createFixture();
    await writeFixtureFile(
      root,
      '.agents/skills/poker-rule-change/SKILL.md',
      `---
name: poker-rule-change
description: First description.
description: Duplicate description.
---
`,
    );

    const result = await runHarness(root);

    expect(result.ok).toBe(false);
    expect(result.stderr).toContain('has invalid YAML frontmatter');
  });

  it('uses GitHub heading slugs for Markdown fragments', async () => {
    const root = await createFixture();
    await writeFixtureFile(
      root,
      'docs/product-specs/gameplay.md',
      '# Foo - Bar\n',
    );
    await writeFixtureFile(
      root,
      'docs/product-specs/index.md',
      '# 产品规格\n\n[玩法](gameplay.md#foo---bar)\n',
    );

    const result = await runHarness(root);

    expect(result.ok).toBe(true);
  });
});
