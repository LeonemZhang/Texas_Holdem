# RUNO-003 — 产品、设计、协议说明与不变量同步

## 规范来源

- [产品规格地图](../../../../product-specs/index.md)
- [玩法产品规格](../../../../product-specs/gameplay.md)
- [牌局生命周期设计](../../../../design-docs/hand-lifecycle.md)
- [协议与同步设计](../../../../design-docs/protocol-and-sync.md)
- [系统不变量](../../../../../INVARIANTS.md)

## 相关不变量

- INV-BET-003
- INV-HAND-001
- INV-AUTH-002

## 允许范围

- 允许：`docs/product-specs/gameplay.md`、`docs/design-docs/hand-lifecycle.md`、`docs/design-docs/protocol-and-sync.md`、`INVARIANTS.md` 中与自动 Runout 直接相关的 hunk。
- 禁止：修改其他产品规格、ADR、Android/MCP 或客户端重连文档。
- 禁止：修改 `packages/protocol`、`packages/poker-core`、`apps/host`、客户端或桌面代码，也不新增 ADR。

## 完成条件

- 产品规格明确：下注轮关闭、至少两名仍有资格的竞争者且无人可继续行动后，服务端按 `2s` 发翻牌、`2s` 发转牌、`2s` 发河牌、河牌后 `1s` 结算；正常河牌结束和弃牌提前结束仍立即处理。
- 牌局生命周期设计说明每次只推进一个街道、服务端计时、每步快照发布与持久化，以及暂停、关闭、恢复和销毁时的计时器行为。
- 协议与同步设计说明协议字段和版本不变，客户端只消费服务端逐街发布的中间快照，不自行推断或延迟牌面。
- 更新 `INV-BET-003` 和 `INV-HAND-001` 的缺口、跟进和证据；只有 Host 运行时测试补齐真实缺口后才允许将覆盖状态提升为 `complete`。

## 验证命令

- `pnpm harness:check`
- `pnpm harness:test`
- `pnpm check`

## 文档影响

- 产品规格、设计、不变量、执行计划：在本任务完成后同步上述文档，并在当前计划的 `verification.md` 记录结构化证据。
