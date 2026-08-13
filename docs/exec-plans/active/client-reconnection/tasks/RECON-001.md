# RECON-001 — 显式重连协调器与 Adapter 生命周期

## 规范来源

- [产品规格地图](../../../../product-specs/index.md)
- [客户端设计](../../../../design-docs/client.md)
- [协议与同步设计](../../../../design-docs/protocol-and-sync.md)
- [系统不变量](../../../../../INVARIANTS.md)

## 相关不变量

- INV-PROTO-001
- INV-AUTH-001

## 允许范围

- 允许：`apps/client/src/connection/connection.ts`、`apps/client/src/connection/socket-io-adapter.ts`、新增 `apps/client/src/connection/reconnect-controller.ts` 及必要类型/错误辅助模块、对应的 `apps/client/src/connection/*.test.ts`。
- 禁止：Host、`packages/protocol`、`packages/poker-core` 和持久化模块，以及 `INV-PROTO-001` 的幂等语义或命令响应 schema。
- 禁止：GameRoom 页面接入、视觉样式及产品文档；这些由后续任务处理。

## 完成条件

- 初次连接失败、`transport close`、`transport error`、`ping timeout` 等可恢复断开会自动进入恢复并启动显式重试，不依赖 Socket.IO 隐藏的 `reconnection` 行为。
- 重试间隔固定为约 `500 ms`，不翻倍；每个自动重连周期最多连续尝试 `20` 次。到达 `20` 次后结束当前周期，并从 `automatic` 降级为 `manual`，不再自动调度新周期。
- 手动重试会取消当前等待和过期连接操作，然后启动一个与自动重连参数完全一致的新周期：相邻尝试固定间隔约 `500 ms`、最多 `20` 次，使用相同的成功、失败、快照超时和终态停止条件。手动入口不执行绕过周期规则的独立即时单次重试。
- 每次 `connect()` 都使用 generation/attempt ID 隔离 Socket 实例和 Promise；旧实例的 `connect`、`connect_error`、`disconnect`、`state:snapshot` 或 Promise 完成不能影响新实例。
- `disconnect()`、组件卸载、主动离开、快照进入 `closed` 或 `removed`、以及协调器 `stop()` 会清理当前 Socket、定时器和过期监听，不再自动重试。
- `ConnectionStateMachine` 接收所有初始连接、恢复、失败和主动断开事件；成功连接本身不等于业务恢复，后续快照就绪状态由 `RECON-002` 负责。
- 不自动重发任何已经提交但尚未收到确认的命令，不缓存或排队下注、筹码转移、房主操作或退出命令。
- 对无效身份、无法匹配当前 `roomId/playerId` 的会话，不根据错误文本做脆弱判断；由 `RECON-002` 的快照超时和终态判定结束自动恢复。

## 验证命令

- `pnpm --filter @texas-holdem/client test -- src/connection/connection.test.ts src/connection/socket-io-adapter.test.ts`
- `pnpm --filter @texas-holdem/client test -- src/connection/reconnect-controller.test.ts`
- `pnpm check`

## 文档影响

- 设计：在 `RECON-003` 同步客户端设计；本任务完成后不提前改写产品规格。
