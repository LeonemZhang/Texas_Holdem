# Host 观战与剩余不变量补强执行计划

> 生命周期：normal

## 目标

让仅提供服务的房主可以在 Windows Host 客户端进入只读观战牌桌，并补齐房间生命周期、持久化确认顺序和 workspace 依赖方向的自动化证据，同时保持 Host 权威性和玩家私有信息隔离。

## 范围

- 包含：Host 公共观战快照、Windows 只读观战牌桌、Host 控制台与观战入口、公共摊牌信息展示、生命周期跨 Host/desktop 集成证据、transport 级持久化确认顺序故障注入、workspace 依赖方向自动检查。
- 不包含：未公开玩家底牌、玩家下注控件、扑克规则或结算语义、Android Host、中心服务器、跨设备同步、Host 接管、MCP 生产逻辑。

## 依赖

- 外部前提：已完成的 `host-participation` 计划提供 Host 身份、Host 管理快照、HostConsole 和 SQLite 恢复基础。
- 外部前提：并行计划 `client-reconnection`、`current-hand-number`、`automatic-runout-street-reveal` 的既有实现继续作为只读依赖；本计划不改其专属规则和重连算法。
- 任务依赖：`OBSERVE-002` 依赖 `OBSERVE-001`；`OBSERVE-003`、`OBSERVE-004` 可在 `OBSERVE-001` 后并行验证；`OBSERVE-005` 依赖全部实现与测试任务。

## 任务状态

本表是本计划唯一的任务状态来源。

| ID          | Status | Depends                             | Affected                              | Acceptance                                                    | Detail                       |
| ----------- | ------ | ----------------------------------- | ------------------------------------- | ------------------------------------------------------------- | ---------------------------- |
| OBSERVE-001 | done   | -                                   | Host 公共观战快照、协议和 Host 投影   | 只读观战所需公共状态可持续快照化且无私有信息泄露              | [详情](tasks/OBSERVE-001.md) |
| OBSERVE-002 | done   | OBSERVE-001                         | Windows Host 观战牌桌、入口和 UI 测试 | 房主可进入完整只读牌桌，公共牌/行动/底池/公开摊牌信息实时可见 | [详情](tasks/OBSERVE-002.md) |
| OBSERVE-003 | done   | OBSERVE-001                         | Host/desktop 生命周期集成测试         | 正常关闭、异常中断、恢复和归档状态可跨边界区分                | [详情](tasks/OBSERVE-003.md) |
| OBSERVE-004 | done   | OBSERVE-001                         | 持久化确认顺序和 workspace 架构检查   | 故障注入不返回伪成功，依赖方向由自动门禁持续检查              | [详情](tasks/OBSERVE-004.md) |
| OBSERVE-005 | done   | OBSERVE-002,OBSERVE-003,OBSERVE-004 | 文档、验证证据和全量门禁              | 产品/设计/不变量/ADR/执行计划一致，所有目标测试和门禁通过     | [详情](tasks/OBSERVE-005.md) |
