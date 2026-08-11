# GPT-5.6 Terra 基础框架开发计划

> 生命周期：legacy
> 归档说明：本计划完成于结构化任务证据契约建立之前；任务完成状态保留，验收采用同目录聚合说明和仓库现有代码、测试及 `docs/verification/` 记录，不补造逐任务历史证据。

> 目标模型：GPT-5.6 Terra  
> 建议推理强度：High  
> 计划类型：一次性工程骨架建设  
> 前置事实：`docs/product-specs/` 与 `ARCHITECTURE.md` 已评审通过

## 1. 计划定位

本计划只负责建立一个可以安装、开发、测试、构建和继续扩展的多应用 TypeScript 工程骨架，不实现德州扑克业务规则。

选择 Terra 执行本计划，是因为框架阶段需要同时处理 workspace、构建工具、Electron、React、Node 服务、类型边界和 CI，需要跨目录判断并完成一次完整的工程交接。后续确定性较高的业务模块交给 Luna 逐个实现。

## 2. 事实来源与优先级

执行前必须完整阅读：

1. `docs/product-specs/`：产品行为和永久非目标。
2. `ARCHITECTURE.md`：技术栈、运行时边界和模块职责。
3. 本计划：框架阶段的允许范围和验收标准。

如三者发生冲突：

- 产品行为以 `docs/product-specs/` 为准。
- 技术边界以 `ARCHITECTURE.md` 和 `docs/design-docs/` 为准。
- 本计划只能细化执行顺序，不能改变前两份文档。

## 3. 最终交付结果

Terra 完成后，仓库应具备：

- 可复现的 pnpm workspace 和锁文件。
- 统一、严格的 TypeScript、ESLint、格式化和测试配置。
- `client`、`desktop`、`host` 三个可独立构建的应用骨架。
- `poker-core`、`protocol`、`lan-discovery`、`ui`、`test-support` 五个共享包骨架。
- 可运行的 React 响应式起始页。
- 可运行的 Fastify 健康检查和 Socket.IO 系统握手。
- 启用沙箱、上下文隔离和窄 preload API 的 Electron 窗口。
- 统一的开发、检查、测试和构建命令。
- GitHub Actions 基础质量门禁。
- 面向后续 Luna 任务的仓库级 `AGENTS.md`。

## 4. 明确非目标

Terra 在本计划中不得实现：

- 扑克牌、牌型、座位、下注、底池或牌局状态机。
- 房间创建、加入、准备、筹码交换或统计业务。
- SQLite 表结构和领域持久化。
- UDP 房间发现业务。
- 完整牌桌、筹码交换或房主控制界面。
- Electron 启动房主对局服务的最终生命周期。
- 安装包发布、签名或正式版本号策略。
- 任何产品基线之外的功能。

框架阶段禁止用大量空接口、`TODO` 或假领域模型提前占位。只建立运行所需的真实薄骨架。

## 5. 执行原则

- 开始前检查 Git 状态，保留所有已有用户改动。
- 依赖必须固定明确版本并生成锁文件，不能保留浮动的 `latest`。
- 优先使用纯 TypeScript 和跨平台 npm scripts，确保 Windows PowerShell 可执行。
- 每完成一个阶段立即运行该阶段验证，不把所有错误留到最后处理。
- 如果需求与现有产品决策、ADR 或不变量不一致，先确认是修改既有决策还是修改需求；不能静默选择一方。
- 每完成一个阶段后，检查产品规格、设计文档、不变量、决策和验证证据是否需要同步更新；系统事实变化时必须更新对应文档。
- 不在 Electron renderer 中启用 Node.js integration。
- 不允许共享包反向导入 `apps/*`。
- 不为了让检查通过而关闭严格规则、跳过测试或加入宽泛 `any`。
- 如果某个依赖与当前 Node/Electron 不兼容，先记录证据并选择同职责的兼容版本，不改变架构层次。

## 6. 目标仓库结构

```text
Texas_Holdem/
├─ .github/
│  └─ workflows/
│     └─ quality.yml
├─ apps/
│  ├─ client/
│  │  ├─ src/
│  │  ├─ index.html
│  │  ├─ package.json
│  │  ├─ tsconfig.json
│  │  └─ vite.config.ts
│  ├─ desktop/
│  │  ├─ src/main/
│  │  ├─ src/preload/
│  │  ├─ package.json
│  │  └─ tsconfig.json
│  └─ host/
│     ├─ src/
│     ├─ package.json
│     └─ tsconfig.json
├─ packages/
│  ├─ poker-core/
│  ├─ protocol/
│  ├─ lan-discovery/
│  ├─ ui/
│  └─ test-support/
├─ docs/
│  ├─ product-specs/
│  ├─ design-docs/
│  └─ exec-plans/
├─ AGENTS.md
├─ package.json
├─ pnpm-lock.yaml
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ eslint.config.*
├─ .prettierrc.*
├─ .editorconfig
└─ .gitignore
```

允许根据所选 Electron 构建工具增加必要配置文件，但不得改变应用和共享包边界。

## 7. 分阶段实施计划

### TERRA-00：执行前审计

目标：确认起点和本机工具条件，不修改代码。

工作内容：

- 完整阅读三份基线文档。
- 检查 Git 分支、远端和工作区状态。
- 检查 Node.js、Corepack 和 pnpm 可用性。
- 确认仓库当前只有文档或识别已有框架文件。
- 记录不能覆盖的用户改动。

完成条件：

- 能明确列出当前分支、脏文件和工具版本。
- 没有在审计阶段产生文件改动。

### TERRA-01：根 workspace 与基础文件

目标：建立可复现的 pnpm monorepo 根配置。

允许范围：

- 根 `package.json`。
- `pnpm-workspace.yaml`。
- `tsconfig.base.json`。
- `.editorconfig`、`.gitignore` 和格式化配置。

要求：

- 根包设置为 private。
- 固定 package manager 及版本。
- 固定支持的 Node.js 主版本范围。
- workspace 只包含 `apps/*` 和 `packages/*`。
- 根脚本至少预留 `dev`、`lint`、`format:check`、`typecheck`、`test`、`build`。
- 根脚本必须通过 pnpm workspace 调度，不能硬编码个人绝对路径。

验证：

```text
pnpm install
pnpm exec tsc --version
pnpm --version
```

完成条件：安装成功并生成锁文件，重复安装不改变锁文件。

### TERRA-02：统一质量工具链

目标：让所有 workspace 使用同一套静态检查和测试约定。

允许范围：

- ESLint flat config。
- Prettier 配置。
- Vitest 基础配置或共享配置。
- 根 TypeScript 配置。
- 根脚本。

要求：

- TypeScript 开启 `strict`、`noUncheckedIndexedAccess` 和适用的未使用项检查。
- 禁止无说明的 `any`。
- 前端、Node 和 Electron 环境使用正确的 globals，不通过关闭规则混用环境。
- 测试文件能与源码一起获得正确类型。
- 格式检查与格式写入使用不同命令。

验证：

```text
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
```

完成条件：空业务骨架下四个命令均成功，且故意制造的类型错误能够被检查发现后再撤销该验证改动。

### TERRA-03：共享包骨架

目标：建立真实、最薄的共享包和依赖方向。

创建：

- `packages/poker-core`
- `packages/protocol`
- `packages/lan-discovery`
- `packages/ui`
- `packages/test-support`

每个包至少包含：

- 唯一且一致命名的 `package.json`。
- 继承根配置的 `tsconfig.json`。
- 明确的 `exports`。
- `src/index.ts`。
- 一个最小导出和对应 smoke test，或由包职责决定的编译检查。

依赖约束：

- `poker-core` 不依赖其他业务包。
- `protocol` 不依赖应用。
- `lan-discovery` 可以依赖 `protocol`，不能依赖 Electron。
- `ui` 可以依赖 React 和 `protocol` 类型，不能依赖桌面或房主应用。
- `test-support` 只在开发和测试中使用。

禁止事项：

- 不创建 `Card`、`Room`、`Player` 等未经 Luna 任务实现和测试的假领域类型。
- 不导出占位 `any`。
- 不创建跨包循环依赖。

验证：所有共享包可独立 typecheck、test 和 build。

### TERRA-04：共用 React 客户端骨架

目标：建立桌面端和浏览器端共用的 React 应用入口。

允许范围：`apps/client` 和 `packages/ui` 的框架级代码。

要求：

- 使用 React、Vite 和 TypeScript。
- 建立应用入口、错误边界和最小路由外壳。
- 定义 `RuntimeAdapter`，只表达框架级能力，例如运行环境类型和版本信息。
- 提供 browser adapter；desktop adapter 的真实 IPC 实现由 Electron preload 提供。
- 起始页只展示项目名称、运行环境、服务连接占位状态和文档化的开发入口。
- 布局在 360px 宽度下不横向溢出。
- 不实现联机大厅或牌桌业务。

测试：

- 应用入口渲染测试。
- browser adapter 测试。
- 360px 基础布局 smoke test，或可自动验证的等价样式约束。

验证：

```text
pnpm --filter client dev
pnpm --filter client test
pnpm --filter client build
```

### TERRA-05：房主服务骨架

目标：建立可独立启动、可测试、无扑克业务的 Node 服务。

允许范围：`apps/host` 和框架级 `protocol` 导出。

要求：

- 使用 Fastify 创建服务工厂，测试不得依赖固定端口。
- 提供 `/health`，返回明确的运行状态和协议版本。
- 提供 `/version` 或把版本信息合并进健康响应。
- 挂载 Socket.IO，并实现只读的 `system:hello` 握手。
- 握手返回协议版本、服务版本和服务端时间。
- 服务启动入口支持从环境或参数读取监听地址和端口。
- 测试中使用随机可用端口或 Fastify inject。
- 不创建房间集合、玩家集合或内存游戏状态。

测试：

- 服务工厂生命周期。
- `/health` 响应 schema。
- Socket.IO `system:hello` 请求和响应。
- 关闭服务后端口正确释放。

验证：

```text
pnpm --filter host test
pnpm --filter host build
```

### TERRA-06：Electron 桌面骨架

目标：建立安全的 Windows 桌面应用外壳。

允许范围：`apps/desktop` 和客户端 desktop adapter。

要求：

- 主进程创建单一主窗口。
- 开发模式加载 Vite 地址，构建模式加载本地打包资源。
- renderer 启用 sandbox 和 context isolation，禁用 Node.js integration。
- preload 只暴露版本化的 `getRuntimeInfo()` 等框架级 API。
- renderer 不直接获得 `ipcRenderer`、文件系统或任意命令执行能力。
- IPC handler 校验 sender 和输入。
- 本阶段不启动房主服务、不打开 UDP socket、不实现退出房间确认。

测试：

- preload 暴露对象的类型测试。
- IPC 参数校验测试。
- Electron 配置的静态安全断言。

验证：

```text
pnpm --filter desktop typecheck
pnpm --filter desktop test
pnpm --filter desktop build
```

并进行一次 Windows 本机启动 smoke check，确认客户端页面显示 desktop runtime。

### TERRA-07：开发联调与静态资源服务

目标：证明三个应用和共享包能够在一个开发工作区协同运行。

要求：

- 根 `pnpm dev` 能以明确方式启动需要的开发进程。
- 房主服务可以在构建后提供 `client` 的静态资源，但开发模式仍允许独立 Vite 热更新。
- 浏览器访问房主服务根地址能够加载共用客户端。
- Electron 仍加载本地受信任 UI，不从局域网房主加载远程 HTML。
- client、host 和 desktop 的构建顺序由 workspace 依赖或脚本显式表达。
- 端口冲突应给出可理解错误并正常退出。

测试：

- 构建后静态资源服务集成测试。
- 浏览器入口与 `/health` 共存测试。
- 协议版本在 client、host 和 desktop 间取自同一来源。

### TERRA-08：仓库级 Agent 指南

目标：为后续 Luna 小任务提供自动加载的稳定规则。

创建根 `AGENTS.md`，内容保持简洁并至少包括：

- 必读文档及优先级。
- workspace 目录职责。
- 依赖方向和禁止项。
- Windows 下安装、lint、typecheck、test、build 命令。
- 每个 Luna 任务只处理一个计划 ID。
- 修改前检查工作区，保留无关改动。
- 不在未授权时提交、推送或扩大功能范围。
- 任务完成必须运行模块测试和根级静态检查。
- 产品歧义先停下修订文档，不在代码中静默决定。

不要把完整产品文档复制进 `AGENTS.md`，只链接到事实来源。

### TERRA-09：CI 与最终交接

目标：建立框架质量门禁并形成 Luna 可接手的干净基线。

创建 GitHub Actions 工作流，至少执行：

```text
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

CI 要求：

- 使用受支持 Node.js 版本。
- 缓存 pnpm store，但不能依赖本机缓存成功。
- Ubuntu 执行静态检查、测试和普通构建。
- Windows 至少执行安装、类型检查、测试和 Electron 构建 smoke check。
- 测试不能访问公网或依赖真实局域网。

最终交接检查：

- 列出实际锁定的主要依赖版本。
- 列出所有根命令及用途。
- 展示 workspace 依赖图，确认无循环依赖。
- 运行全套质量命令并记录结果。
- 搜索 `TODO`、`FIXME`、宽泛 `any` 和跳过测试，逐项说明或清除。
- 检查 Git diff，确认没有实现本计划禁止的业务功能。

## 任务状态登记表

本表是本计划唯一的任务状态来源。Terra 已归档，所有阶段均以 `done` 表示；详细阶段说明保留在下方。

| ID       | Status | Depends               | Affected | Acceptance     | Detail |
| -------- | ------ | --------------------- | -------- | -------------- | ------ |
| TERRA-00 | done   | external:precondition | 工程骨架 | 见下方阶段说明 | -      |
| TERRA-01 | done   | external:precondition | 工程骨架 | 见下方阶段说明 | -      |
| TERRA-02 | done   | external:precondition | 工程骨架 | 见下方阶段说明 | -      |
| TERRA-03 | done   | external:precondition | 工程骨架 | 见下方阶段说明 | -      |
| TERRA-04 | done   | external:precondition | 工程骨架 | 见下方阶段说明 | -      |
| TERRA-05 | done   | external:precondition | 工程骨架 | 见下方阶段说明 | -      |
| TERRA-06 | done   | external:precondition | 工程骨架 | 见下方阶段说明 | -      |
| TERRA-07 | done   | external:precondition | 工程骨架 | 见下方阶段说明 | -      |
| TERRA-08 | done   | external:precondition | 工程骨架 | 见下方阶段说明 | -      |
| TERRA-09 | done   | external:precondition | 工程骨架 | 见下方阶段说明 | -      |

## 8. 根命令契约

Terra 可以调整底层工具，但必须交付以下稳定用户接口：

| 命令                             | 含义                                                      |
| -------------------------------- | --------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | 按锁文件安装依赖                                          |
| `pnpm dev`                       | 启动本地开发环境                                          |
| `pnpm format:check`              | 只检查格式，不修改文件                                    |
| `pnpm lint`                      | 执行静态规则检查                                          |
| `pnpm typecheck`                 | 检查所有 workspace 类型                                   |
| `pnpm test`                      | 执行全部非端到端测试                                      |
| `pnpm build`                     | 构建全部应用和共享包                                      |
| `pnpm test:e2e`                  | 端到端入口；框架阶段允许只有 smoke 用例，但命令必须可执行 |

## 9. Terra 完成定义

只有同时满足以下条件才能宣布基础框架完成：

- 全新 checkout 可以通过一条安装命令获得一致依赖。
- 所有根命令存在且成功。
- client 可以在浏览器运行并完成生产构建。
- host 可以独立运行、响应健康检查、完成 Socket.IO 系统握手并关闭。
- desktop 可以在 Windows 启动并加载本地 client。
- 360px 宽度下基础页面无水平滚动。
- Electron 安全配置有自动化断言。
- CI 配置覆盖 Windows 和普通构建环境。
- `AGENTS.md` 能指导 Luna 只执行单个计划 ID。
- 没有扑克领域占位实现、SQLite 领域表、UDP 业务或完整业务 UI。
- 实际代码与两份已评审基线文档没有冲突。

## 10. 交给 Terra 的建议执行提示

```text
请执行 docs/exec-plans/completed/terra/plan.md。

完整阅读 docs/product-specs/、ARCHITECTURE.md、相关 docs/design-docs/ 和该计划后再修改代码。
按 TERRA-00 至 TERRA-09 顺序执行，每完成一个阶段立即运行阶段验证。
只建立基础框架，不实现任何扑克、房间、筹码、持久化或局域网发现业务。
保留所有无关工作区改动。遇到产品或架构歧义时停止并报告，不要静默决定。

完成时报告：
1. 各阶段交付物；
2. 实际锁定的主要版本；
3. 所有验证命令和结果；
4. 与计划的偏差；
5. 当前 Git 状态。
```

## 11. 模型使用依据

Codex 官方模型选择说明将 Terra 定位为适合日常生产任务、编码以及需要可靠判断的通用模型；Luna 更适合目标清晰、可重复和高吞吐的小任务。本计划据此将跨 workspace 的基础工程判断集中交给 Terra，将业务增量留给 Luna。

参考：[Codex 模型选择](https://learn.chatgpt.com/docs/models#recommended-models)、[Codex 最佳实践](https://learn.chatgpt.com/guides/best-practices.md)
