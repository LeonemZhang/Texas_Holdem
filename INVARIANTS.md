# Texas Hold'em 系统不变量

本文只记录违反后即使测试通过，系统仍然错误的性质。完整产品行为以 `docs/product-specs/` 为准；本文不复制完整规则，只提炼必须持续保护的属性。

## 使用约定

每条不变量必须包含稳定 ID、性质、可点击的完整行为链接、执行方式、覆盖状态和可点击的证据。覆盖状态只能是 `complete`、`partial` 或 `gap`；执行方式只能是 `test`、`architecture`、`test + architecture` 或 `manual`。`partial` 和 `gap` 还必须写明具体缺口、责任边界和可执行跟进，不得用模糊状态代替判断，也不得伪造测试链接。

## INV-AUTH — 权威与信息隔离

### INV-AUTH-001 — 服务端是游戏权威

客户端不能成为牌、行动、底池、结算或统计事实的权威来源。

完整行为规范：[玩法规格：服务端权威](docs/product-specs/gameplay.md#服务端权威)

执行方式：test + architecture
覆盖状态：complete
证据：[客户端设计](docs/design-docs/client.md)、[协议与同步设计](docs/design-docs/protocol-and-sync.md)

### INV-AUTH-002 — 私有信息按玩家投影

服务端不能把全量私有状态广播后让客户端自行隐藏；每个玩家只能收到其专属快照。

完整行为规范：[玩法规格：结算](docs/product-specs/gameplay.md#结算)

执行方式：test + architecture
覆盖状态：complete
证据：[玩家快照 schema](packages/protocol/src/player-snapshot.ts)、[服务端快照投影](apps/host/src/application/snapshot-projector.ts)、[快照投影测试](apps/host/src/application/snapshot-projector.test.ts)

## INV-BET — 下注与牌局推进

### INV-BET-001 — 只有当前行动者可以行动

只有服务端当前行动者可以提交被接受的下注行动。

完整行为规范：[玩法规格：行动与下注轮](docs/product-specs/gameplay.md#行动与下注轮)

执行方式：test
覆盖状态：complete
证据：[下注核心](packages/poker-core/src/betting/)、[房主行动处理](apps/host/src/application/game-command-handler.ts)、[房主行动测试](apps/host/src/application/game-command-handler.test.ts)

### INV-BET-002 — 短 All-in 不重新开放行动

不足 minimum raise 的下注不得重新开放已经完成行动玩家的 raise 权利；该玩家仍可在服务端允许时 Call 或 Fold。

完整行为规范：[玩法规格：行动与下注轮](docs/product-specs/gameplay.md#行动与下注轮)

执行方式：test + architecture
覆盖状态：partial
证据：[短 All-in 重开测试](packages/poker-core/src/betting/reopen.test.ts)

缺口：纯规则测试已覆盖单次及累计短 All-in，但尚无从房主命令入口经过协议校验到权威快照的多玩家集成用例。
责任边界：`packages/poker-core` 负责规则判定，`apps/host` 负责命令编排和快照提交。
跟进：下一次修改短 All-in 或 Raise 权限时，先补房主命令路径集成测试，再评估提升为 `complete`。

### INV-BET-003 — 下注轮关闭后才自动 Runout

仍存在合法响应的下注轮不能因为全押或筹码数量变化而提前进入 automatic runout。

完整行为规范：[玩法规格：行动与下注轮](docs/product-specs/gameplay.md#行动与下注轮)

执行方式：test + architecture
覆盖状态：complete
证据：[牌局生命周期设计](docs/design-docs/hand-lifecycle.md)、[Runout 关闭条件测试](packages/poker-core/src/hand/turn-river.test.ts)、[Host 逐街计时测试](apps/host/src/application/game-runtime.test.ts)

缺口：无。核心状态机拒绝未关闭下注轮，Host 只有在当前行动者为空且下注轮已关闭时才建立 Runout 计时链；仍有合法 Call/Fold 响应时不会提前公开街道。
责任边界：`packages/poker-core` 负责下注轮关闭和单街推进，`apps/host` 负责命令、计时和阶段编排。
跟进：若后续修改自动 Runout 或行动超时，必须保留并扩展核心与 Host 的关闭条件测试。

## INV-POT — 底池与筹码

### INV-POT-001 — 已投入筹码守恒

每个贡献层的合法派彩与未匹配贡献返还之和必须等于该层金额；所有层级结果必须等于总底池金额。

完整行为规范：[玩法规格：结算](docs/product-specs/gameplay.md#结算)

执行方式：test
覆盖状态：complete
证据：[底池分层与派彩](packages/poker-core/src/pots/)、[完整牌局结算集成测试](packages/poker-core/src/hand/complete-hand.integration.test.ts)

### INV-POT-002 — 弃牌玩家不能获胜

弃牌玩家可以贡献筹码，但不能成为其对应争夺底池的获奖者。

完整行为规范：[玩法规格：结算](docs/product-specs/gameplay.md#结算)

执行方式：test
覆盖状态：complete
证据：[底池分层与派彩](packages/poker-core/src/pots/)、[无争议底池测试](packages/poker-core/src/hand/uncontested.test.ts)

## INV-HAND — 牌局生命周期

### INV-HAND-001 — 牌局状态按顺序转换

牌局必须先完成当前下注轮，再推进街道、Runout、摊牌、结算和下一局；客户端不能自行推进阶段。

完整行为规范：[玩法规格：牌局生命周期](docs/product-specs/gameplay.md#牌局生命周期)

执行方式：test + architecture
覆盖状态：partial
证据：[牌局生命周期设计](docs/design-docs/hand-lifecycle.md)、[完整牌局结算集成测试](packages/poker-core/src/hand/complete-hand.integration.test.ts)、[下一局创建测试](apps/host/src/domain/start-next-hand.test.ts)

缺口：核心结算和下一局创建已有测试，但尚无单一房主运行时用例贯通下注轮关闭、跨街、结算持久化、准备阶段和下一局启动。
责任边界：`packages/poker-core` 负责单局状态机，`apps/host` 负责连续牌局编排、持久化和快照发布。
跟进：下一次修改跨街或连续牌局编排时，补房主运行时端到端状态序列测试。

### INV-HAND-002 — 牌局内不能有重复牌

一手牌内不能出现重复牌，测试可以通过注入确定性牌组复现。

完整行为规范：[玩法规格：德州扑克规则](docs/product-specs/gameplay.md#德州扑克规则)

执行方式：test
覆盖状态：complete
证据：[牌与牌组实现](packages/poker-core/src/cards/)、[单局状态机测试](packages/poker-core/src/hand/)

## INV-ROOM — 房间与身份

### INV-ROOM-001 — 重连使用令牌身份

昵称不能替代重连令牌；主动退出和意外掉线不能删除玩家的座位、筹码、历史或统计。

完整行为规范：[房间体验：离开、掉线与重连](docs/product-specs/room-experience.md#离开掉线与重连)

执行方式：test + architecture
覆盖状态：complete
证据：[房间领域设计](docs/design-docs/room-domain.md)、[重连领域测试](apps/host/src/domain/reconnect.test.ts)、[重连同步测试](apps/host/src/application/reconnect-synchronizer.test.ts)

### INV-ROOM-002 — 房主生命周期状态可区分

房间等待、牌局准备、实际对局、正常关闭和异常中断必须保持可区分的状态语义。

完整行为规范：[房间体验：房间与记录生命周期](docs/product-specs/room-experience.md#房间与记录生命周期)

执行方式：test + architecture
覆盖状态：partial
证据：[房间领域设计](docs/design-docs/room-domain.md)、[持久化与恢复设计](docs/design-docs/persistence-and-recovery.md)、[房间生命周期存储测试](apps/host/src/persistence/sqlite-room-lifecycle-store.test.ts)

缺口：存储层状态已有覆盖，但尚无单一生命周期场景同时区分正常关闭、异常中断、恢复和归档后的对外可观察状态。
责任边界：`apps/host` 负责房间与记录状态，`apps/desktop` 负责本机记录管理和恢复入口。
跟进：下一次修改关闭、恢复或归档流程时，补跨 host/desktop 的生命周期集成用例。

## INV-PROTO — 协议与幂等

### INV-PROTO-001 — 已接受命令必须幂等

同一个 `commandId` 最多生效一次，重复请求不能重复下注、转账或结算。

完整行为规范：[协议与同步设计：命令](docs/design-docs/protocol-and-sync.md#命令)

执行方式：test + architecture
覆盖状态：complete
证据：[协议命令 schema](packages/protocol/)、[命令调度测试](apps/host/src/application/command-dispatcher.test.ts)、[事件与命令事务测试](apps/host/src/persistence/sqlite-event-command-store.test.ts)

## INV-PERSIST — 持久化与恢复

### INV-PERSIST-001 — 确认成功前必须完成持久化

服务端必须先完成事件或事务持久化，再向客户端确认状态变更成功。

完整行为规范：[持久化与恢复设计：写入规则](docs/design-docs/persistence-and-recovery.md#写入规则)

执行方式：test + architecture
覆盖状态：partial
证据：[事件与命令事务测试](apps/host/src/persistence/sqlite-event-command-store.test.ts)、[持久化实现](apps/host/src/persistence/)

缺口：事务测试已覆盖确认写入失败时回滚事件，但尚无 transport 级用例证明外部成功响应一定发生在事务提交之后。
责任边界：`apps/host/src/application` 负责编排提交，`apps/host/src/persistence` 负责原子事务，网络层负责发送确认。
跟进：下一次修改命令确认或持久化顺序时，补失败注入的服务端集成测试并断言未发出成功响应。

## INV-ARCH — 架构边界

### INV-ARCH-001 — 共享包不能导入应用

共享包不能反向依赖 `apps/*`；`poker-core` 不依赖网络、数据库、UI、系统时间或全局随机源。

完整行为规范：[架构入口：工作区边界](ARCHITECTURE.md#工作区边界)

执行方式：architecture
覆盖状态：partial
证据：[仓库路由规则](AGENTS.md)、[扑克领域设计](docs/design-docs/poker-domain.md)

缺口：依赖方向目前只由说明文档和 TypeScript 项目边界间接约束，没有自动扫描所有 workspace import 的架构门禁。
责任边界：根工具链负责依赖图检查，各 workspace 负责保持允许的导入方向。
跟进：新增跨 workspace 依赖或调整构建边界前，先补自动依赖方向检查，再评估提升为 `complete`。

### INV-ARCH-002 — Electron 渲染进程使用窄桥接

渲染进程保持 sandbox、context isolation 和 `nodeIntegration=false`，只能通过参数校验后的 preload API 访问桌面能力。

完整行为规范：[桌面体验：桌面安全与数据目录](docs/product-specs/desktop-experience.md#桌面安全与数据目录)

执行方式：test + architecture
覆盖状态：complete
证据：[桌面设计](docs/design-docs/desktop.md)、[桌面运行时 schema](apps/desktop/src/shared/runtime.ts)、[主窗口安全测试](apps/desktop/src/main/window-options.test.ts)
