# 房主参与模式与玩家身份分离执行计划

> 生命周期：normal

## 目标

在不改变扑克规则、Host 权威性、LAN 连接和本地记录边界的前提下，允许 Windows 房主在创建房间时选择“参与游戏”或“仅提供服务”，并让服务型房主拥有独立管理会话、恢复身份和管理快照，不进入玩家座位、筹码、准备、行动或统计。

## 范围

- 包含：房主参与模式产品契约、Host/Player 身份分离、房间领域、协议 schema、Host 管理会话与快照、SQLite 迁移与恢复、Windows 客户端创建/管理 UI、浏览器能力限制、跨边界测试和验证证据。
- 首期平台：现有 Windows Host、Windows 客户端和浏览器玩家。
- 不包含：扑克规则、盲注/下注/底池/结算、`poker-core` 算法、Android Host、Android 原生前台服务、中心服务器实现、跨设备记录同步或 Host 接管。
- 不改变：房主服务端唯一权威、Player 私有信息隔离、命令幂等、LAN discovery、正常关闭与异常中断的既有语义。

## 依赖

- 外部前提：现有 Host 已支持单房间运行、房主本地 SQLite 记录、Player 重连身份和按 Player 身份投影的 PlayerSnapshot。
- 外部前提：ADR-007 继续生效，Android/mobile 不在本计划获得 Host 能力。
- 并行协调：实现任务开始前必须重新检查 automatic-runout-street-reveal、client-reconnection 和 current-hand-number 的实际状态与文件差异；若同一文件有重叠改动，先拆分 hunk 或等待对应任务完成。
- 任务依赖：ROOMHOST-002 依赖 ROOMHOST-001；ROOMHOST-003 依赖 ROOMHOST-002；ROOMHOST-004 依赖 ROOMHOST-002；ROOMHOST-005 依赖 ROOMHOST-003、ROOMHOST-004；ROOMHOST-006 依赖 ROOMHOST-002、ROOMHOST-003、ROOMHOST-004、ROOMHOST-005。

## 任务状态

本表是本计划唯一的任务状态来源。

| ID           | Status | Depends                                             | Affected                              | Acceptance                                                             | Detail                        |
| ------------ | ------ | --------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------- | ----------------------------- |
| ROOMHOST-001 | done   | -                                                   | 产品、架构、ADR、不变量和计划契约     | 已确认的服务型房主语义写入规范，且不与 Android/mobile 当前决策冲突     | [详情](tasks/ROOMHOST-001.md) |
| ROOMHOST-002 | done   | ROOMHOST-001                                        | `apps/host/src/domain`                | 两种参与模式均能正确建模玩家集合、座位、筹码、准备和首局开始门禁       | [详情](tasks/ROOMHOST-002.md) |
| ROOMHOST-003 | done   | ROOMHOST-002                                        | `packages/protocol`、Host 会话和快照  | Host/Player 会话、命令授权、恢复门控和管理快照完成并保持私有信息隔离   | [详情](tasks/ROOMHOST-003.md) |
| ROOMHOST-004 | done   | ROOMHOST-002                                        | Host SQLite 迁移、记录和恢复          | 新旧记录可恢复，Host 身份独立持久化，服务进程与控制会话生命周期不混淆  | [详情](tasks/ROOMHOST-004.md) |
| ROOMHOST-005 | done   | ROOMHOST-003,ROOMHOST-004                           | Windows 客户端、Electron bridge 和 UI | 创建模式选择、服务型 Host 控制台、Player 入口和浏览器能力限制完成      | [详情](tasks/ROOMHOST-005.md) |
| ROOMHOST-006 | done   | ROOMHOST-002,ROOMHOST-003,ROOMHOST-004,ROOMHOST-005 | 跨边界测试、验证证据和最终文档同步    | 真实创建、对局、断线、恢复、旧记录和关闭场景通过，逐任务证据和规范一致 | [详情](tasks/ROOMHOST-006.md) |
