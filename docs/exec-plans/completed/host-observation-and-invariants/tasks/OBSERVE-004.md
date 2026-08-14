# OBSERVE-004 — 持久化确认顺序与架构依赖门禁

## 规范来源

- [持久化与恢复设计](../../../../design-docs/persistence-and-recovery.md)
- [架构入口](../../../../../ARCHITECTURE.md)
- [系统不变量](../../../../../INVARIANTS.md)

## 相关不变量

INV-PERSIST-001
INV-ARCH-001

## 允许范围

- 允许：`apps/host/src/**/*.test.ts` 中 transport/command acknowledgment 故障注入测试及必要的最小测试 seam。
- 允许：`scripts/check-workspace-boundaries.mjs`、其测试、根 `package.json` 的门禁脚本和相关 Harness 验证。
- 禁止：关闭 schema、绕过事务、修改共享包边界以迁就非法 import。

## 完成条件

- 持久化失败或提交前异常时，transport 不返回成功响应；提交成功后才确认。
- 自动脚本扫描 workspace import，拒绝共享包导入应用层、`poker-core` 导入网络/数据库/UI/系统时间/全局随机源等架构违规。

## 验证命令

- 受影响 Host/architecture targeted tests。
- `pnpm harness:check`
- `pnpm check`

## 文档影响

架构、不变量、执行计划和证据；由 `OBSERVE-005` 统一回填。
