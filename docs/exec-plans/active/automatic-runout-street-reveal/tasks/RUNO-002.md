# RUNO-002 — Host 权威逐街 Runout 调度

## 规范来源

- [产品规格地图](../../../../product-specs/index.md)
- [牌局生命周期设计](../../../../design-docs/hand-lifecycle.md)
- [协议与同步设计](../../../../design-docs/protocol-and-sync.md)
- [系统不变量](../../../../../INVARIANTS.md)

## 相关不变量

- INV-BET-003
- INV-HAND-001
- INV-AUTH-002

## 允许范围

- 允许：`apps/host/src/application/game-command-handler.ts`、`apps/host/src/application/game-runtime.ts`、对应的 Host 测试文件，以及为计时、恢复和快照顺序新增的必要测试。
- 禁止：`packages/poker-core`、`packages/protocol`、`apps/client`、`apps/desktop`、协议 schema 或前端展示逻辑。
- 禁止：在客户端增加计时器、街道推断或结算延迟。

## 完成条件

- 下注轮关闭且满足自动 Runout 条件时，Host 不直接结算，而是建立独立的 Runout 计时链。
- 从当前街道到下一街道等待 `2s`；翻牌、转牌、河牌均通过服务端核心推进一街后发布和持久化权威快照。河牌公开后等待 `2s` 再进入摊牌结算。
- 每次推进都递增 `stateVersion` 和事件 `sequence`，并向每个玩家发布过滤后的专属快照；协议字段和 `PROTOCOL_VERSION` 不变。
- 正常河牌下注轮结束、弃牌提前结束等非自动 Runout 路径仍按现有语义立即处理。
- 暂停、关闭、销毁会清理对应 Runout 计时器；恢复后从已持久化的当前权威街道继续，不重放已公开街道、不跳过街道、不启动并行计时。
- 使用 fake timers 或确定性 Host 测试证明 `2s/2s/2s/2s` 顺序、每个中间快照和生命周期清理行为。

## 验证命令

- `pnpm --filter @texas-holdem/host test`
- `pnpm check`

## 文档影响

- 设计、不变量、执行计划和证据：由 `RUNO-003` 在 Host 行为验证后同步；本任务不提前改变协议 schema 或前端。
