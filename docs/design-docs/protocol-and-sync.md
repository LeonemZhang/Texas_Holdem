# 协议与同步设计

`packages/protocol` 定义网络命令、事件、玩家快照、房间发现报文和房主管理消息。Electron IPC bridge 及其输入 schema 由 `apps/desktop/src/shared/runtime.ts` 定义，供主进程、preload 与 renderer 共用；两类边界的运行时类型都必须从各自 schema 推导，不能另外维护漂移的手写传输类型。当前线协议版本为 `3`。

## 命令

每个修改状态的请求必须包含：

- `commandId`：客户端生成的唯一标识，用于幂等去重。
- `roomId`、`playerId` 和会话身份。
- `expectedVersion`：客户端所知的房间状态版本。
- 命令类型和通过 schema 校验的载荷。

命令集合覆盖：

- `SetLobbyReady`、`StartFirstHand`、`SetPreHandReady`。
- `Fold`、`Check`、`Call`、`RaiseTo`、`AllIn`。
- `RequestChips`、`GrantChips`、`ApproveChipRequest`、拒绝和撤销。
- `ShowHoleCards`、`LeaveRoom`、`CloseRoom`。
- `UpdateRoomSettings`、`room.reseat-player`、`room.shuffle-seats`。

协议只描述命令的输入、输出和版本，不重新解释房间或扑克规则；业务验证留在房间领域和 `poker-core`。换座与随机座位只接受房主在大厅阶段提交，筹码请求必须带具体 `targetPlayerId`。

## 事件与快照

服务端接受命令后产生一个或多个顺序事件，每个事件带单调递增 `sequence`；每次状态变化增加 `stateVersion`。同一 `commandId` 最多生效一次，客户端不能依赖 Socket.IO 重试来保证业务幂等。

客户端短时重连优先补发缺失事件；无法连续补发时发送该玩家专属完整快照。快照必须过滤其他玩家底牌、牌组顺序和未公开信息；牌桌展示所需的总池、各街投入、结算净变化、当前玩家牌型和最佳五张牌均由服务端投影。

`room.smallBlind`/`room.bigBlind` 表示当前局或下一局实际生效级别，`room.settings` 保留房间基准配置；牌局准备资格、下一局创建和状态行显示必须共享有效级别。大厅快照包含完整房间配置，供房主编辑表单回填；人数上限不能低于当前玩家数，初始筹码更新同步大厅玩家余额但不改变准备状态。

`PlayerSnapshot.chipActivity` 是包含服务端权威毫秒时间戳的完整公开历史，`chipRequests` 只保留当前可操作请求。协议 v1、v2 和缺少筹码历史时间戳的旧恢复快照不兼容，必须明确拒绝，不使用宽泛类型兜底。

仅在服务端确认摊牌结算后，才向玩家公开仍有资格竞争底池者的两张底牌。弃牌提前结束时快照保留已公开公共牌但不补发后续牌；若无人可继续行动，服务端补齐公共牌至河牌后再结算。结算到下一局开始的窗口内，玩家只能通过服务端校验的主动摊牌命令公开本人的两张底牌；该结果不可撤销，不改变结算。弃牌获胜时只有主动摊牌赢家的服务端评估进入牌型记录。

## 边界与兼容

- 客户端、服务端和 UDP 报文通过 `packages/protocol` 校验；桌面 IPC 参数通过 `apps/desktop/src/shared/runtime.ts` 的 schema 校验。
- 协议层不导入 `apps/host`、`apps/client`、Electron 或 Socket.IO 实现。
- 网络消息和恢复快照均视为不可信输入；版本不兼容或字段缺失时返回明确错误。
- 仅在协议确认后更新客户端事件游标和快照版本，不以本地草稿改写权威状态。

## 相关不变量

- `INV-AUTH-001`、`INV-AUTH-002`
- `INV-PROTO-001`
- `INV-ROOM-001`
