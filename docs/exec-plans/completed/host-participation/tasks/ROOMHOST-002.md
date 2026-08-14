# ROOMHOST-002 — 房间领域与首局门禁

## 规范来源

- [房间体验规格](../../../../product-specs/room-experience.md)
- [房间领域设计](../../../../design-docs/room-domain.md)
- [系统不变量](../../../../../INVARIANTS.md)

## 相关不变量

INV-AUTH-001
INV-ROOM-003
INV-ROOM-004
INV-POT-001

## 允许范围

- 允许：`apps/host/src/domain/room.ts`、`room-control.ts`、`lobby-ready.ts`、`start-first-hand.ts`、`seat-management.ts`、`player-status.ts`、`update-room-settings.ts`、`join-room.ts`、`apps/host/src/domain/*.test.ts` 中与本任务直接相关的测试。
- 允许：为表达 Host 身份和房主参与模式新增的 `apps/host/src/domain/**` 纯领域类型或辅助函数。
- 禁止：`packages/poker-core`、`packages/protocol`、`apps/host/src/application`、SQLite、Socket.IO、Electron、React 和中心服务器。

## 完成条件

- `RoomState` 能表达 `参与游戏` 与 `仅提供服务`，并拥有独立 Host 身份；实际玩家集合不包含服务型房主。
- `参与游戏` 模式保留房主默认准备和关联房主玩家行为；`仅提供服务` 模式没有房主玩家、座位、筹码和准备状态。
- 两种模式的最大人数、最少人数、座位交换、随机座位和首局开始条件均只针对实际玩家计算。
- 房主管理命令在领域层通过 Host 身份授权；Player 身份不能获得房主管理权限。
- 既有玩家退出、掉线、恢复、筹码转移、统计输入和连续牌局行为不因房主模式变化而改变。

## 验证命令

- `pnpm --filter @texas-holdem/host exec vitest run src/domain/room.test.ts src/domain/lobby-ready.test.ts src/domain/start-first-hand.test.ts src/domain/seat-management.test.ts src/domain/player-status.test.ts src/domain/room-control.test.ts`
- `pnpm check`

## 文档影响

- 无新增规范；实现必须遵循 ROOMHOST-001 已同步的产品、设计、ADR 和不变量。
- 证据：在完成后由 ROOMHOST-006 回填本计划的逐任务验证证据。
