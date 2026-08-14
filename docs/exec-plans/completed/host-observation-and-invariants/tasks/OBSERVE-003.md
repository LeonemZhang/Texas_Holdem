# OBSERVE-003 — Host/desktop 生命周期跨边界证据

## 规范来源

- [房间体验规格](../../../../product-specs/room-experience.md)
- [持久化与恢复设计](../../../../design-docs/persistence-and-recovery.md)
- [系统不变量](../../../../../INVARIANTS.md)

## 相关不变量

INV-ROOM-002

## 允许范围

- 允许：`apps/host/src/**/*.test.ts`、`apps/desktop/src/main/**/*.test.ts` 和直接覆盖 Host/desktop 房间记录恢复边界的 `e2e/` 测试。
- 允许：为测试注入明确的时钟、Host controller 或临时 SQLite 依赖；不改变生产生命周期语义。
- 禁止：修改 Host 关闭/恢复生产状态机、Android、跨设备接管或删除历史记录。

## 完成条件

- 单一测试场景可区分正常关闭、异常中断、恢复和归档后的对外可观察状态。
- Host 控制会话断开、Host 进程异常退出和桌面恢复入口的结果与产品规格一致。

## 验证命令

- 受影响 Host/desktop/e2e targeted tests。
- `pnpm check`

## 文档影响

不变量、执行计划和证据；由 `OBSERVE-005` 统一回填。
