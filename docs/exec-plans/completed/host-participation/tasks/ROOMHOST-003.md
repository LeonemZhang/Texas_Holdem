# ROOMHOST-003 — Host/Player 协议、会话与管理快照

## 规范来源

- [协议与同步设计](../../../../design-docs/protocol-and-sync.md)
- [客户端设计](../../../../design-docs/client.md)
- [产品规格地图](../../../../product-specs/index.md)
- [系统不变量](../../../../../INVARIANTS.md)

## 相关不变量

INV-AUTH-001
INV-AUTH-002
INV-AUTH-003
INV-PROTO-001
INV-ROOM-001
INV-ROOM-003

## 允许范围

- 允许：`packages/protocol/src/room-session.ts`、`room-commands.ts`、`domain-events.ts`、`player-snapshot.ts`、`synchronization.ts`、`packages/protocol/src/*.test.ts` 中直接相关的 schema/类型测试。
- 允许：`apps/host/src/application/game-runtime.ts`、`room-command-handler.ts`、`session-authenticator.ts`、`reconnect-synchronizer.ts`、`snapshot-projector.ts`、`socket-publisher.ts`、`server.ts` 及其直接相关测试。
- 允许：必要的协议版本常量和 Host 管理快照专用模块；不得把 Host 管理快照塞入 PlayerSnapshot 的可选字段来绕过角色边界。
- 禁止：`apps/client` UI、Electron bridge、SQLite 迁移、`poker-core` 和中心服务器。

## 完成条件

- 创建、加入、恢复接口区分 Host 会话和 Player 会话；`hostId`、`playerId`、令牌和会话类型经过 schema 校验。
- Host 管理命令不再依赖 `hostPlayerId` 作为唯一权限凭证；重复 `commandId` 仍最多生效一次。
- 新增 Host 管理快照 schema 和服务端投影；服务型 Host 能看到管理和公共牌桌信息，但不能收到玩家专属底牌或牌组顺序。
- Player 快照、Player 重连门控、玩家私有信息和现有房主参与模式行为保持兼容。
- Host 控制会话的断线与 Player 断线分别处理；Host 控制会话恢复必须匹配 `roomId`、`hostId` 和不倒退的序列。

## 验证命令

- `pnpm --filter @texas-holdem/protocol exec vitest run src/room-session.test.ts src/room-commands.test.ts src/domain-events.test.ts src/player-snapshot.test.ts src/synchronization.test.ts`
- `pnpm --filter @texas-holdem/host exec vitest run src/application/game-runtime.test.ts src/application/room-command-handler.test.ts src/application/snapshot-projector.test.ts src/application/reconnect-synchronizer.test.ts src/server.test.ts`
- `pnpm check`

## 文档影响

- 设计：若实际 schema 或兼容边界与设计文档不一致，必须同步协议与同步、客户端设计和 ADR-008。
- 不变量：由 ROOMHOST-006 回填 INV-AUTH-003、INV-ROOM-003 的测试证据。
