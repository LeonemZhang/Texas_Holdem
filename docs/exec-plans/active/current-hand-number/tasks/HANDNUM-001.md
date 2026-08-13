# HANDNUM-001 - 服务端权威当前局号与客户端显示切换

## 规范来源

- [产品规格地图](../../../../product-specs/index.md)
- [玩法产品规格](../../../../product-specs/gameplay.md)
- [牌局生命周期设计](../../../../design-docs/hand-lifecycle.md)
- [协议与同步设计](../../../../design-docs/protocol-and-sync.md)
- [系统不变量](../../../../../INVARIANTS.md)

## 相关不变量

- INV-AUTH-001
- INV-HAND-001

## 允许范围

- 允许：`packages/protocol/src/player-snapshot.ts`、`packages/protocol/src/player-snapshot.test.ts`；按协议边界核对结论新增 `game.handNumber` 及其 schema 测试，不得仅靠修改 `PROTOCOL_VERSION` 解决问题。
- 允许：`apps/host/src/application/snapshot-projector.ts`、`apps/host/src/application/snapshot-projector.test.ts`、`apps/host/src/application/game-runtime.test.ts`；只增加当前局号权威投影和生命周期断言，不改变发牌或状态机。
- 允许：`apps/client/src/room/GameRoom.tsx`、`apps/client/src/room/GameRoom.test.tsx`；将桌面进度文案和结算视图改为消费同一权威当前局号。
- 允许：`docs/product-specs/gameplay.md`、`docs/design-docs/hand-lifecycle.md`、`docs/design-docs/protocol-and-sync.md`、`INVARIANTS.md` 中仅与本任务相关的证据更新、`docs/exec-plans/active/current-hand-number/verification.md`。
- 禁止：移动或重命名 `apps/host/src/application/game-runtime.ts` 中 `#completedHands` 的递增位置，或改变 `room.completedHands` 的“已完成局数”语义。
- 禁止：修改盲注增长、首局开始、后续局创建、下注轮、Runout、结算、底池、暂停、关闭、SQLite 持久化或恢复状态机。
- 禁止：修改 `apps/client/src/room/HandReadyOverlay.tsx`、`PokerTableLayout` 的布局与文案接口，或让客户端根据本地倒计时、`handId`、序列号和 UI 状态自行推进当前局号。
- 禁止：将 Android Host、客户端重连、MCP 适配器或其他并行计划带入本任务。

## 完成条件

- 服务端投影新增权威字段 `game.handNumber`，其值只由 `input.completedHands` 和当前 `hand` 是否为已结算局确定：

```text
completedHands = input.completedHands ?? 0
game.handNumber =
  hand 不存在 -> 无字段
  hand 已结算 -> completedHands
  hand 未结算 -> completedHands + 1
```

- `game.handNumber` 是正整数、安全整数且从 `1` 开始；首局翻牌前为 `1`，首局刚结算为 `1`，全员准备等待为 `1`，下一局真正发牌后才为 `2`，第二局刚结算保持为 `2`。
- `room.completedHands` 仍在结算进入 `hand-ready` 时增加，且继续作为盲注增长和记录统计的完成局数依据；本任务不得通过推迟该递增来间接修复显示。
- 客户端中 `GameRoom.tsx` 的 `settlementView.handNumber`、桌面 `handLabel` 和移动端 `mobileHandLabel` 都优先消费 `snapshot.game.handNumber`，不再把 `completedHands + 1` 作为当前局的业务计算。
- 若协议实现选择可选字段兼容旧快照，新客户端只能对“缺失 `handNumber` 的旧 Host 快照”使用一次明确的兼容回退 `completedHands + 1`，不得缓存、自增或在收到新权威值后覆盖它。若选择必填字段，则必须完成全部协议硬编码和恢复兼容边界审计，不能只修改 `PROTOCOL_VERSION` 常量。
- 实现阶段首先精确搜索协议版本硬编码、桌面 IPC、UDP discovery、Host 恢复、MCP 适配器、测试夹具和旧快照拒绝路径，确认当前快照扩展是可选兼容还是必须推进协议版本；最终选择必须写入任务验收证据，必要时同步 ADR。
- Host 投影测试至少覆盖：未结算首局、已结算但仍在准备窗口、下一局已创建、连续第二次结算，以及恢复后同一生命周期。
- Host 运行时测试必须贯通“首局结算进入 `hand-ready` -> `completedHands` 为 1、`game.handNumber` 为 1 -> 全员就绪创建下一局 -> `completedHands` 仍为 1、`game.handNumber` 为 2”，且新局 `handId` 已变化。
- 客户端测试至少覆盖：首局进度显示第 1 局、结算标题显示刚结束的第 N 局、准备窗口保持第 N 局、收到下一局快照后进度才变为第 N+1 局、暂停快照不改变局号、缺失权威字段时按既定兼容策略处理。
- `pnpm check` 通过；受影响 workspace 的 targeted tests 全部通过；不得新增 `any`、跳过测试、关闭 lint 或放宽 schema 来绕过兼容问题。

## 验证命令

- `pnpm --filter @texas-holdem/protocol test -- src/player-snapshot.test.ts`
- `pnpm --filter @texas-holdem/host test -- src/application/snapshot-projector.test.ts src/application/game-runtime.test.ts`
- `pnpm --filter @texas-holdem/client test -- src/room/GameRoom.test.tsx`
- `pnpm check`

## 文档影响

- 产品规格：在 `docs/product-specs/gameplay.md` 的牌局生命周期中说明当前局号与完成局数的区别，以及只有下一局真正创建后才切换到下一局号。
- 设计：更新 `docs/design-docs/hand-lifecycle.md` 和 `docs/design-docs/protocol-and-sync.md`，明确 `game.handNumber` 由 Host 投影，`room.completedHands` 保持完成局数语义。
- 不变量：`INV-AUTH-001` 和 `INV-HAND-001` 的语义不改变；仅在新增 Host 运行时生命周期测试后更新对应证据链接。
- ADR：默认无新增；若实施阶段确认必须破坏性升级协议版本，则增加对应决策。
- 执行计划与证据：任务完成后把本计划状态改为 `done`，并在 `verification.md` 填写完整结构化证据。
