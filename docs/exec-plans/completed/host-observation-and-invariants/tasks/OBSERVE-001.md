# OBSERVE-001 — Host 公共观战快照

## 规范来源

- [房间体验规格](../../../../product-specs/room-experience.md)
- [协议与同步设计](../../../../design-docs/protocol-and-sync.md)
- [系统不变量](../../../../../INVARIANTS.md)
- [ADR-008](../../../../decisions/ADR-008-host-participation.md)

## 相关不变量

INV-AUTH-003
INV-ROOM-003

## 允许范围

- 允许：`packages/protocol/src/host-snapshot.ts` 及其测试；`apps/host/src/application/snapshot-projector.ts` 及其测试；必要的 Host snapshot Socket/运行时测试 hunk。
- 允许：为公开观战增加只读公共结算信息和公开摊牌底牌字段。
- 禁止：公开未摊牌底牌、牌组顺序、Player legal actions；修改下注、结算或发牌规则。

## 完成条件

- Host 快照包含完整只读观战所需的公共牌、底池、街道、行动者、行动倒计时、玩家状态/下注和公开摊牌信息。
- 未公开底牌、牌组顺序和玩家专属操作字段不能出现在 Host schema 或投影中。
- 服务型 Host 和参与型 Host 的 Host 会话均可获得该快照。

## 验证命令

- `pnpm --filter @texas-holdem/protocol test`
- `pnpm --filter @texas-holdem/host test`
- `pnpm check`

## 文档影响

设计、不变量、执行计划和证据；由 `OBSERVE-005` 统一回填。
