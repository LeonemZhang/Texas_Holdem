# 当前局号显示时机验收证据

任务转为 `done` 前，为该任务添加同名二级标题并填写所有字段；没有适用不变量时在“覆盖不变量”写明“无”。

## HANDNUM-001

### 覆盖不变量

- INV-AUTH-001
- INV-HAND-001

### 自动化验证

- `pnpm --filter @texas-holdem/protocol test -- src/player-snapshot.test.ts`：通过；Vitest 实际运行 12 个文件、76 个测试，包含 `PlayerSnapshotSchema` 的可选字段、正整数/安全整数和旧快照兼容断言。
- `pnpm --filter @texas-holdem/host test -- src/application/snapshot-projector.test.ts src/application/game-runtime.test.ts`：通过；Vitest 实际运行 44 个文件、196 个测试，包含 Host 投影、结算/准备/下一局生命周期和恢复覆盖。
- `pnpm --filter @texas-holdem/client test -- src/room/GameRoom.test.tsx`：通过；Vitest 实际运行 39 个文件、314 个测试，包含权威局号、结算显示、下一局切换、暂停保持和缺失字段回退。
- `pnpm check`：通过；Harness check、Harness test（26 tests）、全仓格式检查、lint 和 packages/apps typecheck 均通过。

### 场景

- 首局翻牌前显示第 1 局，`completedHands` 为 0。
- 首局刚结算、结算遮罩和准备窗口显示第 1 局，`completedHands` 为 1。
- 全员准备等待期间局号保持第 1 局，不因倒计时或请求状态变化而自增。
- 下一局真正创建并收到新 `handId` 的权威快照后，进度区才显示第 2 局，`completedHands` 仍为 1。
- 第二局刚结算时结算区显示第 2 局，`completedHands` 为 2。
- 暂停、重连和恢复后，当前局号仍来自 Host 投影，不因客户端重新连接而增加。
- 若保留旧快照兼容路径，验证缺失 `game.handNumber` 时的回退；若采用破坏性协议升级，验证所有旧版本入口和恢复快照按既定边界拒绝。

### 执行方式

测试 workspace：`C:\Users\76458\.codex\worktrees\d9ff\Texas Holdem`；通过 `pnpm install --offline --frozen-lockfile` 仅安装本 worktree 的本地依赖产物，未修改 `pnpm-lock.yaml` 或主工作区。Node/pnpm 版本和命令结果由本次终端输出记录；未记录密钥或个人信息。

### 覆盖状态

HANDNUM-001 的协议、Host 投影、客户端显示、targeted tests 和仓库门禁均完成；旧恢复态缺少完成局数时保持可选字段兼容，不伪造已结算局号。计划状态为 `done`。

### 证据

协议证据：[player-snapshot.ts](../../../../packages/protocol/src/player-snapshot.ts)、[协议测试](../../../../packages/protocol/src/player-snapshot.test.ts)；Host 证据：[snapshot-projector.ts](../../../../apps/host/src/application/snapshot-projector.ts)、[投影测试](../../../../apps/host/src/application/snapshot-projector.test.ts)、[运行时测试](../../../../apps/host/src/application/game-runtime.test.ts)；客户端证据：[GameRoom.tsx](../../../../apps/client/src/room/GameRoom.tsx)、[客户端测试](../../../../apps/client/src/room/GameRoom.test.tsx)。`git diff --check`、Harness、格式、lint、typecheck 和 `pnpm check` 均通过。
