# MCPLOOP-001 — Host 与 MCP Agent 自闭环

## 规范来源

- [玩法规格](../../../../product-specs/gameplay.md)
- [房间体验](../../../../product-specs/room-experience.md)
- [MCP 适配器设计](../../../../design-docs/mcp.md)
- [系统不变量](../../../../../INVARIANTS.md)

## 相关不变量

- INV-AUTH-001
- INV-HAND-001
- INV-ROOM-001
- INV-PERSIST-001

## 允许范围

- 允许：`apps/mcp-server/**`、`docs/design-docs/mcp.md`、`INVARIANTS.md` 中 `INV-HAND-001` 的覆盖状态与证据、本执行计划及其验证证据；必要时仅同步 workspace/lockfile 中 MCP workspace 的配置。
- 禁止：修改 `apps/host` 生产逻辑、`packages/poker-core` 扑克语义、协议版本、桌面/Android UI、调用 AI 模型、提交或推送 Git。

## 完成条件

- 测试必须启动生产构建的 Host 子进程和独立 stdio MCP Server 子进程，通过真实 HTTP、Socket.IO 和 MCP 工具完成对战，不以内存 mock 代替进程边界。
- 房主与 Agent 连续完成三手牌；每手均实际经过 preflop、flop、turn、river 和结算，再由双方 hand-ready 进入下一手。
- 第一手结束后终止 Host 与 MCP Agent 进程；新 Host 必须从同一 SQLite 经正式管理入口恢复房间，新 Agent 必须读取落盘恢复令牌，双方以原 `roomId`、`playerId` 继续剩余对局。
- Host 停止后直接读取 SQLite，断言房间、两名玩家、三条手牌摘要、权威快照和两份重连身份均已持久化，且双方筹码总和守恒。
- MCP 仍只充当玩家适配层；AI 决策与房间生命周期继续由外部 Agent 和 Host 各自负责。

## 验证命令

- `pnpm --filter @texas-holdem/mcp-server test`
- `pnpm --filter @texas-holdem/mcp-server test:closed-loop`
- `pnpm --filter @texas-holdem/mcp-server typecheck`
- `pnpm --filter @texas-holdem/mcp-server build`
- `pnpm check`

## 文档影响

- 设计：更新 `docs/design-docs/mcp.md` 的状态摘要、闭环边界和目录结构。
- 执行计划、证据：新增本计划、任务详情和逐任务验收证据。
- 不变量：语义不变；闭环测试填补 `INV-HAND-001` 已记录的 Host 连续牌局运行时缺口，因此将其覆盖状态和证据同步为 complete。
- 产品规格、ADR：不改变现有产品语义或架构决策，无需修改。
