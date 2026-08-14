# ROOMHOST-006 — 跨边界回归、运行证据与计划收口

## 规范来源

- [房间体验规格](../../../../product-specs/room-experience.md)
- [协议与同步设计](../../../../design-docs/protocol-and-sync.md)
- [持久化与恢复设计](../../../../design-docs/persistence-and-recovery.md)
- [系统不变量](../../../../../INVARIANTS.md)
- [执行计划地图](../../../index.md)

## 相关不变量

INV-AUTH-001
INV-AUTH-002
INV-AUTH-003
INV-PROTO-001
INV-ROOM-001
INV-ROOM-002
INV-ROOM-003
INV-ROOM-004
INV-PERSIST-001
INV-ARCH-002

## 允许范围

- 允许：`apps/host/src/**/*.test.ts`、`packages/protocol/src/**/*.test.ts`、`apps/client/src/**/*.test.tsx`、`apps/desktop/src/**/*.test.ts` 中直接覆盖本计划场景的测试。
- 允许：`e2e/` 中新增或修改服务型房主创建、对局、断线和恢复场景；`docs/verification/` 中新增稳定运行证据。
- 允许：本计划 `verification.md`、相关产品/设计/ADR/不变量文档的事实性收口和 `docs/exec-plans/index.md` 状态同步。
- 禁止：通过修改无关生成报告、删除并行任务文件或弱化 schema/lint/typecheck 来制造门禁通过。

## 完成条件

- 自动化覆盖：服务型房主创建后无房主玩家；两名实际玩家加入并准备后可开局；未满足实际玩家条件时不能开局。
- 自动化覆盖：Host 管理快照不包含玩家私有底牌；Player 快照仍只包含本人私有信息；重复 Host/Player 命令仍幂等。
- 自动化覆盖：Host 控制会话断线不停止运行中的房间；同一设备可恢复；其他设备不能接管；正常关闭和异常中断可区分。
- 自动化覆盖：旧 `参与游戏` 记录恢复不回归，参与游戏模式仍保留房主玩家行为，浏览器不能创建或控制 Host。
- 完成 targeted tests、`pnpm harness:check`、`pnpm harness:test`、`pnpm check`；按风险需要运行 `pnpm check:full` 和 `pnpm test:e2e`。
- 在 `verification.md` 为每个完成任务保留唯一同名证据段落，并把覆盖状态从 `gap` 更新为实际结果；未完成或环境受阻项不得伪造为通过。

## 验证命令

- `pnpm --filter @texas-holdem/protocol test`
- `pnpm --filter @texas-holdem/host test`
- `pnpm --filter @texas-holdem/client test`
- `pnpm --filter @texas-holdem/desktop test`
- `pnpm test:e2e`
- `pnpm harness:check`
- `pnpm harness:test`
- `pnpm check`
- `pnpm check:full`

## 文档影响

- 证据：更新本计划 `verification.md` 和必要的 `docs/verification/` 稳定证据。
- 产品规格、设计、ADR 和不变量：只按已验证的实际行为收口，不用计划文本替代运行证据。
- 执行计划：全部任务完成后才可从 `active/` 归档；若取消或被新事实取代，按 Harness 生命周期规则处理。
