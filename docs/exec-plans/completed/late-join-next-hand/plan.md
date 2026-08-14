# 牌局开始后新玩家下一局参赛执行计划

> 生命周期：normal

## 目标

允许首局开始后加入的全新玩家进入现有房间，但不加入当前已创建牌局；新玩家在下一次牌局准备阶段明确选择“已就绪”后，才参加下一局，同时保持 Host 权威、旧玩家、重连、牌局状态和筹码守恒不变。

## 范围

- 包含：`playing`、`hand-ready` 和 `paused` 阶段的新 Player 加入；新玩家分配独立身份、座位和初始筹码后保持等待；当前手不变；下一次 `hand-ready` 可主动准备；客户端展示等待下一局；规格、设计、ADR 和验收证据同步。
- 不包含：当前手中途发牌或下注、修改 `poker-core` 的牌局参与者/底池/结算算法、新增独立观战者角色、Android Host、中心服务器、盲注规则变更和无关持久化重设计。

## 已确认决策

- 新玩家加入后只等待下一局，不参与当前已经创建的 `StartedHandState`。
- 新玩家不能因加入自动就绪；在下一次 `hand-ready` 中必须显式选择“已就绪”，并遵守筹码、待处理请求和至少两名参赛者条件。
- 已关闭房间拒绝新加入；已有玩家的令牌恢复、主动退出、掉线和被移除语义保持不变。

## 依赖

- 外部依赖：无；产品决策已由用户确认。
- 任务依赖：`LATEJOIN-001` 完成后才能实现 `LATEJOIN-002`；`LATEJOIN-002` 完成后才能实现 `LATEJOIN-003`；`LATEJOIN-003` 完成后才能完成 `LATEJOIN-004`。

## 任务状态

本表是本计划唯一的任务状态来源。

| ID           | Status | Depends      | Affected                   | Acceptance                                         | Detail                        |
| ------------ | ------ | ------------ | -------------------------- | -------------------------------------------------- | ----------------------------- |
| LATEJOIN-001 | done   | -            | product/design/ADR         | 当前真相明确记录“加入后等待下一局”的完整语义       | [详情](tasks/LATEJOIN-001.md) |
| LATEJOIN-002 | done   | LATEJOIN-001 | Host domain/application    | 新玩家不改变当前手，只能在下一局准备后进入参赛集合 | [详情](tasks/LATEJOIN-002.md) |
| LATEJOIN-003 | done   | LATEJOIN-002 | client room/table          | 新玩家可加入并清晰看到等待下一局，旧玩家体验不回归 | [详情](tasks/LATEJOIN-003.md) |
| LATEJOIN-004 | done   | LATEJOIN-003 | e2e/verification/exec-plan | 全链路测试、Harness 门禁和稳定验收证据完成         | [详情](tasks/LATEJOIN-004.md) |
