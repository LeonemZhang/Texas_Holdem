# RUNO-001 — 核心层单街 Runout 推进

## 规范来源

- [产品规格地图](../../../../product-specs/index.md)
- [牌局生命周期设计](../../../../design-docs/hand-lifecycle.md)
- [系统不变量](../../../../../INVARIANTS.md)

## 相关不变量

- INV-BET-003
- INV-HAND-001

## 允许范围

- 允许：`packages/poker-core/src/hand/streets.ts`、受该接口影响的 `packages/poker-core/src/hand/` 测试文件，以及为单街推进新增的必要测试。
- 禁止：`apps/host`、`packages/protocol`、`apps/client`、`apps/desktop`、持久化实现、协议 schema 或 UI。
- 禁止：在核心层引入计时器、快照、结算调度或 Host 房间状态。

## 完成条件

- 新增 `advanceRunoutStreet()`，只推进当前有效牌局的一个尚未公开的街道：`PREFLOP` 到 `FLOP`、`FLOP` 到 `TURN`、`TURN` 到 `RIVER`。
- 该方法不处理河牌、摊牌、结算或 Host 计时，也不一次补齐到河牌。
- 现有 `advanceAfterCompletedBetting()` 对正常下注轮、弃牌提前结束和正常河牌结算的行为保持不变。
- 未关闭下注轮或当前没有合法自动 Runout 条件时不能推进；底池分层、未匹配贡献退回和派彩逻辑不因单街推进改变。
- 翻牌公开三张、转牌公开一张、河牌公开一张，且不产生重复牌。

## 验证命令

- `pnpm --filter @texas-holdem/poker-core test`
- `pnpm check`

## 文档影响

- 设计：由 `RUNO-003` 同步牌局生命周期设计；本任务不提前改写产品规格或不变量证据。
