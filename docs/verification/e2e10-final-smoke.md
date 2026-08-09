# v1.0.0 最终 Windows 与联机验收记录

验收日期：2026-08-06（Asia/Shanghai）

## 验收环境

- Microsoft Windows 11 专业版 x64。
- 系统版本：`10.0.26200`。
- Node.js：`24.14.0`。
- pnpm：`10.0.0`。

当前环境没有独立 Windows 10 x64 机器，也没有位于另一个公网出口的 EasyTier 节点。因此本记录不把 Windows 10 和跨公网 EasyTier 标记为已完成实测；README 中的 Windows 10/11 是目标支持范围，EasyTier 章节是基于虚拟 IP 直连能力与官方组网方式的使用建议。

## 质量门禁

- `pnpm install --frozen-lockfile`：通过。
- `pnpm format:check`：通过。
- `pnpm lint`：通过。
- `pnpm typecheck`：通过。
- `pnpm test`：通过，共 141 个测试文件、599 个测试。
- `pnpm build`：通过。
- `pnpm test:e2e`：通过，共 9 个测试文件、13 个场景。
- `pnpm audit --prod`：通过，未发现已知生产依赖漏洞。
- `pnpm package:win`：通过。

完整测试首次运行暴露 `RoomRecordManager` 的异步确认框测试竞态：点击创建房间后同步查询尚未渲染的按钮。断言改为等待按钮出现后，目标场景连续运行 5 次通过，随后完整测试通过。

## 正式产物

| 文件                         | 大小（bytes） | SHA-256                                                            |
| ---------------------------- | ------------: | ------------------------------------------------------------------ |
| `Texas Holdem-1.0.0-x64.msi` |   115,675,136 | `D953C917A9EFBCC76430DDD4D607AC9FBAFCC9D67409D818A54D02904BF635F4` |
| `Texas Holdem-1.0.0-x64.zip` |   142,316,115 | `108669FBF08CF7BBB3398119D07B0A5DD8474C4C5CE68560BDBBEEA531FDDFDC` |
| `SHA256SUMS.txt`             |           186 | 不单独校验；内容列出上述两个文件                                   |

ZIP 的 98 个条目均可完整读取并成功解压，根目录包含：

- `Texas Holdem.exe`。
- `LICENSE.txt`。
- `THIRD_PARTY_NOTICES.md`。

MSI 数据库验证结果：

- `ProductName=Texas Holdem`。
- `ProductVersion=1.0.0.0`。
- `Manufacturer=LeonemZhang`。
- `UpgradeCode={B419EE84-D582-4FA3-9F65-60D45105F7B8}`。
- 产物未进行 Authenticode 代码签名，与 README 声明一致。

## Windows 产物 smoke

### ZIP

1. ZIP 成功解压到独立验收目录。
2. `Texas Holdem.exe` 成功启动并建立 5 个 Electron 进程。
3. 主窗口标题为 `Texas Holdem`。
4. 关闭主窗口后，本次启动的成品进程全部退出。

### MSI

1. 在此前未安装 Texas Holdem 的环境中静默安装成功，退出码为 `0`。
2. 卸载项显示 `Texas Holdem 1.0.0.0`。
3. 安装目录、桌面快捷方式和开始菜单快捷方式均存在。
4. 安装目录包含 EXE、GPL 文本和第三方声明。
5. 安装版成功启动，主窗口标题为 `Texas Holdem`。
6. 静默卸载成功，退出码为 `0`；卸载项、EXE 和两个快捷方式均已移除。

## 打包资源最小联机牌局

直接运行 ZIP 中的 `resources/host/index.mjs` 和 `resources/client`，使用临时端口和临时 SQLite 目录完成：

1. `/health` 返回服务版本 `1.0.0` 和协议版本 `3`。
2. 打包后的浏览器客户端首页可由房主服务返回。
3. Alice 通过 HTTP 创建房间，Bob 通过 HTTP 加入。
4. 两个玩家建立隔离的 Socket.IO 身份会话。
5. 双方准备后由房主开始首局。
6. 当前行动者弃牌后进入 `hand-ready` 结算阶段。
7. 双方筹码合计保持 `200`。
8. 验收完成后关闭 Socket、宿主进程并删除临时 SQLite 数据。

## README 图片

- 桌面牌局与桌面结算：`1920×1080`。
- 手机牌局与手机结算：`393×852`。

## 尚未完成的外部环境验收

- Windows 10 x64 的独立安装、启动和最小联机流程。
- 两个不同公网出口之间的 EasyTier 虚拟 IP 连通、最小牌局和关闭 UDP 广播中继后的 IP 直连。
- EasyTier UDP 广播中继下的跨虚拟网房间扫描。

这些项目需要额外操作系统或真实外部网络环境，不能由当前单机 Windows 11 环境替代。
