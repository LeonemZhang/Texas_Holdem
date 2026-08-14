# OBSERVE-005 — 规范同步与最终验收

## 规范来源

- [产品规格地图](../../../../product-specs/index.md)
- [系统不变量](../../../../../INVARIANTS.md)
- [执行计划地图](../../../index.md)

## 相关不变量

INV-AUTH-003
INV-ROOM-002
INV-PERSIST-001
INV-ARCH-001

## 允许范围

- 允许：本计划 `verification.md`、计划状态、产品/设计/ADR/架构/不变量中的事实性同步。
- 允许：直接覆盖本计划新增场景的测试证据和稳定验证记录。
- 禁止：伪造测试结果、删除原有未提交改动、提交或推送 Git。

## 完成条件

- 观战功能和三项不变量补强均有实现、测试和文档证据。
- `pnpm harness:check`、`pnpm harness:test`、`pnpm check`、受影响 targeted tests 和按风险需要的 `pnpm check:full`/`pnpm test:e2e` 通过。
- 未完成事项、范围外内容和 Git 状态明确记录。

## 验证命令

- `pnpm harness:check`
- `pnpm harness:test`
- `pnpm check`
- `pnpm check:full`
- `pnpm test:e2e`

## 文档影响

产品规格、设计、不变量、ADR、执行计划和证据。
