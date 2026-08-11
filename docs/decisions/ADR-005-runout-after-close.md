# ADR-005 — 下注轮关闭后才 Automatic Runout

## 背景

全押或筹码不足可能让部分玩家不能再下注，但仍可能存在合法 Call/Fold 响应。

## 决策

必须先完成当前下注轮仍可响应的行动，再判断是否少于两名具备竞争资格的玩家并自动补齐公共牌。

## 影响

Runout 只负责街道推进，不改变底池分层、未匹配返还和派彩。

完整行为规范：`docs/product-specs/gameplay.md#行动与下注轮`
设计文档：`docs/design-docs/hand-lifecycle.md`
