# LATEJOIN-001 — 同步加入后等待下一局的产品契约

## 规范来源

- [产品规格地图](../../../../product-specs/index.md)
- [玩法规格](../../../../product-specs/gameplay.md)
- [房间体验规格](../../../../product-specs/room-experience.md)
- [牌局生命周期设计](../../../../design-docs/hand-lifecycle.md)
- [房间领域设计](../../../../design-docs/room-domain.md)
- [协议与同步设计](../../../../design-docs/protocol-and-sync.md)
- [客户端设计](../../../../design-docs/client.md)
- [系统不变量](../../../../../INVARIANTS.md)

## 相关不变量

- INV-AUTH-001
- INV-HAND-001
- INV-ROOM-001
- INV-ROOM-002
- INV-PERSIST-001

## 允许范围

- 允许：`docs/product-specs/gameplay.md`、`docs/product-specs/room-experience.md`、`docs/design-docs/hand-lifecycle.md`、`docs/design-docs/room-domain.md`、`docs/design-docs/protocol-and-sync.md`、`docs/design-docs/client.md`、`docs/decisions/index.md`、`docs/decisions/ADR-010-late-join-next-hand.md` 以及本计划目录。
- 禁止：本任务直接修改 Host、客户端、协议 schema、`poker-core`、SQLite migration 或测试实现；代码变更留给后续任务。

## 完成条件

- 产品规格明确：首局开始后，新 Player 可在未关闭房间加入，初始状态为等待，不进入当前已创建牌局。
- 产品规格明确：加入 `hand-ready` 时新玩家进入本次准备上下文但默认 `pending`；必须主动选择“已就绪”，并继续遵守筹码、待处理请求和至少两名参赛者条件。
- 设计文档明确：当前 `StartedHandState`、底牌、投入、行动顺序、底池和结算不因新玩家加入而改变；新玩家只在下一局创建时进入参与者集合。
- 文档明确：已有玩家的恢复令牌、座位、筹码、历史、主动退出、掉线和移除语义不变；关闭房间仍拒绝新加入。
- ADR 记录该决策取代原“首局开始后不接受新参赛玩家”的产品约束，但不扩展为当前手中途入局或独立观战者角色。

## 验证命令

- `pnpm harness:check`
- `pnpm harness:test`
- `pnpm check`

## 文档影响

产品规格、设计、ADR、执行计划和验收证据；不新增或修改不变量语义。
