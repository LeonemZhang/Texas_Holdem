# ROOMDOC-003 — 规范同步与最终验收

## 规范来源

- [产品规格索引](../../../../product-specs/index.md)
- [设计文档索引](../../../../design-docs/index.md)
- [决策索引](../../../../decisions/index.md)
- [仓库不变量](../../../../../INVARIANTS.md)

## 相关不变量

- INV-AUTH-001
- INV-PROTO-001
- INV-PERSIST-001

## 允许范围

- 允许：本计划目录、受影响产品规格、设计文档、ADR、`docs/verification`。
- 禁止：借文档验收扩大代码范围、修改无关计划或覆盖并行任务改动。

## 完成条件

- 文档明确区分基础盲注、权威当前盲注和增长调度，不再描述按历史回算当前盲注。
- 文档明确服务型房主大厅/观战/返回大厅/局内管理行为。
- targeted tests、Harness、架构、格式、lint、typecheck 和按风险选择的完整检查结果可追溯。

## 验证命令

- `pnpm harness:check`
- `pnpm harness:test`
- `pnpm check`
- 受影响 workspace targeted tests。

## 文档影响

产品规格、设计、ADR、执行计划和验证证据；全部由主 agent 完成。
