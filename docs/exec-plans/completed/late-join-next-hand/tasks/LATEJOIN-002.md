# LATEJOIN-002 — Host 权威加入与下一局资格

## 规范来源

- [玩法规格](../../../../product-specs/gameplay.md)
- [房间体验规格](../../../../product-specs/room-experience.md)
- [牌局生命周期设计](../../../../design-docs/hand-lifecycle.md)
- [房间领域设计](../../../../design-docs/room-domain.md)
- [协议与同步设计](../../../../design-docs/protocol-and-sync.md)
- [系统不变量](../../../../../INVARIANTS.md)

## 相关不变量

- INV-AUTH-001
- INV-HAND-001
- INV-PROTO-001
- INV-ROOM-001
- INV-ROOM-002
- INV-PERSIST-001

## 允许范围

- 允许：`apps/host/src/domain/join-room.ts`、`apps/host/src/domain/hand-ready.ts`、`apps/host/src/domain/hand-ready-actions.ts`、`apps/host/src/application/game-runtime.ts`、`apps/host/src/application/room-command-handler.ts` 及其 targeted tests；必要时可修改同一 Host 加入/快照/服务器测试的最小 hunk。
- 禁止：`packages/poker-core` 牌局算法、当前手参与者追加、下注/底池/结算规则、Android Host、中心服务器、无必要的协议 schema 版本变更和 SQLite migration。

## 完成条件

- `playing`、`hand-ready` 和 `paused` 阶段允许新的 Player session 加入；`closed`、满座、重复 player/nickname 和无可用座位仍拒绝。
- 新加入者获得独立 `playerId`、恢复令牌、座位和初始筹码，房间玩家状态为等待；加入不会改写当前 `StartedHandState`、底牌、投入、行动者、倒计时、底池或结算。
- 在 `hand-ready` 中加入的新玩家进入准备上下文且默认为 `pending`，不能通过加入命令自动变为 `ready`；只有显式就绪并满足现有资格才可进入下一手。
- 下一手创建时只从权威准备状态选取参赛者；未就绪、暂离、筹码不足、离开、移除或出局者不进入该手。
- 加入命令继续通过现有 `expectedVersion`、幂等、持久化确认和 Player 身份认证路径，不影响旧玩家恢复。

## 验证命令

- `pnpm --filter @texas-holdem/host test`
- `pnpm --filter @texas-holdem/host typecheck`
- 必要的 Host targeted server、runtime、join-room、hand-ready、start-next-hand 和 snapshot tests。
- `pnpm check`

## 文档影响

无新增产品语义；按 `LATEJOIN-001` 已同步的产品规格、设计和 ADR 实现，并在本计划 verification 中记录证据。
