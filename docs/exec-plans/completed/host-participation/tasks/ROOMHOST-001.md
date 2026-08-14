# ROOMHOST-001 — 建立房主参与模式产品与架构契约

## 规范来源

- [产品规格地图](../../../../product-specs/index.md)
- [房间体验规格](../../../../product-specs/room-experience.md)
- [架构入口](../../../../../ARCHITECTURE.md)
- [产品决策索引](../../../../decisions/index.md)
- [系统不变量](../../../../../INVARIANTS.md)

## 相关不变量

INV-AUTH-003
INV-ROOM-003
INV-ROOM-004

## 允许范围

- 允许：`docs/product-specs/room-experience.md`、`ARCHITECTURE.md`、`docs/decisions/index.md`、`docs/decisions/ADR-008-host-participation.md`、`docs/design-docs/room-domain.md`、`docs/design-docs/protocol-and-sync.md`、`docs/design-docs/persistence-and-recovery.md`、`docs/design-docs/client.md`、`INVARIANTS.md`。
- 允许：本计划目录 `docs/exec-plans/active/host-participation/**` 和 `docs/exec-plans/index.md`。
- 禁止：任何 `apps/*`、`packages/*`、`poker-core`、Android Host、中心服务器、数据库实现和 UI 代码。

## 完成条件

- 产品规格明确两种房主参与模式、固定时机、人数/座位/筹码/准备门禁、控制会话断线、异常中断和旧记录兼容语义。
- ADR-008 明确 Host/Player 身份分离、Host 管理快照边界、Windows 首期范围和 Android/mobile 排除范围。
- 房间领域、协议同步、持久化恢复和客户端设计分别写出实现边界，不把实现细节重新写成产品规则。
- 新增 INV-AUTH-003、INV-ROOM-003 和 INV-ROOM-004，并明确当前覆盖缺口、责任边界和后续任务。
- 计划包含唯一状态表、稳定任务 ID、任务依赖、允许/禁止路径、targeted tests、`pnpm check` 和逐任务证据要求。

## 验证命令

- `pnpm harness:check`
- `pnpm harness:test`
- `pnpm exec prettier --check ARCHITECTURE.md INVARIANTS.md docs/product-specs/room-experience.md docs/decisions/index.md docs/decisions/ADR-008-host-participation.md docs/design-docs/room-domain.md docs/design-docs/protocol-and-sync.md docs/design-docs/persistence-and-recovery.md docs/design-docs/client.md docs/exec-plans/index.md docs/exec-plans/active/host-participation/plan.md docs/exec-plans/active/host-participation/decisions.md docs/exec-plans/active/host-participation/verification.md docs/exec-plans/active/host-participation/tasks/ROOMHOST-001.md`
- `pnpm check`

## 文档影响

- 产品规格：新增房主参与模式。
- 设计：同步房间领域、协议同步、持久化恢复和客户端会话边界。
- 不变量：新增 Host 投影、身份分离和服务型房主不入玩家集合约束。
- ADR：新增 ADR-008。
- 执行计划：新增本计划并加入执行计划地图。
