# 执行计划地图

执行计划记录当前变更，不是当前事实。产品行为、架构设计和不变量必须先在各自规范中成立，计划只负责目标、依赖、任务状态、临时决定和验收证据。

## 进行中

当前没有进行中的执行计划；已完成计划见下方“已完成”。

复杂变更需要多个可独立验收步骤时，复制[标准模板](template/plan.md)到 `active/<change>/`；普通小修、诊断、评审和文档整理直接以用户请求作为任务边界，不创建空计划或虚构 task ID。

每个进行中的计划至少包含 `plan.md`、`verification.md` 和 `tasks/`。`plan.md` 只保存目标、范围、依赖图和唯一任务状态表；任务详情放在 `tasks/<TASK_ID>.md`，状态表的 `Detail` 必须链接对应文件。

任务详情必须明确：

- 规范来源和相关 `INV-*`；没有适用不变量时写明 `无`。
- 允许修改的文件范围和禁止范围。
- 可观察完成条件、targeted tests 和必要门禁。
- 文档影响分类：无、产品规格、设计、不变量、ADR、执行计划或证据。

同一计划最多一个任务处于 `active`。`Depends` 必须单独使用 `-` 表示无依赖，或填写以逗号分隔且不重复的本计划任务 ID / `external:<非空说明>`；不得留空、包含空项或把 `-` 与其他依赖混用。内部依赖必须引用本计划中的任务且不能形成环；`active` 任务的内部依赖必须已经 `done`。完成任务后在 `verification.md` 添加唯一的同名 `## <TASK_ID>` 证据条目，再把状态改为 `done`。

状态只允许 `pending`、`active`、`blocked`、`done`、`cancelled`。计划头必须显式使用以下生命周期之一：

- `> 生命周期：normal`：当前契约下创建的计划，所有 `done` 任务必须有逐任务结构化证据。
- `> 生命周期：legacy`：契约建立前已经完成、状态可信但只有聚合历史证据的计划；只允许位于 `completed/`，不得残留未完成任务，必须填写 `> 归档说明：...`，且 `verification.md` 必须包含非空的“归档范围”和“历史状态”。
- `> 生命周期：superseded`：被后续事实来源取代、无法安全回填历史状态或证据的计划；只允许位于 `completed/`，并必须填写 `> 归档说明：...`。

状态表必须是包含合法分隔行的 Markdown 表格，表头逐字为 `ID | Status | Depends | Affected | Acceptance | Detail`。每个 `normal` 计划任务在进行中和归档后，`Detail` 都必须且只能链接 `tasks/<TASK_ID>.md`；详情六个必填章节和完成证据格式见[任务模板](template/tasks/CHANGE-001.md)与[验证模板](template/verification.md)。`done` 条目必须先在验证文件中写入唯一同名章节及完整证据字段。结构检查以 Markdown 语法树为准，忽略行内、围栏、缩进代码节点和 HTML 节点中的示例内容；嵌套在列表或引用中的表格也不能充当计划状态表。

## 已完成

- [`mcp-agent-closed-loop`](completed/mcp-agent-closed-loop/plan.md)：以真实 Host、独立 stdio MCP Agent 和本机 SQLite 完成三手四街对局，验证双方进程重启后的同身份恢复与持久化边界。
- [`client-reconnection`](completed/client-reconnection/plan.md)：为玩家与房主客户端补齐固定 `500 ms` 间隔、最多 `20` 次自动重连和同参数手动重连周期，并以权威快照匹配作为恢复操作门控；不修改 Host 权威、协议幂等或持久化。
- [`current-hand-number`](completed/current-hand-number/plan.md)：将当前局号改为 Host 权威投影，结算和准备阶段稳定显示刚结束的第 N 局，下一局创建后再显示第 N+1 局；不改变 `completedHands`、盲注增长、发牌时机或持久化。
- [`automatic-runout-street-reveal`](completed/automatic-runout-street-reveal/plan.md)：自动 Runout 时由服务端逐街公开公共牌并控制摊牌结算节奏；不改协议字段或客户端规则。
- [`terra`](completed/terra/plan.md)：结构化证据契约建立前完成的 legacy 工程骨架计划。
- [`luna`](completed/luna/plan.md)：已取代的历史增量计划；未回填状态只供追溯，不能作为当前待办。
- [`host-participation`](completed/host-participation/plan.md)：完成 Windows 服务型 Host、Host/Player 身份分离、管理快照、本地 SQLite 恢复和客户端控制台。
- [`host-observation-and-invariants`](completed/host-observation-and-invariants/plan.md)：为仅提供服务的 Host 增加只读观战牌桌，并补齐生命周期、持久化确认顺序和 workspace 架构边界的自动化证据。
- [`room-management-and-authoritative-blinds`](completed/room-management-and-authoritative-blinds/plan.md)：完成房主大厅/局内管理、只读观战体验、权威当前盲注和动态房间配置。
- [`late-join-next-hand`](completed/late-join-next-hand/plan.md)：允许首局开始后新玩家加入房间，但等待牌局准备阶段并主动选择后再参加下一局。

归档只改变目录状态，不改变计划目录结构。正常完成的计划不能残留 `pending`、`active` 或 `blocked`；结构化证据契约建立前完成且只有聚合证据的历史计划使用 `legacy`；被后续事实来源取代、且无法安全回填历史状态或证据的计划使用 `superseded`，其中旧状态不得用于判断当前实现。`legacy` 与 `superseded` 都不能用于规避新计划的逐任务证据要求。
