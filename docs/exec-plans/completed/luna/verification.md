# Luna 历史验收证据

本文是已取代 Luna 计划的历史证据模板。迁移时没有逐项回填证据，不得用空模板推断当前实现未完成；当前能力以代码、测试、产品规格和新的变更计划为准。

## 证据格式

```markdown
## <TASK_ID>

覆盖不变量:

- INV-...

自动化验证:

- <targeted test command>

场景:

- <boundary case>

执行方式: test / architecture / test + architecture / manual
覆盖状态: complete / partial / gap

证据:

- <file, test, screenshot or command output>
```

## 阶段门禁

- 纯规则阶段验证确定性、牌唯一性、座位、下注、底池和状态机不变量。
- 房间领域阶段使用内存和虚拟时钟，不启动网络或数据库。
- 协议阶段验证 schema 推导、版本边界、幂等和私有快照隔离。
- 持久化阶段验证事务、快照、异常恢复、正常关闭和记录目录。
- 客户端阶段验证组件、360px 和桌面视觉 smoke，并确认预览复用正式组件和 CSS。
- Electron 阶段保持 sandbox、context isolation 和 `nodeIntegration=false`。
- 环境敏感的 E2E、Electron 和 Windows smoke 不作为无 GUI 环境下 `pnpm check:full` 的默认部分。
