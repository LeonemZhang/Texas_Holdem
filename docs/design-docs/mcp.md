# MCP 适配器设计

MCP (Model Context Protocol) 适配器是一个 stdio JSON-RPC 服务，允许外部 AI Agent 以普通玩家身份接入 Texas Hold'em 房间进行对局。

## 职责边界

- **负责**：以普通玩家身份加入/恢复房间、提交合法动作、等待回合、设置 hand-ready、离开房间。
- **不负责**：创建房间、踢人、修改房间设置、管理房间生命周期——这些是 Host（人类玩家或 Host UI）的职责。

## 架构约束

- 不依赖 `poker-core`、React、Electron、Fastify 或 SQLite。
- 仅依赖 `@texas-holdem/protocol`（类型与 schema）、`socket.io-client`（传输）、`zod`（验证）和 `@modelcontextprotocol/sdk`（MCP 协议层）。
- **每个 MCP 进程控制一个 AI 玩家**。不支持一个进程管理多个会话——这保持生命周期简单：Agent 启动一个 MCP Server 进程，该进程即代表该 AI 玩家。

## 多 AI 玩家方案

多 AI 玩家通过对等扩展实现：

```
Agent A          Agent B          Agent C
   |                |                |
MCP Server A    MCP Server B    MCP Server C
   |                |                |
   +--------+-------+-------+--------+
            |               |
        Texas Hold'em Host (Socket.IO + HTTP)
```

- 每个 AI 玩家由**独立的 Agent** 控制。
- 每个 Agent 启动**一个 MCP Server 进程**（`node apps/mcp-server/dist/index.js`）。
- 每个 MCP Server 调用 `poker_connect` 加入同一个房间。
- Host 将每个 MCP 连接视为一个独立的普通玩家——不区分人类和 AI。

不需要额外的进程编排或路由层。Agent 编排者（如 Claude、GPT 等）负责管理多个 MCP Server 实例。

## MCP 工具

共 8 个工具，覆盖完整玩家生命周期：

| 工具                      | 描述                                 | 关键参数                                            |
| ------------------------- | ------------------------------------ | --------------------------------------------------- |
| `poker_connect`           | 加入房间（或断线恢复）               | `hostUrl`, `nickname?`, `resumeToken?`              |
| `poker_lobby_ready`       | 在首局开始前设置大厅就绪状态         | 无                                                  |
| `poker_observe`           | 获取当前游戏状态摘要                 | 无                                                  |
| `poker_submit_action`     | 提交下注动作                         | `action`（fold/check/call/raise/all-in）, `amount?` |
| `poker_submit_hand_ready` | 设置 hand-ready 状态                 | `choice`（ready/sitting-out）                       |
| `poker_show_hole_cards`   | showdown 后亮底牌                    | 无                                                  |
| `poker_wait_turn`         | 阻塞直到轮到该玩家或 hand-ready 阶段 | `timeoutMs?`（默认 30s，最大 55s）                  |
| `poker_leave`             | 离开房间并断开连接                   | 无                                                  |

### Agent 主循环

```
poker_connect(hostUrl, nickname)
 |
loop:
  poker_wait_turn(timeoutMs)
    -> reason="lobby-ready": poker_lobby_ready
    -> reason="your-turn": 到我了，继续
    -> reason="hand-ready": poker_submit_hand_ready
    -> reason="timeout": 继续等待或 poker_leave
  poker_observe()
    -> 分析 snapshot，决定动作
  poker_submit_action(action, amount?)
 | (直到对局结束)
poker_leave()
```

### 动作校验与冲突重试

- `poker_submit_action` 在构建命令前会检查 `LegalActions`：如果当前不可用的动作会被提前拒绝（如 `canFold: false` 时 fold 会返回 `NOT_YOUR_TURN`）。
- 提交命令后如果 Host 返回 `conflict`（版本冲突），会采用 Host 返回的 `currentVersion` 更新 `expectedVersion`，最多额外重试 2 次。
- Host 返回 `resync-required` 时不自动重试；工具会把 `currentVersion`、`latestSequence` 和错误详情原样交给调用方，由 Agent 决定重新连接、观察最新快照或退出。

### 会话与断线行为

- 快照按 `sequence` 顺序接受，旧快照不会覆盖较新的对局状态。
- 每次提交保留 `commandId`；非法响应、ACK 超时或断线都会返回结构化拒绝结果，而不是静默丢失命令。
- 每次提交的 `commandId` 包含随机 UUID；即使 MCP 进程重启后用同一 `playerId` 恢复，也不会命中 Host 的 `playerId + commandId` 幂等缓存。
- `poker_lobby_ready` 被 Host 接受后会在新 `stateVersion` 快照到达前抑制重复的大厅准备提示，避免重复提交。
- `poker_submit_hand_ready` 在 hand-ready 阶段设置参与下一局的选择；准备截止后，筹码满足当前大盲的玩家仍可从 `sitting-out` 改为 `ready`，已确认的当前窗口选择不会触发重复提示。
- `poker_wait_turn` 对超时、快照和断线使用统一的清理逻辑；断线返回 `DISCONNECTED`，不会悬挂 Promise。
- `poker_leave` 返回 Host 的真实响应。Host 接受或连接已不可用时才执行本地断线；普通业务拒绝会保留连接状态。
- `poker_wait_turn` 的 MCP callTool 客户端超时应高于工具的 `timeoutMs`，且 `timeoutMs` 最大为 55 秒。

### 状态摘要

`poker_observe` 返回 AI 玩家视角的关键信息：

- `roomId`, `playerId`, `sequence`, `stateVersion`, `expectedVersion`, `handId`：定位和同步当前快照
- `phase`, `street`, `completedHands`：房间阶段、当前街和已完成手数
- `myHand`：AI 的底牌（`["As", "Ks"]` 格式）
- `communityCards`：公共牌
- `totalPot`：底池总额
- `myChips`, `mySeatIndex`, `myLobbyReady`, `myStreetCommitted`, `myTotalCommitted`：自己的座位、大厅准备状态、筹码和投入
- `currentActorId`, `actionDeadlineMs`：当前行动者和截止时间
- `isMyTurn`：是否该自己行动
- `legalActions`：合法动作（canFold/canCheck/callAmount/minimumRaiseTo/maximumRaiseTo/canAllIn）
- `handReady`：hand-ready 阶段信息
- `players`：所有玩家摘要（playerId/nickname/chips/status/seatIndex/lobbyReady/streetCommitted/totalCommitted/actionOrder/lastAction）
- `settlement`：结算信息（如有）

## 传输与认证

```
MCP Server (stdio) -> Host (HTTP + Socket.IO)
```

1. `poker_connect` 通过 HTTP 调用 `/api/bootstrap` 验证 Host 可用性。
2. 通过 HTTP POST 调用 `/api/rooms/current` -> `/api/rooms/{roomId}/join` 获得 session token。
3. 用 session token 建立 WebSocket (Socket.IO) 连接，join 到房间 `{ roomId, playerId, token }`。
4. 连接后通过 `state:snapshot` 事件接收 `PlayerSnapshot`，通过 `command:submit` 事件发送命令并等待 `CommandResponse`。
5. `poker_connect` 支持 `resumeToken` 参数以恢复断线会话（调用 `/api/rooms/{roomId}/resume`）。新建玩家必须提供 `nickname`；恢复时默认沿用原昵称，只有需要改名时才传 `nickname`。

## 目录结构

```
apps/mcp-server/
  src/
    index.ts              # 入口：启动 stdio transport
    mcp-server.ts         # 注册 8 个 MCP 工具 + snapshot 摘要 + 冲突重试
    session.ts            # PlayerSession：Socket 生命周期、快照缓存、expectedVersion 跟踪
    socket-client.ts      # HTTP join/resume + Socket.IO 连接
    command-factory.ts    # 构建带合法动作校验的下注/亮牌/准备命令
    __tests__/
      command-factory.test.ts   # 命令构建测试
      session.test.ts           # 会话、快照、冲突、超时和断线测试
      socket-client.test.ts     # HTTP 恢复身份和响应 schema 测试
      mcp-server.test.ts        # MCP 工具注册、恢复、观察、准备和离开测试
      closed-loop.e2e.test.ts   # 真实 Host + stdio MCP Agent 三手牌闭环
      fixtures/
        host-parent-port-shim.mjs # 测试进程到 Host 正式管理入口的 IPC 桥
  package.json
  tsconfig.json / tsconfig.build.json
  vitest.config.ts / vitest.closed-loop.config.ts
```

## 真实闭环验证

`pnpm --filter @texas-holdem/mcp-server test:closed-loop` 先构建 Host 及其依赖和 MCP Server，再在临时数据目录中启动生产 Host 子进程与独立 stdio MCP Server 子进程。测试中的确定性 Agent 只通过 8 个 MCP 工具观察和行动；房主测试端通过真实 HTTP 与 Socket.IO 操作，不直接调用 Host 领域对象。

固定场景连续完成三手牌，每手优先 check/call 并断言实际经过 preflop、flop、turn、river 和结算。第一手结束后同时关闭 Host 与 MCP 进程；新 Host 使用同一数据目录，通过生产 Host 的 `room-record.recover` 管理入口从 SQLite 恢复房间，新 MCP 进程从临时恢复文件读取 `resumeToken`，并断言双方都恢复到原 `roomId`、`playerId` 后继续对局。最终再次停止 Host 并以只读方式检查其 SQLite：房间保持可恢复状态、两名玩家与双方重连身份存在、`hand_summaries` 恰有三条、权威快照已持续写入且总筹码守恒。临时数据库和恢复文件在测试结束后清理。

测试夹具只把 Node 子进程 IPC 适配成桌面运行时使用的 `parentPort` 形状，房间恢复仍执行 Host 的正式管理 schema、恢复服务和 SQLite 实现。该场景证明 MCP 进程身份恢复和 Host 本地持久化可以在双方进程都重启后共同维持连续对战；它不把模型调用放入 MCP，也不复制桌面端的恢复业务逻辑。

## 版本

- MCP Server 版本号跟随主应用：`1.0.4`
- 协议版本：`protocolVersion: '3'`
- 使用 `@modelcontextprotocol/sdk` ^1.30.0
