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
证据：[客户端设计](docs/design-docs/client.md)、[协议与同步设计](docs/design-docs/protocol-and-sync.md)、[Host 快照投影测试](apps/host/src/application/snapshot-projector.test.ts)、[Host 生命周期测试](apps/host/src/application/game-runtime.test.ts)

### INV-AUTH-002 — 私有信息按玩家投影

服务端不能把全量私有状态广播后让客户端自行隐藏；每个玩家只能收到其专属快照。

完整行为规范：[玩法规格：结算](docs/product-specs/gameplay.md#结算)

执行方式：test + architecture
覆盖状态：complete
证据：[玩家快照 schema](packages/protocol/src/player-snapshot.ts)、[服务端快照投影](apps/host/src/application/snapshot-projector.ts)、[快照投影测试](apps/host/src/application/snapshot-projector.test.ts)

### INV-AUTH-003 — Host 管理投影不泄露玩家私有信息

Host 管理会话只能收到房主管理和公共牌桌所需信息；服务型房主不通过 Host 管理快照获得玩家专属底牌、牌组顺序或其他未公开信息。

完整行为规范：[协议与同步设计：事件与快照](docs/design-docs/protocol-and-sync.md#事件与快照)

执行方式：test + architecture
覆盖状态：complete
证据：[Host 管理快照 schema](packages/protocol/src/host-snapshot.ts)、[Host 投影](apps/host/src/application/snapshot-projector.ts)、[Host Socket 测试](apps/host/src/server.test.ts)、[Host 控制台与观战牌桌测试](apps/client/src/room/HostConsole.test.tsx)

责任边界：`packages/protocol` 定义 Host 管理快照，`apps/host` 负责按会话身份投影，`apps/client` 只渲染对应角色视图。

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
覆盖状态：complete
证据：[牌局生命周期设计](docs/design-docs/hand-lifecycle.md)、[完整牌局结算集成测试](packages/poker-core/src/hand/complete-hand.integration.test.ts)、[下一局创建测试](apps/host/src/domain/start-next-hand.test.ts)、[Host 快照投影测试](apps/host/src/application/snapshot-projector.test.ts)、[Host 生命周期测试](apps/host/src/application/game-runtime.test.ts)、[MCP Agent 闭环测试](apps/mcp-server/src/__tests__/closed-loop.e2e.test.ts)

### INV-HAND-002 — 牌局内不能有重复牌

一手牌内不能出现重复牌，测试可以通过注入确定性牌组复现。

完整行为规范：[玩法规格：德州扑克规则](docs/product-specs/gameplay.md#德州扑克规则)

执行方式：test
覆盖状态：complete
证据：[牌与牌组实现](packages/poker-core/src/cards/)、[单局状态机测试](packages/poker-core/src/hand/)

### INV-HAND-003 — 当前盲注不按历史回算

房间必须持久化基础盲注、权威当前盲注和下一次增长阈值；动态修改增长参数或当前小盲不能改变已创建牌局的盲注，也不能把已完成局数重新套回基础小盲。下一局只能从服务端保存的当前级别继续。

完整行为规范：[玩法规格：盲注与筹码](docs/product-specs/gameplay.md#盲注与筹码)

执行方式：test + architecture
覆盖状态：complete
证据：[盲注核心测试](packages/poker-core/src/table/blinds.test.ts)、[Host 当前盲注生命周期测试](apps/host/src/application/game-runtime.test.ts)、[房间配置领域测试](apps/host/src/domain/update-room-settings.test.ts)、[恢复设计](docs/design-docs/persistence-and-recovery.md)

责任边界：`poker-core` 只提供单次增长的确定性规则，`apps/host` 保存当前级别和增长阈值并在下一局边界更新，`packages/protocol` 投影基础与当前级别，客户端不得自行计算。

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
覆盖状态：complete
证据：[房间领域设计](docs/design-docs/room-domain.md)、[持久化与恢复设计](docs/design-docs/persistence-and-recovery.md)、[房间生命周期存储测试](apps/host/src/persistence/sqlite-room-lifecycle-store.test.ts)、[Host/desktop 生命周期 E2E](e2e/e2e06-room-close-and-recovery.test.ts)、[Host 控制会话断开测试](apps/host/src/server.test.ts)

单一生命周期场景已区分运行中、Host 控制会话断开后的继续运行、异常中断可恢复、桌面恢复后的运行中、正常关闭和归档状态。
责任边界：`apps/host` 负责房间与记录状态，`apps/desktop` 负责本机记录管理和恢复入口。

### INV-ROOM-003 — Host 身份与 Player 身份分离

房主管理会话必须使用独立的 Host 身份和恢复令牌；昵称、`playerId` 或玩家恢复令牌不能替代 Host 身份。旧房主参与记录可以保留关联的 Host 和 Player 身份，但不能继续把二者当成同一授权主体。

完整行为规范：[房间体验：角色与入口](docs/product-specs/room-experience.md#角色与入口)

执行方式：test + architecture
覆盖状态：complete
证据：[Host/Player 会话 schema](packages/protocol/src/room-session.ts)、[运行时授权](apps/host/src/application/game-runtime.ts)、[Host token 持久化](apps/host/src/persistence/sqlite-host-reconnect-identity-store.ts)、[服务型 Host 集成测试](apps/host/src/application/host-participation.test.ts)

责任边界：`packages/protocol` 定义身份形状，`apps/host` 负责授权和恢复，`apps/desktop` 负责本机 Host 会话保存与恢复。

### INV-ROOM-004 — 服务型房主不进入玩家集合

`仅提供服务` 模式的房主不占用玩家座位，不获得筹码，不进入准备人数、行动顺序、底池、牌局统计或玩家人数上限；首局开始条件只针对实际玩家计算。

完整行为规范：[房间体验：座位与首局](docs/product-specs/room-experience.md#座位与首局)

执行方式：test + architecture
覆盖状态：complete
证据：[领域建模测试](apps/host/src/domain/room.test.ts)、[服务型 Host 运行时测试](apps/host/src/application/host-participation.test.ts)、[Host 管理快照测试](packages/protocol/src/host-snapshot.test.ts)、[Host Socket 测试](apps/host/src/server.test.ts)

责任边界：`apps/host/src/domain` 保证玩家集合和首局条件，`apps/host/src/application` 保证快照、统计和发现摘要按实际玩家投影。

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
覆盖状态：complete
证据：[事件与命令事务测试](apps/host/src/persistence/sqlite-event-command-store.test.ts)、[Transport 持久化确认顺序测试](apps/host/src/server.test.ts)、[持久化实现](apps/host/src/persistence/)

Transport 测试已覆盖提交成功后才发送 `accepted`，以及提交前异常、回滚和提交失败均不发送成功确认且不留下残余写入。
责任边界：`apps/host/src/application` 负责编排提交，`apps/host/src/persistence` 负责原子事务，网络层负责发送确认。

## INV-ARCH — 架构边界

### INV-ARCH-001 — 共享包不能导入应用

共享包不能反向依赖 `apps/*`；`poker-core` 不依赖网络、数据库、UI、系统时间或全局随机源。

完整行为规范：[架构入口：工作区边界](ARCHITECTURE.md#工作区边界)

执行方式：architecture
覆盖状态：complete
证据：[仓库路由规则](AGENTS.md)、[扑克领域设计](docs/design-docs/poker-domain.md)、[workspace 边界检查脚本](scripts/check-workspace-boundaries.mjs)、[workspace 边界门禁测试](tests/architecture/workspace-boundaries.test.ts)

根门禁已扫描当前 workspace 的 source import，并以 fixture 测试验证共享包反向导入应用层、`poker-core` 禁止运行时边界 import，以及系统时间/全局随机源调用均会失败。
责任边界：根工具链负责依赖图检查，各 workspace 负责保持允许的导入方向。

### INV-ARCH-002 — Electron 渲染进程使用窄桥接

渲染进程保持 sandbox、context isolation 和 `nodeIntegration=false`，只能通过参数校验后的 preload API 访问桌面能力。

完整行为规范：[桌面体验：桌面安全与数据目录](docs/product-specs/desktop-experience.md#桌面安全与数据目录)

执行方式：test + architecture
覆盖状态：complete
证据：[桌面设计](docs/design-docs/desktop.md)、[桌面运行时 schema](apps/desktop/src/shared/runtime.ts)、[主窗口安全测试](apps/desktop/src/main/window-options.test.ts)
