# MCP Agent 双端持久化闭环执行计划

> 生命周期：normal

## 目标

以生产构建的房主端和独立 stdio MCP Agent 完成可重复的三手牌自闭环，并证明双方进程重启后，Agent 身份恢复文件与 Host SQLite 记录可以共同支撑原房间、原玩家连续对战。

## 范围

- 包含：MCP 状态摘要、真实进程闭环测试、Host 与 Agent 双端重启恢复、完整四街对局、Host SQLite 落盘断言、MCP 设计与验证证据。
- 不包含：AI 模型调用或决策服务、Host 生产实现变更、扑克规则变更、桌面 UI、Android Host、跨设备同步和公网编排。

## 依赖

- 外部：无；测试使用仓库现有 Node.js、Host、Socket.IO、MCP SDK 和 SQLite 实现。
- 任务依赖：无。

## 任务状态

本表是本计划唯一的任务状态来源。

| ID          | Status | Depends | Affected                         | Acceptance                 | Detail                       |
| ----------- | ------ | ------- | -------------------------------- | -------------------------- | ---------------------------- |
| MCPLOOP-001 | done   | -       | MCP 适配器、闭环测试、设计与证据 | 任务详情的完成条件全部成立 | [详情](tasks/MCPLOOP-001.md) |
