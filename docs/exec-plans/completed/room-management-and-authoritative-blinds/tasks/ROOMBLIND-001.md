# ROOMBLIND-001 — 权威当前盲注与动态房间配置

## 规范来源

- [房间体验规格](../../../../product-specs/room-experience.md)
- [玩法规格](../../../../product-specs/gameplay.md)
- [房间领域设计](../../../../design-docs/room-domain.md)
- [系统不变量](../../../../../INVARIANTS.md)

## 相关不变量

- INV-AUTH-001
- INV-ROOM-001
- INV-PERSIST-001
- INV-HAND-003

## 允许范围

- 允许：`packages/poker-core/src/table/blinds.ts`、`apps/host/src/domain`、`apps/host/src/application`、`apps/host/src/persistence`、`packages/protocol/src` 及其 targeted tests。
- 禁止：客户端视觉布局、Android/mobile Host、下注和结算算法。

## 完成条件

- 房间状态保存基础小盲、权威当前小/大盲和下一增长阈值。
- 首局开始后房主可修改动态字段与当前小盲；初始筹码、人数上限和基础小盲由服务端锁定。
- 当前牌局使用的盲注不因配置修改改变；下一局从权威当前级别开始，增长不回算历史。
- 快照、SQLite 快照恢复和计时调度保持一致。

## 验证命令

- `pnpm --filter @texas-holdem/poker-core typecheck`
- `pnpm --filter @texas-holdem/poker-core test`
- `pnpm --filter @texas-holdem/host typecheck`
- `pnpm --filter @texas-holdem/host test`
- `pnpm --filter @texas-holdem/protocol typecheck`
- `pnpm --filter @texas-holdem/protocol test`

## 文档影响

产品规格、设计、ADR、执行计划和验收证据；由主 agent 维护。
