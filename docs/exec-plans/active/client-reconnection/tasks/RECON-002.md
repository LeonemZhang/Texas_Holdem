# RECON-002 — 快照就绪门控、操作锁定与恢复 UI

## 规范来源

- [房间体验产品规格](../../../../product-specs/room-experience.md)
- [客户端设计](../../../../design-docs/client.md)
- [系统不变量](../../../../../INVARIANTS.md)

## 相关不变量

- INV-ROOM-001
- INV-PROTO-001
- INV-AUTH-001

## 允许范围

- 允许：`apps/client/src/room/GameRoom.tsx`、`apps/client/src/connection/ConnectionGuard.tsx`、`apps/client/src/app.css`，以及对应的 `apps/client/src/room/GameRoom.test.tsx`、`apps/client/src/connection/ConnectionGuard.test.tsx`。
- 禁止：Host 权威逻辑、协议 schema、扑克规则和持久化。
- 禁止：其他页面的大范围视觉重构或无关响应式改动，以及自动重发命令、隐藏重连行为或绕过快照门控。

## 完成条件

- `GameRoom` 使用 `RECON-001` 的协调器和 `ConnectionStateMachine`，组件挂载后执行一次初始连接，不再各自维护一次性 `connect()` 副作用。
- 非主动断开且当前最新权威快照不是 `closed` 时，界面立即进入“连接中断，正在恢复”；同时锁定下注、筹码交换、房主操作和外部 `commandPort` 调用。
- 重连成功但尚未收到权威快照时仍保持“正在恢复”；只有收到与当前 `roomId`、`playerId` 匹配，且 `sequence >=` 当前快照序列的 `state:snapshot`，才清除恢复状态并解锁操作。
- 重连快照不重播历史音效、结算展开或断线期间底池筹码飞行动画；只从新快照确认的相邻状态变化产生这些反馈。
- 已连接但在默认约 `10 s` 内未收到可接受的快照时结束当前自动重连周期并进入 `manual`；`ConnectionGuard` 显示可操作的重试按钮，重试按与自动周期相同的固定 `500 ms` 间隔和 `20` 次上限启动新周期，并防止按钮重复触发产生并行周期。
- 收到权威 `closed` 快照时继续按正常房间关闭处理，随后 Host 主动断开不得显示网络异常或发起重连。
- 收到权威快照显示本人已被 `removed` 时，按现有流程退出房间并停止恢复，不无限自动重试。
- 快照身份或令牌已失效、房间不再可用等无法通过快照恢复的情况进入可解释的终态或失败状态，不永久显示“正在恢复”。
- 恢复期间不自动重发未确认命令；快照重新就绪后，用户必须按当前权威快照重新发起操作。
- `ConnectionGuard` 的失败状态继续支持辅助技术可读的 `role="alert"`，恢复状态保持 `role="status"`，且移动端按钮和横幅不出现文本溢出或遮挡。

## 验证命令

- `pnpm --filter @texas-holdem/client test -- src/room/GameRoom.test.tsx src/connection/ConnectionGuard.test.tsx`
- `pnpm check`

## 文档影响

- 产品规格：本任务通过后由 `RECON-003` 更新。
- 设计：本任务通过后由 `RECON-003` 更新。
