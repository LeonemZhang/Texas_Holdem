# LATEJOIN-003 — 客户端加入与等待下一局体验

## 规范来源

- [房间体验规格](../../../../product-specs/room-experience.md)
- [桌面与响应式体验](../../../../product-specs/desktop-experience.md)
- [客户端设计](../../../../design-docs/client.md)
- [协议与同步设计](../../../../design-docs/protocol-and-sync.md)
- [系统不变量](../../../../../INVARIANTS.md)

## 相关不变量

- INV-AUTH-001
- INV-AUTH-002
- INV-ROOM-001
- INV-ROOM-002

## 允许范围

- 允许：`apps/client/src/App.tsx`、`apps/client/src/room/GameRoom.tsx`、`apps/client/src/room/HandReadyOverlay.tsx`、必要的 `apps/client/src/room`/`apps/client/src/table`/`apps/client/src/app.css` hunk 及其 targeted tests。
- 禁止：客户端自行计算下一局或参赛资格、修改 Host 权威、修改 `packages/poker-core`、新增独立观战者身份、Android Host 和无关视觉重做。

## 完成条件

- 进行中的房间仍可通过现有加入入口提交新昵称；恢复已有身份的流程保持优先且不被新加入流程替代。
- 新玩家在当前手看到明确的“等待下一局”状态，不显示本人底牌、下注操作、合法行动或当前手准备按钮。
- 进入下一次 `hand-ready` 后，新玩家看到并可提交“已就绪”或“本局暂不参与”；界面只消费 Host 快照，不本地推断手牌或下一局资格。
- 原有玩家、服务型 Host 观战、重连、退出和被移除体验不回归；快照中的新玩家公开状态与座位保持一致。

## 验证命令

- `pnpm --filter @texas-holdem/client test`
- `pnpm --filter @texas-holdem/client typecheck`
- 必要的 App、GameRoom、HandReadyOverlay、快照投影和加入流程 targeted tests。
- `pnpm check`

## 文档影响

客户端设计和本计划验收证据；不得在客户端文案或逻辑中创建第二套参赛规则。
