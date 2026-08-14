# 房主管理与权威当前盲注验收证据

## ROOMBLIND-001

### 覆盖不变量

- INV-AUTH-001、INV-ROOM-001、INV-PERSIST-001、INV-HAND-003。

### 自动化验证

- `pnpm --filter @texas-holdem/poker-core typecheck`：通过。
- `pnpm --filter @texas-holdem/poker-core test`：32 个测试文件、221 个测试通过。
- `pnpm --filter @texas-holdem/protocol typecheck`：通过。
- `pnpm --filter @texas-holdem/protocol test`：13 个测试文件、84 个测试通过。
- `pnpm --filter @texas-holdem/host typecheck`：通过。
- `pnpm --filter @texas-holdem/host test`：46 个测试文件、222 个测试通过。

### 场景

- 房间状态同时保存基础小盲、权威当前小/大盲和下一次增长阈值；旧快照恢复时只做一次兼容归一化。
- 动态修改当前小盲后，下一局从该权威级别开始；完成一局后按新增长配置推进一次，不按基础小盲和历史局数重算。
- 当前手牌的盲注固定；修改行动超时不会重置正在进行的行动截止时间，新的超时从下一次行动生效。
- 首局后服务端锁定人数上限、初始筹码和基础小盲，仍允许房主修改行动时间、准备等待、盲注增长、封顶、零筹码策略和当前小盲。

### 执行方式

在本 worktree 通过 Vitest、TypeScript workspace typecheck 和 Host 的 fake-timer/runtime/recovery 测试验证；核心覆盖[权威盲注推进测试](../../../../packages/poker-core/src/table/blinds.test.ts)，Host 覆盖[动态房间配置测试](../../../../apps/host/src/domain/update-room-settings.test.ts)、[牌局运行时测试](../../../../apps/host/src/application/game-runtime.test.ts)和快照/恢复测试。

### 覆盖状态

已完成。权威当前盲注已进入 RoomState、Host 快照、协议 schema、SQLite 快照恢复和下一局启动路径。

### 证据

[盲注推进实现](../../../../packages/poker-core/src/table/blinds.ts)、[房间状态与增长调度](../../../../apps/host/src/domain/room.ts)、[动态配置校验](../../../../apps/host/src/domain/update-room-settings.ts)以及[运行时调度](../../../../apps/host/src/application/game-runtime.ts)。

## ROOMUI-002

### 覆盖不变量

- INV-AUTH-001、INV-PROTO-001。

### 自动化验证

- `pnpm --filter @texas-holdem/client typecheck`：通过。
- `pnpm --filter @texas-holdem/client test`：41 个测试文件、326 个测试通过。
- 其中[房主控制台测试](../../../../apps/client/src/room/HostConsole.test.tsx)覆盖服务型房主大厅、开始后默认观战、返回大厅、观战结算收起、公开底牌显示和牌桌底牌不重复。

### 场景

- 创建房间使用默认参与的左右 tab；服务型房主大厅复用参与型大厅的玩家列表、拖拽/随机座位、复制链接/二维码、配置、准备统计、开始和关闭能力。
- 开始后服务型房主进入只读观战牌桌；右上角房间管理旁边提供返回房主控制台，左下角开始游戏旁提供“加入观战”。
- 观战结算只显示可公开的结算牌面并可收起，不显示就绪/暂不参与按钮，也不在牌桌区域重复显示底牌。
- 参与型和服务型房主都能在局内打开同一房间管理面板，动态配置和当前小盲回填；局内当前小盲受基础小盲与小盲上限双向约束，首局大厅隐藏当前小盲并锁定基础字段。

### 执行方式

在本 worktree 通过客户端 Vitest、React Testing Library 和 TypeScript typecheck 验证，未改变 Android Host 边界。

### 覆盖状态

已完成。客户端入口、等待大厅、房主控制台、观战牌桌和局内房间管理均已接入 Host 管理快照与命令。

### 证据

[创建房间表单](../../../../apps/client/src/room/CreateRoomForm.tsx)、[复用大厅](../../../../apps/client/src/room/LobbyWaitingRoom.tsx)、[房主控制台](../../../../apps/client/src/room/HostConsole.tsx)、[观战牌桌](../../../../apps/client/src/room/HostSpectatorRoom.tsx)和[房间管理面板](../../../../apps/client/src/room/HostControls.tsx)。

## ROOMDOC-003

### 覆盖不变量

- INV-AUTH-001、INV-PROTO-001、INV-PERSIST-001、INV-HAND-003。

### 自动化验证

- `pnpm harness:check`：通过。
- `pnpm harness:test`：26 个 Harness 测试通过。
- `pnpm architecture:check`：扫描 331 个 workspace 源码文件，通过。
- `pnpm format:check`：通过。
- `pnpm lint`：通过。
- `pnpm typecheck`：所有 workspace 通过。
- `pnpm check`：通过，包含上述 Harness、架构、格式、lint 和 typecheck 门禁。

### 场景

产品规格、设计文档、ADR、不变量和执行计划现已明确区分基础盲注与权威当前盲注，记录增长阈值、当前手固定、动态修改生效边界和恢复语义；同时记录服务型房主大厅、观战默认入口、返回大厅、观战结算和局内管理行为。

服务型房主从桌面历史记录恢复时，恢复解析会保留 `sessionType: 'host'` 与 `hostId`，确保恢复后的 Host 继续进入房主管理/观战路径，而不会停留在普通玩家的“正在连接牌桌”页面。

### 执行方式

由主 agent 读取并同步规范、设计、决策、不变量、执行计划和本验证记录；编码与测试可由子 agent 协助，但文档修改和最终验收由主 agent 完成。

### 覆盖状态

已完成；本计划三个任务均已完成，未提交或推送 Git。

### 证据

[房间体验规格](../../../product-specs/room-experience.md)、[玩法规格](../../../product-specs/gameplay.md)、[客户端设计](../../../design-docs/client.md)、[动态房间配置 ADR](../../../decisions/ADR-009-dynamic-room-settings.md)、[系统不变量](../../../../INVARIANTS.md)以及本验证记录。
