# ROOMHOST-005 — Windows 客户端创建、Host 控制台与能力边界

## 规范来源

- [房间体验规格](../../../../product-specs/room-experience.md)
- [客户端设计](../../../../design-docs/client.md)
- [桌面与响应式体验](../../../../product-specs/desktop-experience.md)
- [系统不变量](../../../../../INVARIANTS.md)

## 相关不变量

INV-AUTH-003
INV-ARCH-002
INV-PROTO-001
INV-ROOM-001
INV-ROOM-003
INV-ROOM-004

## 允许范围

- 允许：`apps/client/src/runtime.ts`、`App.tsx`、`home/ConnectionHome.tsx`、`room/DesktopRoomSetup.tsx`、`room/GameRoom.tsx`、`room/HostControls.tsx`、`room/RoomRecordManager.tsx`、相关连接/会话适配器和对应测试。
- 允许：`apps/desktop/src/shared/runtime.ts`、preload/主进程房间记录恢复边界及直接相关测试。
- 允许：为 `canHost`、`canControlRoom`、`canPlay` 能力和 Host 管理会话增加必要的窄桥接 schema；浏览器适配器必须显式拒绝 Host 创建和控制。
- 禁止：修改扑克规则、Host 权威算法、SQLite schema、Android Host、中心服务器、全局视觉重做和外部远程 HTML 加载。

## 完成条件

- Windows 创建房间表单可选择房主参与模式，并把选择提交给 Host；Player 加入流程保持现有昵称确认和身份恢复语义。
- 服务型 Host 进入独立的 Host 控制台，使用 Host 管理快照，不渲染房主玩家卡片、筹码、准备状态或玩家私有底牌。
- Player 牌桌仍只显示实际玩家座位；参与游戏模式保留原房主玩家体验。
- Host 控制会话断线时控制台锁定并按 Host 身份恢复，服务进程仍可继续为玩家服务；浏览器不能创建或控制 Host。
- Electron renderer 继续通过 schema 校验的窄 bridge 访问 Host 能力，未扩大 Node、文件系统或 SQLite 权限。

## 验证命令

- `pnpm --filter @texas-holdem/client exec vitest run src/App.test.tsx src/runtime.test.ts src/home/ConnectionHome.test.tsx src/room/DesktopRoomSetup.test.tsx src/room/GameRoom.test.tsx src/room/HostControls.test.tsx src/room/RoomRecordManager.test.tsx`
- `pnpm --filter @texas-holdem/desktop exec vitest run src/shared/runtime.test.ts src/main/room-record-recovery.test.ts`
- `pnpm check`

## 文档影响

- 设计：若能力化 Runtime Adapter、Host 控制台或恢复锁定语义变化，必须同步客户端设计和桌面设计。
- 产品规格：若 UI 可观察行为变化，必须同步房间体验规格；不得把内部受信任边界写成用户提示。
