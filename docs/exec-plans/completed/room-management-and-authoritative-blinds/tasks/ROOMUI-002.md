# ROOMUI-002 — 房主大厅、局内管理与观战牌桌

## 规范来源

- [房间体验规格](../../../../product-specs/room-experience.md)
- [桌面体验规格](../../../../product-specs/desktop-experience.md)
- [客户端设计](../../../../design-docs/client.md)

## 相关不变量

- INV-AUTH-001
- INV-PROTO-001

## 允许范围

- 允许：`apps/client/src/room`、`apps/client/src/table`、`apps/client/src/App.tsx`、`apps/client/src/app.css` 及其 targeted tests。
- 禁止：协议字段、Host 领域、产品文档和验收证据。

## 完成条件

- 创建表单参与方式为默认参与的左右 tab。
- 服务型房主大厅复用参与型等待页能力，开始后默认观战；观战返回大厅并在右上角与房间管理相邻。
- 观战结算可收起，不提供玩家准备/暂不参与操作，结算中已有公开底牌不重复显示在牌桌。
- 参与型和服务型房主在牌局内可打开同一房间管理面板，动态字段和当前小盲回填、锁定与提交正确；当前小盲最低不低于基础小盲，填写上限后不超过小盲上限，首局大厅隐藏当前小盲。

## 验证命令

- `pnpm --filter @texas-holdem/client typecheck`
- `pnpm --filter @texas-holdem/client test`

## 文档影响

产品规格、设计和验收证据由主 agent 维护；本任务只修改客户端实现与测试。
