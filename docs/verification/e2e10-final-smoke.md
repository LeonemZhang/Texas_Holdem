# LUNA-E2E10 最终 Windows 与联机验收记录

验收日期：2026-08-02（Asia/Shanghai）

## Windows 产物

- 构建命令：`pnpm package:win`
- 产物类型：Windows x64 解压目录
- 可执行文件：`release/win-unpacked/Texas Holdem.exe`
- 文件大小：225,613,824 bytes
- SHA-256：`47CDA0F68476C91390F4B0C8CBF59742791714E21A27A7035EBACBD8E81D6430`
- 启动结果：可执行文件成功启动，系统返回 4 个 Electron 进程，并创建标题为 `Texas Hold'em` 的主窗口。
- 资源检查：产物包含 `resources/client`、`resources/host/index.mjs` 和 `resources/app.asar`。

当前测试环境的 Windows 桌面处于锁定界面，窗口自动化无法将成品窗口切换到前台，因此没有继续对锁屏后的桌面窗口注入点击。桌面启动性通过进程与窗口句柄确认；共享客户端和房主服务的业务交互通过下述生产构建联机验收确认。

## 双客户端最小对局

使用生产构建启动真实房主 HTTP/Socket.IO 服务，并建立两个隔离浏览器会话：桌面宽度房主 Alice 与 360×800 手机玩家 Bob。

验收结果：

1. 房主创建房间后持续显示真实加入链接和二维码。
2. Bob 通过房间链接加入，双方准备后第一手没有自动开始。
3. 只有房主的“开始游戏”按钮在全员准备后启用，房主手动开始第一手。
4. Alice 执行弃牌，服务端结算 Bob 获胜；筹码从 100/100 变为 99/101，总额守恒。
5. 发牌前准备阶段可操作筹码请求；倒计时结束能自动进入下一手。
6. 统计页显示 Bob `+1`、最大单手盈利 `1`、最大底池 `3`，并显示 Alice 弃牌次数 `1`。
7. 牌桌始终显示总池，并按已开始街道纵向显示翻牌前、翻牌、转牌和河牌的本街投入；不展示主池、边池或待匹配标签。
8. 手机端 `innerWidth=360`、`document.documentElement.scrollWidth=360`，没有关键横向滚动。
9. 新会话浏览器控制台为 0 error、0 warning；房主进程强制退出期间出现的 Socket 重连错误符合预期。

## 恢复与关闭语义

1. 在第一手结算后强制结束房主进程，再使用同一 SQLite 数据目录启动。
2. Bob 使用原重连令牌自动恢复原 playerId、座位和筹码。
3. 重启后统计保持 Bob `+1`、Alice 弃牌次数 `1`，完成手数保持一致。
4. 房主正常关闭房间后再次启动同一数据库，`GET /api/rooms/current` 返回 HTTP 404；已关闭房间没有被恢复。
5. 关闭后的客户端进入明确的“房间已关闭”终态，可查看最终统计或清理会话返回首页。

## 最终质量门禁

- `pnpm format:check`：通过
- `pnpm lint`：通过
- `pnpm typecheck`：通过
- `pnpm test`：通过，共 389 个测试
- `pnpm test:e2e`：通过，9 个文件、13 个场景
- `pnpm build`：通过
- `pnpm package:win`：通过

## 已知非阻塞限制

- Windows 产物未签名，符合当前项目明确的不签名范围。
- 当前使用 Electron 默认程序图标，不影响联机与牌局功能。
- Node.js 24 会为内置 `node:sqlite` 输出 experimental warning，不影响迁移、保存或恢复结果。
