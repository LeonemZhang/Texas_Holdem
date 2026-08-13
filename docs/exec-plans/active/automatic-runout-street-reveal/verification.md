# 自动 Runout 逐街展示验收证据

任务转为 `done` 前，为该任务添加同名二级标题并填写所有字段；没有适用不变量时在“覆盖不变量”写明“无”。

## RUNO-001

### 覆盖不变量

- INV-BET-003、INV-HAND-001；本任务只补核心层单街边界，Host 编排缺口留待 RUNO-002。

### 自动化验证

- `pnpm --filter @texas-holdem/poker-core test`：32 个测试文件、219 个测试通过。
- `pnpm check`：在 RUNO-003 文档同步完成后统一运行。

### 场景

自动 Runout 从 preflop 依次推进到 flop、turn、river；非自动下注轮和原有一次性核心兼容逻辑保持通过。

### 执行方式

在本 worktree 通过 Vitest 运行 `packages/poker-core` workspace targeted suite。

### 覆盖状态

已完成；新增 API 校验下注轮关闭、至少两名竞争者、无两个有筹码竞争者，并且每次只处理一个街道。

### 证据

[核心单街推进实现](../../../../packages/poker-core/src/hand/streets.ts) 与[逐街及拒绝条件测试](../../../../packages/poker-core/src/hand/turn-river.test.ts)。

## RUNO-002

### 覆盖不变量

- INV-BET-003、INV-HAND-001、INV-AUTH-002；客户端、协议 schema 和重连边界未改动。

### 自动化验证

- `pnpm --filter @texas-holdem/host test`：44 个测试文件、199 个测试通过。
- `pnpm check`：在 RUNO-003 文档同步完成后统一运行。

### 场景

fake timers 覆盖 `2s/2s/2s/1s`、每个中间街道快照与持久化、另有合法响应时不启动 Runout、恢复不重放，以及暂停、关闭、销毁清理。

### 执行方式

在本 worktree 通过 Vitest 运行 `apps/host` workspace targeted suite；快照通过 Host 的 `snapshotsForRoom()` / 专属 `snapshot()` 投影观察，提交通过 `onStateCommitted()` 导出状态观察。

### 覆盖状态

已完成；Host 建立单一 Runout timer，按当前权威街道继续，递增 sequence/stateVersion，并在河牌后独立等待 1 秒再结算。

### 证据

[Host 计时实现](../../../../apps/host/src/application/game-runtime.ts)、[单街解析](../../../../apps/host/src/application/game-command-handler.ts)以及[时间链、响应门控、恢复和生命周期测试](../../../../apps/host/src/application/game-runtime.test.ts)。

## RUNO-003

### 覆盖不变量

- INV-BET-003、INV-HAND-001、INV-AUTH-002。

### 自动化验证

- `pnpm --filter @texas-holdem/poker-core test`：32 个测试文件、219 个测试通过。
- `pnpm --filter @texas-holdem/host test`：44 个测试文件、199 个测试通过。
- `pnpm harness:test`：26 个测试通过。
- `pnpm lint`：通过。
- `pnpm typecheck`：所有 workspace 通过。
- `pnpm harness:check`：通过。
- `pnpm check`：通过（Harness、harness:test、format、lint、typecheck 全部通过）。

### 场景

产品规格、牌局生命周期设计和协议同步设计现已明确服务端逐街权威快照、`2s/2s/2s/1s` 节奏、暂停/关闭/恢复/销毁行为，以及协议字段与版本不变；`INV-BET-003` 和 `INV-HAND-001` 的 Host 缺口已由运行时测试覆盖。

### 执行方式

在本 worktree 读取规范与不变量，使用 targeted Vitest、Harness 测试、Prettier 检查、ESLint 和 TypeScript workspace typecheck；未修改客户端、协议 schema、Android/MCP 或客户端重连实现。

### 覆盖状态

本计划允许的 RUNO-003 文档 hunk 已完成并与实现一致；全仓 `pnpm check` 通过。

### 证据

[玩法规格](../../../product-specs/gameplay.md)、[牌局生命周期设计](../../../design-docs/hand-lifecycle.md)、[协议与同步设计](../../../design-docs/protocol-and-sync.md)、[系统不变量](../../../../INVARIANTS.md)以及[本计划的结构化验证记录](verification.md)。
