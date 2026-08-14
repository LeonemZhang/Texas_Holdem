# OBSERVE-002 — Windows Host 只读观战牌桌

## 规范来源

- [房间体验规格](../../../../product-specs/room-experience.md)
- [客户端设计](../../../../design-docs/client.md)
- [系统不变量](../../../../../INVARIANTS.md)

## 相关不变量

INV-AUTH-003
INV-ROOM-004

## 允许范围

- 允许：`apps/client/src/room/HostSpectatorRoom.tsx`、对应测试、`apps/client/src/App.tsx` 的 Host 入口 hunk 和 `apps/client/src/app.css` 的观战样式。
- 允许：复用已有 `PokerTableLayout`、`TableSeats`、`CardsAndPots` 和 `PlayingCard` 组件。
- 禁止：下注/筹码交换/玩家准备控件；改变玩家 GameRoom 行为或浏览器 Host 能力边界。

## 完成条件

- 服务型 Host 可从 HostConsole 进入观战牌桌，实时看到公共牌桌布局、玩家行动、底池、倒计时和公开摊牌信息。
- 观战页面无玩家操作控件、未公开底牌和 legal actions；断线时保持恢复锁定。
- 参与型 Host 保持原有可操作玩家牌桌，不回归。

## 验证命令

- `pnpm --filter @texas-holdem/client exec vitest run src/room/HostSpectatorRoom.test.tsx src/room/HostConsole.test.tsx src/App.test.tsx`
- `pnpm --filter @texas-holdem/client typecheck`
- `pnpm check`

## 文档影响

产品规格、客户端设计、ADR、执行计划和证据；由 `OBSERVE-005` 统一回填。
