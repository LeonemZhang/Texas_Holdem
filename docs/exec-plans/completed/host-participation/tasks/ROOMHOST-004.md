# ROOMHOST-004 — SQLite 迁移、Host 恢复与生命周期

## 规范来源

- [房间体验规格](../../../../product-specs/room-experience.md)
- [持久化与恢复设计](../../../../design-docs/persistence-and-recovery.md)
- [本地优先持久化 ADR](../../../../decisions/ADR-003-local-persistence.md)
- [系统不变量](../../../../../INVARIANTS.md)

## 相关不变量

INV-ROOM-001
INV-ROOM-002
INV-ROOM-003
INV-PERSIST-001

## 允许范围

- 允许：`apps/host/src/persistence/migrations.ts`、`sqlite-database.ts`、`sqlite-game-runtime-store.ts`、`sqlite-reconnect-identity-store.ts`、`sqlite-room-lifecycle-store.ts`、`sqlite-room-record-catalog.ts`、`sqlite-room-recovery-catalog.ts`、`sqlite-snapshot-store.ts` 及直接相关测试。
- 允许：`apps/host/src/application/room-record-management.ts`、`room-recovery.ts` 及其直接相关测试。
- 允许：为旧记录默认值、Host 身份摘要和参与模式增加的 SQLite migration/adapter 类型。
- 禁止：跨设备同步、导入导出、Host 接管、Android 数据库、中心服务器数据库、UI 和扑克规则。

## 完成条件

- SQLite 保存房主参与模式、独立 Host 身份和 Host 恢复令牌摘要；服务型 Host 不写入玩家座位或筹码记录。
- 旧记录缺少新字段时安全默认到 `参与游戏`，可继续恢复；不把旧记录静默转换为服务型房主。
- Host 控制会话断线不写入 `CLOSED` 或 `INTERRUPTED`；Host 进程正常关闭和异常退出保持现有区别。
- 同一房主设备可恢复 Host 会话和玩家记录；其他设备不能凭昵称、玩家令牌或房间地址接管 Host。
- 事件、快照、统计、筹码转移和恢复写入继续满足确认前持久化，且不改变玩家筹码守恒。

## 验证命令

- `pnpm --filter @texas-holdem/host exec vitest run src/persistence/migrations.test.ts src/persistence/sqlite-database.test.ts src/persistence/sqlite-game-runtime-store.test.ts src/persistence/sqlite-reconnect-identity-store.test.ts src/persistence/sqlite-room-lifecycle-store.test.ts src/persistence/sqlite-room-record-catalog.test.ts src/persistence/room-recovery.test.ts`
- `pnpm check`

## 文档影响

- 设计：若 schema、恢复或生命周期事实变化，必须同步持久化与恢复设计和 ADR-008。
- 不变量：由 ROOMHOST-006 回填 INV-ROOM-002、INV-ROOM-003 和 INV-PERSIST-001 证据。
