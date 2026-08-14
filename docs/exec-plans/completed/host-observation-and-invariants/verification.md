# Host 观战与剩余不变量补强验收证据

任务转为 `done` 前，为该任务添加唯一的同名二级标题并填写覆盖不变量、自动化验证、场景、执行方式、覆盖状态和证据。

## OBSERVE-001

### 覆盖不变量

INV-AUTH-003
INV-ROOM-003

### 自动化验证

- `pnpm --filter @texas-holdem/protocol test`：13 个测试文件、83 个测试通过。
- `pnpm --filter @texas-holdem/host test -- src/server.test.ts`：46 个测试文件、219 个测试通过，包含 Host 快照和私有信息隔离路径。

### 场景

服务型 Host 与参与型 Host 均沿用 Host 管理快照；快照 schema 和投影只允许公共牌桌字段、公开摊牌底牌/牌型/结算，不允许 `ownHoleCards`、`legalActions` 或牌组顺序。

### 执行方式

test + architecture：协议运行时 schema、Host projector 和 Host Socket 均有测试，架构边界由根门禁持续检查。

### 覆盖状态

complete

### 证据

- [Host 快照 schema](../../../../packages/protocol/src/host-snapshot.ts)
- [Host 快照投影](../../../../apps/host/src/application/snapshot-projector.ts)
- [协议测试](../../../../packages/protocol/src/host-snapshot.test.ts)
- [任务详情](tasks/OBSERVE-001.md)

## OBSERVE-002

### 覆盖不变量

INV-AUTH-003
INV-ROOM-004

### 自动化验证

- `pnpm --filter @texas-holdem/client exec vitest run src/room/HostConsole.test.tsx src/App.test.tsx`：2 个测试文件、18 个测试通过。
- `pnpm --filter @texas-holdem/client typecheck`：通过。

### 场景

Host 控制台点击“进入观战牌桌”后进入复用正式牌桌布局的只读页面，显示公共牌、底池、行动者、倒计时和公开结算；页面不显示下注按钮、玩家私有底牌或 `legalActions`，返回按钮回到控制台。

### 执行方式

test：React 组件测试覆盖入口和只读观战渲染；Host 管理快照不向 renderer 发送玩家专属操作字段。

### 覆盖状态

complete

### 证据

- [Host 只读观战牌桌](../../../../apps/client/src/room/HostSpectatorRoom.tsx)
- [Host 控制台测试](../../../../apps/client/src/room/HostConsole.test.tsx)
- [观战样式](../../../../apps/client/src/app.css)
- [任务详情](tasks/OBSERVE-002.md)

## OBSERVE-003

### 覆盖不变量

INV-ROOM-002

### 自动化验证

- `pnpm exec vitest run e2e/e2e06-room-close-and-recovery.test.ts`：1 个测试文件、3 个测试通过。
- `pnpm --filter @texas-holdem/host test -- src/server.test.ts`：Host 控制 Socket 断开场景通过。

### 场景

同一条 SQLite 房间记录依次经历运行中、Host 控制会话断开后仍运行、Host 进程异常中断后 `recoverable`、桌面恢复入口重新建立 Host session、正常关闭后的 `closed`，以及归档后的 `archived`；默认列表隐藏归档记录。

### 执行方式

test：E2E06 使用真实 `GameRuntime`、`SqliteGameRuntimeStore`、`RoomRecordManagementService`、桌面 `recoverRoomRecordFromHost` 和临时 SQLite；Host server 测试使用真实 Socket.IO 连接后断开控制会话。

### 覆盖状态

complete

### 证据

- [Host/desktop 生命周期 E2E](../../../../e2e/e2e06-room-close-and-recovery.test.ts)
- [Host 控制会话断开测试](../../../../apps/host/src/server.test.ts)
- [任务详情](tasks/OBSERVE-003.md)

## OBSERVE-004

### 覆盖不变量

INV-PERSIST-001
INV-ARCH-001

### 自动化验证

- `pnpm --filter @texas-holdem/host test -- src/server.test.ts`：提交成功后 ACK 顺序、提交前异常和提交失败均通过。
- `pnpm exec vitest run tests/architecture/workspace-boundaries.test.ts`：4 个架构门禁测试通过。
- `pnpm architecture:check`：扫描当前 workspace source import，通过。

### 场景

Transport ACK 的顺序为事务开始、事件/命令写入、提交、持久化回调返回、ACK；提交前异常、回滚和提交失败均返回 rejected 且无残余写入。架构门禁拒绝共享包反向导入应用层、`poker-core` 运行时边界 import、系统时间和全局随机源。

### 执行方式

test + architecture：Host server 使用 SQLite 事务故障注入；根脚本使用 TypeScript AST 扫描静态 workspace 引用和 `poker-core` 能力访问。

### 覆盖状态

complete

### 证据

- [Transport 持久化确认顺序测试](../../../../apps/host/src/server.test.ts)
- [workspace 边界检查脚本](../../../../scripts/check-workspace-boundaries.mjs)
- [workspace 边界门禁测试](../../../../tests/architecture/workspace-boundaries.test.ts)
- [任务详情](tasks/OBSERVE-004.md)

## OBSERVE-005

### 覆盖不变量

INV-AUTH-003
INV-ROOM-002
INV-PERSIST-001
INV-ARCH-001

### 自动化验证

- 文档已同步产品规格、客户端/协议/持久化设计、ADR、架构入口和不变量。
- `pnpm harness:check`：通过。
- `pnpm harness:test`：26 个测试通过。
- `pnpm check`：通过，包含 331 个 workspace 源码文件架构扫描、格式、lint 和全 workspace typecheck。
- `pnpm check:full`：通过；全 workspace 测试包括 poker-core 219、protocol 83、lan-discovery 20、mcp-server 48、desktop 35、host 219、client 325 个测试，并完成构建。
- `pnpm test:e2e`：9 个测试文件、14 个测试通过。

### 场景

仅提供服务的 Host 可以进入只读观战牌桌；三项原先 partial 的不变量均有直接自动化证据；未公开底牌、玩家操作字段和非法 workspace 依赖仍被边界保护。

### 执行方式

test + architecture + harness：先运行受影响 workspace targeted tests，再运行仓库结构/生命周期/架构/格式/lint/typecheck/build/e2e 门禁。

### 覆盖状态

complete

### 证据

- [产品规格](../../../product-specs/room-experience.md)
- [不变量](../../../../INVARIANTS.md)
- [完整门禁脚本](../../../../package.json)
- [计划详情](tasks/OBSERVE-005.md)
