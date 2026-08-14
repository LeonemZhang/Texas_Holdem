# 房主参与模式与玩家身份分离验收证据

任务转为 `done` 前，为该任务添加唯一的同名二级标题，并按模板填写覆盖不变量、自动化验证、场景、执行方式、覆盖状态和证据。

## ROOMHOST-001

### 覆盖不变量

- INV-AUTH-003
- INV-ROOM-003
- INV-ROOM-004

### 自动化验证

- `pnpm harness:check`：通过；仓库 Harness 结构、链接、任务 ID、状态和依赖检查通过。
- `pnpm harness:test`：通过；1 个测试文件、26 个 Harness 契约测试通过。
- `pnpm check`：通过；包含 Harness、26 个契约测试、全仓 Prettier、ESLint 和全 workspace typecheck。
- `git diff --check`：通过；本次文档差异无空白错误。

### 场景

本任务验证产品与架构契约，而不是运行牌局。规格覆盖 `参与游戏` 与 `仅提供服务` 两种模式、实际玩家人数/座位/准备门禁、Host/Player 身份分离、Host 管理快照、控制会话断线、同设备恢复、旧记录兼容、Android/mobile 排除和中心服务器不纳入本计划。

### 执行方式

在当前 Windows worktree 通过仓库根目录 Harness、Prettier、ESLint 和 TypeScript 门禁验证本计划及同步文档；未修改代码、未运行扑克或网络集成测试。

### 覆盖状态

完成。产品规格、ADR-008、架构入口、房间领域、协议同步、持久化恢复、客户端设计、不变量和执行计划已经形成一致的实现契约；后续 ROOMHOST-002 至 ROOMHOST-006 已分别回填实现与运行证据，本节只记录本任务建立的契约基线，不把计划文档当作运行实现证据。

### 证据

- [房间体验规格](../../../product-specs/room-experience.md)
- [ADR-008](../../../decisions/ADR-008-host-participation.md)
- [房间领域设计](../../../design-docs/room-domain.md)
- [协议与同步设计](../../../design-docs/protocol-and-sync.md)
- [持久化与恢复设计](../../../design-docs/persistence-and-recovery.md)
- [执行计划](plan.md)

## ROOMHOST-006

### 覆盖不变量

- INV-AUTH-001
- INV-AUTH-002
- INV-AUTH-003
- INV-PROTO-001
- INV-ROOM-001
- INV-ROOM-002
- INV-ROOM-003
- INV-ROOM-004
- INV-PERSIST-001
- INV-ARCH-002

### 自动化验证

- `pnpm --filter @texas-holdem/protocol test`：通过；13 个测试文件、82 个测试通过。
- `pnpm --filter @texas-holdem/host test`：通过；46 个测试文件、216 个测试通过。
- `pnpm --filter @texas-holdem/client test`：通过；41 个测试文件、324 个测试通过。
- `pnpm --filter @texas-holdem/desktop test`：通过；14 个测试文件、35 个测试通过。
- `pnpm test:e2e`：通过；9 个测试文件、13 个测试通过。
- `pnpm check:full`：通过；包含 Harness、26 个 Harness 契约测试、全 workspace typecheck/build、全 workspace tests、格式、lint 和 brand check。
- `pnpm harness:check`：通过。
- `pnpm harness:test`：通过；26 个 Harness 契约测试通过。
- `git diff --check`：通过。

### 场景

跨边界覆盖服务型 Host 创建后无玩家、两名实际玩家加入/准备/首局门禁、Host 管理快照不含私有底牌、Player 快照仍只给本人私有信息、Host/Player 命令身份和重复 commandId 幂等、Host 控制 Socket 断线恢复、同设备 Host token 恢复、错误身份不能接管、SQLite 新旧记录恢复、参与型旧 Host 玩家体验、浏览器 Host 能力拒绝，以及正常关闭/异常恢复的既有 e2e 回归。

### 执行方式

由主 agent 逐 task 复核 ROOMHOST-002 至 ROOMHOST-005 的允许路径和测试证据，并在 ROOMHOST-006 补充 Host Socket 集成测试、HostConsole/UI 测试和旧快照归一化测试；全程未提交或推送，保留 worktree 中已有 `.codex/` 未跟踪目录和其他非本计划内容。

### 覆盖状态

完成。`INV-AUTH-003`、`INV-ROOM-003`、`INV-ROOM-004` 已从 gap 更新为 complete；`INV-ROOM-002` 和 `INV-PERSIST-001` 保持 partial，因为已有生命周期/事务证据仍未形成单一 transport 级故障注入场景，不能用本计划的正常测试冒充更强证据。Android Host、中心服务器、跨设备同步和 Host 接管仍明确不在范围内。

### 证据

- [ROOMHOST-002 领域与门禁](tasks/ROOMHOST-002.md)
- [ROOMHOST-003 协议、会话与 Host snapshot](tasks/ROOMHOST-003.md)
- [ROOMHOST-004 SQLite 与恢复](tasks/ROOMHOST-004.md)
- [ROOMHOST-005 Windows/client 控制台](tasks/ROOMHOST-005.md)
- [Host Socket 跨边界测试](../../../../apps/host/src/server.test.ts)
- [Host UI 跨边界测试](../../../../apps/client/src/room/HostConsole.test.tsx)
- [旧快照恢复测试](../../../../apps/host/src/persistence/sqlite-snapshot-store.test.ts)
- [执行计划](plan.md)

## ROOMHOST-003

### 覆盖不变量

- INV-AUTH-001
- INV-AUTH-002
- INV-AUTH-003
- INV-PROTO-001
- INV-ROOM-001
- INV-ROOM-003

### 自动化验证

- `pnpm --filter @texas-holdem/protocol test`：通过；13 个测试文件、81 个测试通过。
- `pnpm --filter @texas-holdem/host test`：通过；46 个测试文件、213 个测试通过。
- `pnpm --filter @texas-holdem/host typecheck`：通过。
- `pnpm check`：通过；包含 Harness、26 个 Harness 契约测试、全仓格式、lint、全 workspace build/typecheck；apps/client 在 Host snapshot 保持独立类型后通过。
- `git diff --check`：通过。

### 场景

覆盖服务型 Host 创建后不产生 Player、Host 独立 token/sessionType、Host 管理命令授权、Player 冒用 Host 凭据失败、Host 管理快照仅含公共牌桌投影、Player 快照继续按身份含私有字段、Host 控制会话恢复匹配 roomId/hostId/角色、Host 控制 Socket 通道与 Player 私有通道分离，以及旧 Player 会话字段兼容。

### 执行方式

ROOMHOST-003 原计划由子 agent 执行，但其连续等待后未产生可审查改动，已关闭；主 agent 按同一 task 的允许范围完成协议 schema、Host 管理快照投影、Host/Player 会话认证、命令路由、重连同步和 Socket 发布接线，并由父级运行协议/Host targeted 与全量测试复核。未修改 SQLite、客户端、Electron、扑克规则或文档语义。

### 覆盖状态

完成。协议已提供独立 Host 管理快照类型而非 PlayerSnapshot 可选字段；应用层已区分 Host 与 Player 会话、通道和授权，服务型 Host 的房间领域数据不再被当作 Player。Host 身份在 SQLite 记录中的持久化与旧记录恢复仍由 ROOMHOST-004 覆盖，客户端消费新 sessionType/Host snapshot 仍由 ROOMHOST-005 覆盖。

### 证据

- [Host 管理快照 schema](../../../../packages/protocol/src/host-snapshot.ts)
- [会话协议 schema](../../../../packages/protocol/src/room-session.ts)
- [Host 会话运行时](../../../../apps/host/src/application/game-runtime.ts)
- [Host 管理快照投影](../../../../apps/host/src/application/snapshot-projector.ts)
- [Host/Player Socket 通道](../../../../apps/host/src/application/socket-publisher.ts)
- [服务型 Host 集成测试](../../../../apps/host/src/application/host-participation.test.ts)
- [ROOMHOST-003 任务详情](tasks/ROOMHOST-003.md)

## ROOMHOST-004

### 覆盖不变量

- INV-ROOM-001
- INV-ROOM-002
- INV-ROOM-003
- INV-PERSIST-001

### 自动化验证

- `pnpm --filter @texas-holdem/host exec vitest run src/persistence/migrations.test.ts src/persistence/sqlite-database.test.ts src/persistence/sqlite-game-runtime-store.test.ts src/persistence/sqlite-reconnect-identity-store.test.ts src/persistence/sqlite-room-lifecycle-store.test.ts src/persistence/sqlite-room-record-catalog.test.ts src/persistence/room-recovery.test.ts src/persistence/sqlite-snapshot-store.test.ts`：通过；8 个测试文件、22 个测试通过。
- `pnpm --filter @texas-holdem/host test`：通过；46 个测试文件、215 个测试通过。
- `pnpm --filter @texas-holdem/host typecheck`：通过。
- `pnpm check`：通过；包含 Harness、26 个 Harness 契约测试、全 workspace build/typecheck、格式和 lint。
- `git diff --check`：通过。

### 场景

覆盖 SQLite v10 保存 `host_id`、`host_nickname`、`host_participation`；服务型 Host 没有 `is_host` 玩家行但有独立 Host token 摘要；旧快照缺少新字段时默认 `参与游戏` 并恢复旧 Host 玩家；记录目录对服务型 Host 使用房间 Host 昵称而不是依赖 Host 玩家 JOIN；Host token 仍以摘要形式认证。

### 执行方式

由主 agent 在 ROOMHOST-004 允许的 persistence/application recovery 范围内实现，保留 ROOMHOST-002/003 的既有差异；新增 SQLite Host identity adapter、migration、生命周期列、记录目录兼容和旧快照归一化，并通过 Host persistence targeted/full tests 复核。未修改跨设备同步、UI、Android 数据库、中心服务器或扑克规则。

### 覆盖状态

完成。新记录保存与恢复、旧记录默认、Host token 摘要和服务型 Host 玩家行隔离均有自动化证据；Host 控制会话断线不改变房间生命周期仍由 ROOMHOST-003/ROOMHOST-006 做网络/端到端证据，最终全链路关闭/恢复场景由 ROOMHOST-006 覆盖。

### 证据

- [SQLite migrations](../../../../apps/host/src/persistence/migrations.ts)
- [Room lifecycle persistence](../../../../apps/host/src/persistence/sqlite-room-lifecycle-store.ts)
- [Host token persistence](../../../../apps/host/src/persistence/sqlite-host-reconnect-identity-store.ts)
- [Runtime persistence adapter](../../../../apps/host/src/persistence/sqlite-game-runtime-store.ts)
- [Legacy snapshot normalization](../../../../apps/host/src/persistence/sqlite-snapshot-store.ts)
- [ROOMHOST-004 任务详情](tasks/ROOMHOST-004.md)

## ROOMHOST-005

### 覆盖不变量

- INV-AUTH-003
- INV-ARCH-002
- INV-PROTO-001
- INV-ROOM-001
- INV-ROOM-003
- INV-ROOM-004

### 自动化验证

- `pnpm --filter @texas-holdem/client exec vitest run src/App.test.tsx src/runtime.test.ts src/home/ConnectionHome.test.tsx src/room/DesktopRoomSetup.test.tsx src/room/GameRoom.test.tsx src/room/HostControls.test.tsx src/room/RoomRecordManager.test.tsx src/room/CreateRoomForm.test.tsx src/room/HostConsole.test.tsx`：通过；9 个测试文件、73 个测试通过。
- `pnpm --filter @texas-holdem/desktop exec vitest run src/shared/runtime.test.ts src/main/room-record-recovery.test.ts`：通过；2 个测试文件、4 个测试通过。
- `pnpm --filter @texas-holdem/client typecheck`：通过。
- `pnpm --filter @texas-holdem/desktop typecheck`：通过。
- `pnpm check`：通过；包含 Harness、26 个 Harness 契约测试、全 workspace build/typecheck、格式和 lint。
- `git diff --check`：通过。
- 关联恢复修复：`pnpm --filter @texas-holdem/desktop exec vitest run src/shared/runtime.test.ts src/main/room-record-recovery.test.ts`：通过；2 个测试文件、4 个测试通过。
- 关联恢复修复：`pnpm --filter @texas-holdem/client exec vitest run src/App.test.tsx`：通过；16 个测试通过。

### 场景

覆盖 Windows 创建表单选择“参与游戏/仅提供服务”、服务型 Host 使用 Host session 和 Host snapshot 控制台、控制台不构造 Host Player 卡片/私有手牌/Player legal actions、真实玩家列表只显示实际玩家、控制台断线锁定并按 Host 身份重连、浏览器不显示创建入口且显式拒绝 Host 控制台、既有 Player 入口和 Electron 窄 RuntimeAdapter 保持兼容。关联恢复修复确认服务型 Host 恢复结果保留 `sessionType: 'host'` 与 `hostId`，桌面 App 因此继续进入 Host 控制/恢复路径，不误判为普通玩家并停留在“正在连接牌桌”。

### 执行方式

由主 agent 在 ROOMHOST-005 允许的 client/desktop 边界内实现；新增 HostConsole 和 Host snapshot Socket 适配，扩展创建表单和 Host session 路由，并保留现有 GameRoom 的参与型 Host/Player 路径。未修改 Host 权威算法、SQLite schema、Android Host、中心服务器或全局视觉系统。

### 覆盖状态

完成。客户端已具备显式模式选择、服务型 Host 管理控制台、Player 兼容入口和浏览器能力隔离；网络/恢复的跨边界真实场景与最终规范同步由 ROOMHOST-006 收敛。

### 证据

- [创建模式表单](../../../../apps/client/src/room/CreateRoomForm.tsx)
- [Host 控制台](../../../../apps/client/src/room/HostConsole.tsx)
- [Socket Host snapshot 适配](../../../../apps/client/src/connection/socket-io-adapter.ts)
- [客户端入口路由](../../../../apps/client/src/App.tsx)
- [桌面恢复 session 解析](../../../../apps/desktop/src/main/room-record-recovery.ts)
- [桌面恢复类型边界](../../../../apps/desktop/src/shared/runtime.ts)
- [桌面恢复测试](../../../../apps/desktop/src/main/room-record-recovery.test.ts)
- [客户端 App 恢复测试](../../../../apps/client/src/App.test.tsx)
- [ROOMHOST-005 任务详情](tasks/ROOMHOST-005.md)

## ROOMHOST-002

### 覆盖不变量

- INV-AUTH-001
- INV-ROOM-003
- INV-ROOM-004
- INV-POT-001

### 自动化验证

- `pnpm --filter @texas-holdem/host exec vitest run src/domain/room.test.ts src/domain/room-control.test.ts src/domain/lobby-ready.test.ts src/domain/start-first-hand.test.ts src/domain/seat-management.test.ts src/domain/player-status.test.ts src/domain/join-room.test.ts src/domain/update-room-settings.test.ts`：通过；8 个测试文件、40 个测试通过。
- `pnpm --filter @texas-holdem/host test`：通过；45 个测试文件、212 个测试通过。
- `pnpm --filter @texas-holdem/host typecheck`：通过。
- `pnpm check`：通过；包含 Harness、Harness 契约测试、格式、lint、全 workspace typecheck、构建和既有测试门禁。
- `git diff --check`：通过。

### 场景

覆盖服务型房主不进入玩家集合、座位、筹码和准备状态；实际玩家容量、准备及首局开始门禁；Host 身份管理授权；参与游戏模式的旧行为兼容；玩家加入时不能冒用 Host 身份。

### 执行方式

由 ROOMHOST-002 accountable subagent 在 `apps/host/src/domain` 内实现，主 agent 复核差异、路径范围和测试结果；未修改协议、应用层、持久化、客户端或扑克规则实现。

### 覆盖状态

完成。领域层已具备两种参与模式和独立 Host 身份的建模与门禁；Host 管理投影的私有信息隔离仍由 ROOMHOST-003/ROOMHOST-006 验证，新增不变量未被本任务提前宣称为全链路完成。

### 证据

- [ROOMHOST-002 任务详情](tasks/ROOMHOST-002.md)
- [房间领域实现](../../../../apps/host/src/domain/room.ts)
- [领域测试](../../../../apps/host/src/domain/room.test.ts)
- [执行计划](plan.md)
