# 客户端断线自动恢复验收证据

任务转为 `done` 前，为该任务添加唯一的同名二级标题，并按模板填写覆盖不变量、自动化验证、场景、执行方式、覆盖状态和证据。

## RECON-001

### 覆盖不变量

- INV-PROTO-001
- INV-AUTH-001

### 自动化验证

- `pnpm --filter @texas-holdem/client exec vitest run src/connection/connection.test.ts src/connection/socket-io-adapter.test.ts src/connection/reconnect-controller.test.ts src/room/GameRoom.test.tsx src/connection/ConnectionGuard.test.tsx`：5 个文件、29 个测试通过。
- `pnpm check`：Harness、格式、lint 和全 workspace typecheck 通过。

### 场景

协调器测试以 fake timers 验证固定 `500 ms` 间隔、自动周期最多 `20` 次、达到上限后停止自动尝试、手动周期复用同一参数、快照等待超时和 transport 断开恢复；Adapter 测试验证旧 Socket 的握手完成、错误和断开不能污染下一代 Socket。

### 执行方式

在当前 Windows worktree 通过 `apps/client` 的 Vitest 配置运行连接 targeted tests，并通过仓库根目录 `pnpm check` 验证。

### 覆盖状态

完成。显式协调器替代 Socket.IO 内置重连，成功握手保留运行期监听，旧 Promise/Socket 由 generation 和 attempt/cycle 守卫隔离；没有新增命令重发或服务端协议行为。

### 证据

- [重连协调器测试](../../../../apps/client/src/connection/reconnect-controller.test.ts)
- [Socket.IO adapter 测试](../../../../apps/client/src/connection/socket-io-adapter.test.ts)
- [重连协调器实现](../../../../apps/client/src/connection/reconnect-controller.ts)

## RECON-002

### 覆盖不变量

- INV-ROOM-001
- INV-PROTO-001
- INV-AUTH-001

### 自动化验证

- 上述客户端 targeted command：`GameRoom.test.tsx` 与 `ConnectionGuard.test.tsx` 在 5 个文件、29 个测试结果中通过。
- `pnpm check`：Harness、格式、lint 和全 workspace typecheck 通过。

### 场景

`GameRoom` 仅接受当前 `roomId`、`playerId` 且 `sequence` 不倒退的权威快照；连接恢复到快照到达前保持锁定，恢复快照跳过相邻音效/筹码飞行反馈；`ConnectionGuard` 在恢复和失败终态锁定内容，同时保留可读状态/错误角色和可操作手动重试。

### 执行方式

通过 jsdom/Vitest 运行客户端房间、连接守卫和协调器测试；通过根目录 `pnpm check` 验证实现与 CSS/TypeScript 约束。

### 覆盖状态

完成。连接成功不再直接解锁业务操作，必须由匹配且不倒退的权威快照调用协调器快照就绪门控；主动停止、`closed`、`removed` 和组件卸载均清理恢复周期。

### 证据

- [牌桌测试](../../../../apps/client/src/room/GameRoom.test.tsx)
- [连接守卫测试](../../../../apps/client/src/connection/ConnectionGuard.test.tsx)
- [牌桌恢复门控实现](../../../../apps/client/src/room/GameRoom.tsx)

## RECON-003

### 覆盖不变量

- INV-ROOM-001
- INV-PROTO-001
- INV-AUTH-001

### 自动化验证

- `pnpm harness:check`：Repository harness check passed。
- `pnpm check`：Harness test 26/26、格式检查、lint、packages build/typecheck 及 apps typecheck 通过。

### 场景

产品规格覆盖初始/意外断开、自动与手动周期、快照门控、操作锁定、命令不重发、`closed` 正常结束和 `removed` 终态；客户端设计覆盖协调器边界、generation/attempt、资源释放和不要求 Host `connectionStateRecovery`。

### 执行方式

通过仓库 Harness 解析器检查 active 计划索引、状态和任务依赖，再通过根目录 `pnpm check` 验证文档结构与代码门禁。

### 覆盖状态

完成。产品规格、客户端设计、执行计划状态与逐任务证据均已同步，未修改 Host、协议 schema、poker-core、持久化或 Android/MCP 范围。

### 证据

- [房间体验规格](../../../product-specs/room-experience.md)
- [客户端设计](../../../design-docs/client.md)
- [执行计划](plan.md)

补充：RECON 计划自身的结构、链接、状态和证据已通过 Harness；在主工作区同步的 setup-only `android-host` 计划被加入后，后续全仓 Harness 复跑被其 10 个未定义 `INV-ARCH-003`/`INV-PERSIST-002` 引用阻断。该目录不属于 RECON 允许范围，未修改或暂存。
