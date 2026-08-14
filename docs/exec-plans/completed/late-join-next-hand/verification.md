# 牌局开始后新玩家下一局参赛验收证据

任务转为 `done` 前，为每个任务添加唯一的同名二级标题，并填写覆盖不变量、自动化验证、场景、执行方式、覆盖状态和证据。

## LATEJOIN-001

### 覆盖不变量

- INV-AUTH-001
- INV-HAND-001
- INV-ROOM-001
- INV-ROOM-002
- INV-PERSIST-001；仅同步产品与设计语义，未改变不变量定义。

### 自动化验证

`pnpm harness:check`、`pnpm harness:test`、`pnpm check`（最终结果由 LATEJOIN-004 记录）。

### 场景

首局开始后允许新 Player 加入；当前手保持原参与者和状态；牌局准备阶段新玩家默认为 `pending`，需主动 `ready`；关闭房间拒绝加入。

### 执行方式

产品规格、设计文档和 ADR 已同步；实现与测试由后续任务承接。

### 覆盖状态

done。

### 证据

- [玩法规格](../../../../docs/product-specs/gameplay.md)、[房间体验规格](../../../../docs/product-specs/room-experience.md)、[牌局生命周期设计](../../../../docs/design-docs/hand-lifecycle.md)、[房间领域设计](../../../../docs/design-docs/room-domain.md)、[协议与同步设计](../../../../docs/design-docs/protocol-and-sync.md)、[客户端设计](../../../../docs/design-docs/client.md)、[ADR-010](../../../../docs/decisions/ADR-010-late-join-next-hand.md)。

## LATEJOIN-002

### 覆盖不变量

- INV-AUTH-001
- INV-HAND-001
- INV-PROTO-001
- INV-ROOM-001
- INV-ROOM-002
- INV-PERSIST-001

### 自动化验证

`pnpm --filter @texas-holdem/host exec vitest run src/domain/join-room.test.ts src/domain/hand-ready-actions.test.ts src/application/room-command-handler.test.ts src/application/game-runtime.test.ts`，45 tests passed。

### 场景

`playing`/`hand-ready`/`paused` 接受新身份；新玩家保持 `waiting`；当前手参与者不变；准备上下文追加 `pending`；显式 `ready` 后才进入下一局；关闭房间拒绝加入。

### 执行方式

复用现有加入、身份、expectedVersion、内存状态导出/恢复和牌局准备路径；未修改协议 schema、`poker-core` 或 SQLite migration。

### 覆盖状态

done。

### 证据

- [加入领域](../../../../apps/host/src/domain/join-room.ts)、[准备动作](../../../../apps/host/src/domain/hand-ready-actions.ts)、[房间命令处理](../../../../apps/host/src/application/room-command-handler.ts)、[运行时](../../../../apps/host/src/application/game-runtime.ts)及[对应测试](../../../../apps/host/src/application/game-runtime.test.ts)。

## LATEJOIN-003

### 覆盖不变量

- INV-AUTH-001
- INV-AUTH-002
- INV-ROOM-001
- INV-ROOM-002

### 自动化验证

`pnpm --filter @texas-holdem/client exec vitest run src/room/HandReadyOverlay.test.tsx src/room/GameRoom.test.tsx src/table/TableSeats.test.tsx`，3 files / 78 tests passed。

### 场景

当前牌局新玩家显示“等待下一局”，不显示底牌和下注资格；准备窗口沿用统一的“就绪”操作，仍由服务端 `handReady` 快照驱动；旧玩家牌桌测试保持通过。

### 执行方式

客户端只消费既有玩家状态、`game` 和 `handReady` 投影；没有在客户端新增资格计算或观战身份。

### 覆盖状态

done。

### 证据

- [牌桌](../../../../apps/client/src/room/GameRoom.tsx)、[准备遮罩](../../../../apps/client/src/room/HandReadyOverlay.tsx)、[座位](../../../../apps/client/src/table/TableSeats.tsx)及[对应测试](../../../../apps/client/src/room/GameRoom.test.tsx)。

## LATEJOIN-004

### 覆盖不变量

- INV-AUTH-001
- INV-AUTH-002
- INV-HAND-001
- INV-PROTO-001
- INV-PERSIST-001
- INV-ROOM-001
- INV-ROOM-002

### 自动化验证

- `pnpm --filter @texas-holdem/host test`：通过，46 files / 228 tests。
- `pnpm --filter @texas-holdem/client test`：通过，41 files / 337 tests；准备按钮统一使用“就绪”，相关 targeted tests 复跑 3 files / 78 tests 通过。
- `pnpm test:e2e`：通过，10 files / 15 tests，包含 `LATEJOIN-E2E`。
- `pnpm harness:check`：通过。
- `pnpm harness:test`：通过，26 tests。
- `pnpm check`：通过，包含 Harness、架构边界、格式、lint、workspace build 和 typecheck。

### 场景

- `playing` 阶段新玩家加入后保留 `waiting`，当前 `StartedHandState` 仍只有原参赛者。
- 当前手结束进入 `hand-ready` 后，进行中加入者和准备阶段新加入者均为 `pending`；在未显式就绪前不能创建下一手。
- 新玩家选择统一的“就绪”操作后进入下一手；选择暂不参与者不进入；关闭房间拒绝新加入。
- 满座、重复昵称/身份、旧玩家恢复和既有客户端牌桌测试保持原约束。

### 执行方式

使用 Host、客户端 workspace 全量测试和根目录 E2E 配置验证；Harness 门禁按串行方式复跑以避免并行进程争用测试超时。未修改无关 active plan、协议 schema、`poker-core` 或 SQLite migration。

### 覆盖状态

LATEJOIN-001 至 LATEJOIN-004 均已完成，计划可归档。

### 证据

- [LATEJOIN E2E](../../../../e2e/e2e10-late-join-next-hand.test.ts)
- [Host 运行时测试](../../../../apps/host/src/application/game-runtime.test.ts)
- [客户端牌桌测试](../../../../apps/client/src/room/GameRoom.test.tsx)
- [执行计划](plan.md)
- [Harness 结构与测试脚本](../../../../scripts/check-repository-harness.mjs)
