# ADR-003 — 本地优先持久化

## 背景

项目不依赖公网服务，房主异常退出后仍需要恢复房间、玩家和牌局记录。

## 决策

运行时以内存权威状态为准，接受的命令生成顺序事件，并在关键状态转换和结算后保存 SQLite 快照。

## 影响

正常关闭和异常退出必须保持不同语义；同一台房主电脑同一时间最多载入一条运行记录。

完整行为规范：`docs/product-specs/room-experience.md#房间与记录生命周期`
设计文档：`docs/design-docs/persistence-and-recovery.md`
