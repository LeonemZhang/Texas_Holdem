# 详细设计地图

详细设计描述 HOW，不能重新定义产品行为。产品行为见 [`docs/product-specs/`](../product-specs/index.md)，硬不变量见 [`INVARIANTS.md`](../../INVARIANTS.md)。

| 文档                                                       | 负责边界                                    | 不负责                        |
| ---------------------------------------------------------- | ------------------------------------------- | ----------------------------- |
| [poker-domain.md](poker-domain.md)                         | 牌、座位、下注、底池、牌型和派彩原语        | 房间、协议、网络、SQLite、UI  |
| [hand-lifecycle.md](hand-lifecycle.md)                     | 一手牌和连续牌局的状态编排                  | 传输编码和客户端布局          |
| [room-domain.md](room-domain.md)                           | 房间设置、座位、准备、筹码、身份和生命周期  | Socket.IO、UDP、SQLite 适配器 |
| [protocol-and-sync.md](protocol-and-sync.md)               | 命令、事件、schema、快照和同步              | 重新定义房间规则              |
| [network-and-discovery.md](network-and-discovery.md)       | UDP 发现、网卡、IP 直连和健康检查           | 房间领域规则                  |
| [persistence-and-recovery.md](persistence-and-recovery.md) | 事件、快照、SQLite、记录和恢复              | UI 状态管理                   |
| [client.md](client.md)                                     | 状态适配、快照投影、牌桌和响应式            | 赢家、底池和阶段计算          |
| [desktop.md](desktop.md)                                   | Electron、preload、窗口、宿主进程和本机 IPC | 扑克规则                      |
| [mcp.md](mcp.md)                                           | MCP 玩家适配器、AI Agent 接入、多 AI 对局   | 房间管理、AI 决策逻辑         |

设计文档按 change locality 拆分；修改一个边界时不默认加载其他边界全文。
