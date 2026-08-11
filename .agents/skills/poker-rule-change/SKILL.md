---
name: poker-rule-change
description: Use when changing or diagnosing Texas Hold'em poker rules, blinds, betting actions, minimum raises, all-in behavior, pots, hand lifecycle, automatic Runout, showdown, settlement, or their product and design specifications. Do not use for purely visual layout, styling, copy, audio, or animation changes that leave rule semantics unchanged.
---

# 扑克规则变更

当改动涉及扑克规则、下注、底池、牌局生命周期、自动 Runout、摊牌、结算或对应的产品/设计文档时，使用本仓库 Skill。

## 工作流程

1. 检查 `docs/exec-plans/index.md`。如果本次请求属于某个进行中计划，定位对应计划和当前任务 ID；否则以用户请求作为边界，不从历史计划选择任务。
2. 从 `INVARIANTS.md` 读取相关的 `INV-*` 条目。若覆盖状态为 `partial` 或 `gap`，同时读取“缺口、责任边界、跟进”：判断本次变更是否触及缺口；触及时在任务范围内补齐，无法安全补齐时停止并报告；未触及时记录不受影响的依据，不因状态名称本身自动阻断。
3. 从 `docs/product-specs/gameplay.md` 读取完整产品行为。
4. 只读取必要的设计文档：
   - `docs/design-docs/poker-domain.md`：规则原语和局部算法。
   - `docs/design-docs/hand-lifecycle.md`：状态编排和街道转换。
   - `docs/design-docs/protocol-and-sync.md`：线协议或快照发生变化时读取。
   - `docs/design-docs/client.md`：投影或牌桌 UI 发生变化时读取。
5. 使用可用的符号搜索、代码搜索或调用图工具探索真实调用路径。如果存在 `.codegraph/`，优先使用 CodeGraph；否则使用 `rg`、LSP 或其他仓库搜索工具。
6. 修改前检查以下边界：
   - 当前行动者和合法行动集合；
   - 最小加注和短 All-in 的行动重开；
   - 自动 Runout 前下注轮是否已经关闭；
   - 弃牌玩家的获奖资格；
   - 边池、未匹配返还、平分、奇数筹码和筹码守恒；
   - 服务端权威快照和私有底牌投影。
7. 在当前任务允许的路径内实现最小变更。只有权威事实跨边界传播确有需要时才同步协议、投影和 UI，不在一个任务中顺带重设计持久化或无关界面。
8. 运行受影响 workspace 的 targeted tests，并为相关不变量和错误边界补充或更新测试。
9. 运行 `pnpm check`；记住它不能替代 targeted tests。
10. 如果存在对应的进行中计划，更新当前任务证据。每次完成任务前都要检查产品规格、设计文档、不变量、决策、计划和验收证据是否需要同步更新；系统事实变化时必须更新对应的规范文档，并在报告中给出文档影响分类。

## 决策冲突

如果需求与现有产品决策、ADR 或不变量不一致，停止实现并确认：是修改既有决策，还是修改需求。没有明确选择前，不得在代码中自行折中或静默改变事实来源。

## 停止条件

遇到以下情况时停止并报告：

- 产品规则存在歧义；
- 需求与现有决策、ADR 或不变量冲突，且尚未确认修改哪一方；
- 本次变更触及必需不变量的真实覆盖缺口，且当前任务无法安全补齐；
- 依赖任务缺失，或只能从文档而不是代码证据判断为完成；
- 请求超出当前任务边界；
- 客户端需要成为扑克事实来源。

不要用 `any`、跳过测试、弱化 schema、乐观客户端事实或在 UI 中复制第二套规则来绕过这些条件。
