# RECON-003 — 产品规格与客户端设计同步

## 规范来源

- [产品规格地图](../../../../product-specs/index.md)
- [设计文档地图](../../../../design-docs/index.md)
- [系统不变量](../../../../../INVARIANTS.md)

## 相关不变量

- INV-ROOM-001
- INV-PROTO-001
- INV-AUTH-001

## 允许范围

- 允许：`docs/product-specs/room-experience.md`、`docs/design-docs/client.md`、本执行计划中的状态与证据。
- 禁止：Host 或客户端实现。
- 禁止：`INVARIANTS.md` 中已有不变量定义，以及其他产品规格、ADR、Android 计划或并行文档。

## 完成条件

- 房间体验规格明确区分：初始连接、普通刷新或程序崩溃导致的意外断开、固定 `500 ms` 间隔且最多 `20` 次的自动重连、达到上限后的手动模式、同参数手动重连周期、快照未就绪、操作锁定/解锁、`closed` 正常断开、`removed` 终态。
- 规格明确恢复成功的用户可观察条件是收到当前玩家身份匹配且不倒退的权威快照，而不是仅 TCP/Socket.IO 重新连通。
- 规格明确自动重连不能重发未确认命令；恢复后所有操作使用当前权威快照版本。
- 客户端设计补充显式重连协调器、固定 `500 ms` 间隔、`20` 次自动尝试上限、自动到手动模式降级、同参数手动周期、generation/attempt ID、快照就绪门控、连接状态机和资源释放边界。
- 文档不要求 Host 增加 `connectionStateRecovery`，不改变服务端权威性、协议幂等或 SQLite 契约。
- `docs/exec-plans/active/client-reconnection/verification.md` 为 `RECON-001`、`RECON-002`、`RECON-003` 补齐逐任务结构化证据，状态表中最多一个任务为 `active`。

## 验证命令

- `pnpm harness:check`
- `pnpm check`

## 文档影响

- 产品规格：本任务实际更新 `room-experience.md`。
- 设计：本任务实际更新 `client.md`。
- 执行计划：本任务完成后归档或按仓库约定更新状态与证据。
