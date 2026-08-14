# ADR-007 — Android/mobile 仅作为普通玩家客户端

## 决策

当前项目不实现、也不继续规划 Android/mobile 作为房主。房主能力继续由 Windows 客户端提供；手机端只通过现有浏览器连接既有 Host，不能创建 Host、管理房主记录、运行牌局服务或接管另一设备的房主身份。

Android 原生 Host 壳、前台 Host 服务、Android Host Runtime、原生 Host 记录桥接和 Android Host 专用 LAN 发现不进入后续实现范围。若未来重新提出 mobile 房主需求，必须重新提交产品决策和独立执行计划，不能恢复本次已回滚的实现。

## 原因与代码规模

现有权威 Host 不是单一 HTTP 入口，而是包含扑克规则、房间状态机、命令分发、权威快照、Socket.IO 会话、重连身份、SQLite 事件/快照/统计、异常恢复和 UDP 发现的完整运行时。改用 Kotlin Host 需要重新实现这些语义，不能只写一个 Android Service 外壳。

当前 TypeScript 行为规模约为：

- `apps/host/src`：103 个文件、约 15,000 行（含测试）；
- `packages/poker-core`：63 个文件、约 5,300 行；
- `packages/protocol`：25 个文件、约 2,000 行；
- `packages/lan-discovery`：10 个文件、约 900 行。

这些数字表示需要覆盖和回归验证的行为规模，不代表可以逐行机械翻译。Kotlin 版本还会额外承担 HTTP/Socket.IO 兼容、Android 生命周期、API29/API36 设备验证和双实现长期维护成本，因此当前不接受该方向的工程投入。

## 影响

- Windows 继续是唯一 Host 运行端和房主记录持有端；
- 浏览器和手机浏览器继续作为普通玩家入口；
- 不保留 Android Host 专用 Runtime capability、记录管理 bridge、前台 Host 服务和 Android Host POC；
- 现有扑克规则、协议、Windows Host 和浏览器行为不因本决策改变。
