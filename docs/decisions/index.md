# 产品决策索引

本目录只登记重要、跨任务仍然有效、容易被 Agent 遗忘的决策。当前行为的完整语义仍由 `docs/product-specs/` 保存；ADR 记录为什么这样决定及其长期影响。

## 决策规则

- 一个 ADR 只描述一个长期决策。
- 临时实现选择写入进行中执行计划的 `decisions.md`，不直接创建 ADR。
- 临时决定若跨任务仍有效，再提升为 ADR，并同步产品规格或 `INVARIANTS.md`。
- ADR 不复制完整产品规则，只链接规范来源。
- 如果需求与现有决策、ADR 或不变量不一致，必须先确认是修改决策还是修改需求，不能在实现中默默选择一方。
- 每次任务完成后，必须检查产品规格、设计文档、不变量、ADR、执行计划和验收证据是否需要同步更新。

## 当前决策域

| ID      | 决策主题                                     | 当前规范                                   | 影响设计                                                                 |
| ------- | -------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| ADR-001 | 房主服务端是唯一游戏权威                     | `docs/product-specs/gameplay.md`           | `poker-domain`、`protocol-and-sync`                                      |
| ADR-002 | 客户端只渲染服务端快照                       | `docs/product-specs/gameplay.md`           | `client`、`protocol-and-sync`                                            |
| ADR-003 | 房间记录采用本地优先持久化                   | `docs/product-specs/room-experience.md`    | `persistence-and-recovery`                                               |
| ADR-004 | 短 All-in 不重新开放 Raise                   | `docs/product-specs/gameplay.md`           | `poker-domain`、`hand-lifecycle`                                         |
| ADR-005 | Automatic runout 必须在下注轮关闭后发生      | `docs/product-specs/gameplay.md`           | `hand-lifecycle`                                                         |
| ADR-006 | 桌面与浏览器共享客户端但保持 Electron 窄边界 | `docs/product-specs/desktop-experience.md` | `client`、`desktop`                                                      |
| ADR-007 | Android/mobile 仅作为普通玩家客户端          | `docs/product-specs/room-experience.md`    | `client`、`desktop`                                                      |
| ADR-008 | 房主参与模式与玩家身份分离                   | `docs/product-specs/room-experience.md`    | `room-domain`、`protocol-and-sync`、`persistence-and-recovery`、`client` |
| ADR-009 | 房主动态房间配置的字段与生效边界             | `docs/product-specs/room-experience.md`    | `room-domain`、`hand-lifecycle`、`protocol-and-sync`、`client`           |
| ADR-010 | 首局开始后新玩家等待下一局参赛               | `docs/product-specs/gameplay.md`           | `room-domain`、`hand-lifecycle`、`protocol-and-sync`、`client`           |

## ADR 文档

当前只为需要长期解释的决策创建 ADR 文件；普通产品规则不为增加文件数量而拆成 ADR。
