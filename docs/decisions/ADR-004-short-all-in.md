# ADR-004 — 短 All-in 不重新开放 Raise

## 背景

不足完整最小加注的 All-in 会改变后续玩家的可行动集合，但不能被错误解释成完整 Raise。

## 决策

短 All-in 不重新开放已经完成行动玩家的 Raise 权利；服务端仍按当前状态允许合法的 Call 或 Fold。

## 影响

下注轮完成判定必须独立于 Runout 判断，相关测试必须覆盖多个短 All-in 组合。

完整行为规范：`docs/product-specs/gameplay.md#行动与下注轮`
设计文档：`docs/design-docs/poker-domain.md`
