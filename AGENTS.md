# Texas Hold'em Agent 路由入口

## 阅读路由

每次任务先阅读本文件，再按任务类型加载最小文档集合：

- 修改产品行为：读取 `docs/product-specs/index.md`、对应产品规格、索引列出的相关 `INV-*` 和 `docs/decisions/index.md`。
- 修改系统边界或跨模块调用：读取 `ARCHITECTURE.md`、相关详细设计和对应 `INV-*`。
- 修改扑克规则、下注、底池、牌局、Runout 或结算：使用 `.agents/skills/poker-rule-change/SKILL.md`。
- 执行进行中计划：读取 `docs/exec-plans/index.md`、与本次请求对应的计划、当前 task ID 及其直接依赖。
- 诊断、评审或文档整理：只读取能回答当前问题的入口和目标文件，不默认加载全部产品与设计文档。

不要把整个 `docs/` 当作单一说明书加载。历史计划只能用于追溯，不能作为当前待办列表。

## 按任务查找

- 产品行为：`docs/product-specs/`
- 领域和运行时设计：`docs/design-docs/`
- 当前变更：`docs/exec-plans/active/`
- 历史变更：`docs/exec-plans/completed/`
- 产品决策及其原因：`docs/decisions/`
- 可复用扑克规则变更能力：`.agents/skills/poker-rule-change/SKILL.md`
- 运行证据：`docs/verification/` 和对应 Exec Plan 的 `verification.md`

## 模块地图

- `packages/poker-core`：纯确定性扑克逻辑；禁止网络、数据库、UI、系统时间和全局随机数。
- `packages/protocol`：网络与房间运行时 schema、命令、事件和快照；不导入应用层。Electron IPC schema 归 `apps/desktop/src/shared/runtime.ts`。
- `packages/lan-discovery`：UDP 发现协议和 Node 适配器；不依赖 Electron。
- `packages/ui`：可复用响应式 UI 组件。
- `packages/test-support`：测试构造器和确定性夹具。
- `apps/host`：权威房间服务、实时通信、调度和 SQLite。
- `apps/client`：浏览器和 Electron renderer 共用的 React 客户端。
- `apps/desktop`：Electron 主进程和窄 preload bridge。

共享包不能导入 `apps/*`。领域模块不能导入 Electron、Fastify、Socket.IO、React 或 SQLite。

## 执行约束

- 请求属于某个进行中计划时，一次只执行该计划中的一个 task ID；有多个计划时先确认与本次请求匹配的计划。
- 没有匹配的进行中计划时，以用户请求作为任务边界。只有需要跨多个可独立验收步骤的复杂变更才新建执行计划，普通小修、诊断、评审和文档整理不虚构 task ID。
- 先检查 Git 状态，保留已有改动；只修改当前任务允许的文件范围。
- 产品完整行为以 `docs/product-specs/` 为准；不变量以 `INVARIANTS.md` 为准；设计文档不能改写产品语义。
- 当前计划只维护任务状态；任务详情不得复制状态。
- 产品或不变量存在会改变结果的歧义时停止并报告，不在代码中静默猜测。
- 如果需求与现有产品决策、ADR 或不变量不一致，先确认是修改既有决策还是修改需求，确认前不得实现。
- 每次完成任务后，检查产品规格、设计文档、不变量、决策和当前执行计划是否需要同步更新；系统事实变化时必须更新对应文档。
- 不使用 `any`、跳过测试、关闭 lint 或弱化 schema 绕过问题。
- 不提交或推送，除非用户明确授权。
- 修改扑克规则、下注、底池、牌局、Runout 或结算时，读取 `.agents/skills/poker-rule-change/SKILL.md`。
- 如果仓库存在 `.codegraph/`，优先使用 CodeGraph 探索符号和调用路径；否则使用可用的 `rg`、LSP 或其他代码搜索工具，不仅凭文档猜测实现位置。

## 并行执行

- 开始时声明本任务允许修改的路径或 hunk；发现范围与其他任务重叠时先停止并报告。
- 修改前重新读取可能被并行任务改动的文件；目标文件或 `HEAD` 变化后，重新核对基线和差异。
- 不对全仓执行会重写文件的格式化或自动修复命令；只格式化本任务明确修改的文件。
- 完成时用 `git diff` 区分本任务改动与既有差异。暂存或提交获得授权后，仍必须精确到路径或 hunk，不带入并行任务内容。

## 验证

受影响 workspace 的 targeted tests 是必需的；`pnpm check` 不替代它们。

- `pnpm harness:check`：结构、链接和 ID 的客观检查。
- `pnpm harness:test`：Harness 解析器、生命周期和失败路径的快速契约测试。
- `pnpm check`：Harness 实仓检查与契约测试、格式、lint 和 typecheck 的快速门禁。
- `pnpm check:full`：快速门禁、workspace tests 和 build。
- `pnpm test:e2e`：环境敏感的浏览器/Electron 场景，单独运行。
- `pnpm package:win`：Windows 打包场景，按任务需要运行。

完成任务时报告改动文件、实现行为、targeted tests、`pnpm check` 结果、文档影响（无 / 产品规格 / 设计 / 不变量 / ADR / 执行计划 / 证据）、未完成项和 Git 状态。
