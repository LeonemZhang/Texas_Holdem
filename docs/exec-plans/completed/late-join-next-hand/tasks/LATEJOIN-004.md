# LATEJOIN-004 — 全链路验收与 Harness 证据

## 规范来源

- [执行计划地图](../../../../exec-plans/index.md)
- [玩法规格](../../../../product-specs/gameplay.md)
- [房间体验规格](../../../../product-specs/room-experience.md)
- [系统不变量](../../../../../INVARIANTS.md)

## 相关不变量

- INV-AUTH-001
- INV-AUTH-002
- INV-HAND-001
- INV-PROTO-001
- INV-PERSIST-001
- INV-ROOM-001
- INV-ROOM-002

## 允许范围

- 允许：`e2e/` 中与加入/下一局资格直接相关的测试 hunk、`docs/exec-plans/active/late-join-next-hand/verification.md`、必要的 `docs/verification/` 稳定证据和本计划状态表。
- 禁止：借验收修复无关失败、扩大到其他 active plan、删除或覆盖既有 dirty changes、提交或推送 Git。

## 完成条件

- 覆盖新玩家在当前手加入、hand-ready 加入、显式准备后进入下一手、未准备不进入、满座/重复身份/关闭房间拒绝和旧玩家恢复不回归。
- 记录 Host、客户端和必要 E2E targeted tests，以及 `pnpm harness:check`、`pnpm harness:test`、`pnpm check` 的真实结果。
- verification 为每个 `done` 任务提供唯一标题、覆盖不变量、场景、执行方式、覆盖状态和 Markdown 证据链接。
- 最终 Git 状态明确区分本计划改动与既有工作区改动；不提交、不推送。

## 验证命令

- `pnpm harness:check`
- `pnpm harness:test`
- 受影响 workspace targeted tests
- `pnpm check`
- 按环境需要运行 `pnpm test:e2e`

## 文档影响

执行计划和验收证据；完成前复核产品规格、设计、ADR、不变量和其他 active plan 是否需要同步，但不修改无关计划。
