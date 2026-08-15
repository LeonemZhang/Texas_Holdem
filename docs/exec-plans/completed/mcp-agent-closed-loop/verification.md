# MCP Agent 双端持久化闭环验收证据

## MCPLOOP-001

### 覆盖不变量

- INV-AUTH-001
- INV-HAND-001
- INV-ROOM-001
- INV-PERSIST-001

### 自动化验证

- `pnpm --filter @texas-holdem/mcp-server test`：通过；4 个测试文件、48 个测试全部通过，普通单测配置明确排除真实进程闭环文件。
- `pnpm --filter @texas-holdem/mcp-server test:closed-loop`：通过；先完成 Host 依赖和 MCP 生产构建，再运行 1 个真实双端重启场景，测试阶段约 11.8 秒。
- `pnpm --filter @texas-holdem/mcp-server typecheck`：通过。
- `pnpm --filter @texas-holdem/mcp-server build`：通过。
- MCP 目标文件 `prettier --check` 与 `eslint`：通过。
- `pnpm harness:check`：通过；计划结构、链接和状态符合仓库契约。
- `pnpm check`：Harness check 与 Harness test（26 个测试）通过，随后在全仓格式检查处被 6 个既有非本任务文件阻断：`.codex/better-harness/review-2026-08-13/{findings.json,report.html,report.md}`
- 单独续跑 `pnpm lint`：MCP 目标文件 lint 通过。单独续跑 `pnpm typecheck`：9 个 workspace 全部通过。

### 场景

- 测试在临时目录启动生产构建的 Host，房主测试端通过真实 HTTP 创建两人房间并通过 Socket.IO 连接。
- 独立 stdio MCP Server 进程代表 Agent；Agent 只调用 MCP 工具完成连接、大厅准备、观察、等待、行动和局间准备。
- 双方连续完成三手牌，每手优先 check/call，均断言出现 preflop、flop、turn、river 后进入结算与 hand-ready。
- 第一手结束后关闭原 Host 与 MCP 进程；新 Host 使用同一数据目录，经正式 `room-record.recover` 管理入口恢复原房主和 `hand-ready` 状态，新 MCP 进程从临时 JSON 文件读取恢复令牌并恢复原 Agent，随后继续完成第二、第三手。
- 对局结束后停止 Host，以只读方式打开 SQLite，确认房间为可恢复的 `hand-ready`、`normal_closed = 0`，两名玩家与两份重连身份存在，三条手牌摘要和多份权威快照已落盘，双方筹码总和仍为 2000。

### 执行方式

在 Windows PowerShell、Node.js v24.14.0、pnpm 10.0.0 环境中执行。测试动态申请本机 TCP/UDP 端口，只访问 `127.0.0.1`，不调用外部模型或网络服务；临时数据库和 Agent 恢复文件在场景结束后清理。

### 覆盖状态

MCPLOOP-001 的真实双端对局、完整四街、连续三手、Host 与 Agent 双进程重启、双方同身份恢复和 Host SQLite 落盘验收全部完成。`INV-HAND-001` 原有的单一 Host 运行时连续牌局缺口已由本测试补齐。全仓 `pnpm check` 的剩余失败只来自任务开始前已存在且明确不在本任务范围内的 `.codex/` 与 Android spike 文件，未修改或纳入本任务。

### 证据

- 闭环实现与断言：[closed-loop.e2e.test.ts](../../../../apps/mcp-server/src/__tests__/closed-loop.e2e.test.ts)
- Host 管理 IPC 测试适配：[host-parent-port-shim.mjs](../../../../apps/mcp-server/src/__tests__/fixtures/host-parent-port-shim.mjs)
- 独立测试入口：[vitest.closed-loop.config.ts](../../../../apps/mcp-server/vitest.closed-loop.config.ts)、[package.json](../../../../apps/mcp-server/package.json)
- MCP 状态摘要：[mcp-server.ts](../../../../apps/mcp-server/src/mcp-server.ts)、[单元测试](../../../../apps/mcp-server/src/__tests__/mcp-server.test.ts)
- 边界说明：[MCP 适配器设计](../../../design-docs/mcp.md)、[MCP README](../../../../apps/mcp-server/README.md)
- 不变量证据：[INV-HAND-001](../../../../INVARIANTS.md#inv-hand-001--牌局状态按顺序转换)
