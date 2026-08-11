# 桌面端设计

## Electron 主进程

主进程负责创建和管理窗口、枚举网络适配器、发送 UDP 发现、启动/停止独立房主服务、执行原生关闭确认和通过窄 IPC 提供本机记录管理。主进程不实现扑克规则。

- 主窗口是本地受信任 renderer 的普通窗口，按启动显示器工作区裁剪 1920×1080 目标尺寸，不调用最大化或独占全屏。
- 创建房间前检查目标 TCP 端口；已被房主服务占用时返回可解释错误，不按进程名广泛终止其他进程。
- 通过受限 preload 通道复制邀请码二维码 PNG；浏览器优先使用 Clipboard API，不能向 renderer 暴露通用剪贴板能力。
- 通过窄 IPC 提供本机对局记录的列出、创建、恢复、归档、删除和查看入口；不暴露 SQLite、服务进程句柄或通用 IPC。
- 记录管理使用仅本机 IPC 的宿主模式，不监听 HTTP、Socket.IO 或 UDP，不公布 LAN 地址。
- 主窗口只保留本地 renderer 地址；外部 HTTP(S) 交给系统浏览器打开，拒绝所有未经允许的新窗口，默认隐藏应用菜单。
- 创建窗口前固定产品名和 Windows AppUserModelID；打包配置显式固定可执行文件、快捷方式和卸载项身份，原生窗口从真实品牌资源路径加载图标。

## 房主服务进程

房主服务以独立 Node.js 进程运行，避免 UI 或 renderer 异常直接污染游戏状态。它负责 HTTP 静态资源、Socket.IO 连接与身份恢复、UDP 发现响应、房间/牌局/筹码命令、服务端计时、SQLite 持久化和按玩家过滤私有信息。

管理模式不创建 LAN 网络服务；只有创建或恢复实际房间时才以选定或记录中的网卡启动完整宿主服务。启动成功后向主进程发送带实例标识的就绪信号；服务持续检测父进程，父进程消失时执行异常关闭，不能伪造正常 `CLOSED` 事件。服务停止必须释放 TCP、UDP、计时器和持久化连接。

## 安全边界

Renderer 保持 sandbox、context isolation 和 `nodeIntegration=false`。Preload 只暴露按功能划分、参数校验后的 API，不暴露原始 `ipcRenderer`、文件系统、SQLite、服务进程句柄或通用 IPC。IPC handler 校验 sender 和输入。桌面始终加载本地打包 UI，不加载房主或其他玩家提供的远程 HTML；外部链接交给系统浏览器。

网络消息和恢复快照是不可信输入，通过 `packages/protocol` 的运行时 schema 校验；IPC 参数通过 `apps/desktop/src/shared/runtime.ts` 中由主进程、preload 与 renderer 共用的 schema 校验。Electron 不能直接导入领域规则，规则执行留在 host/poker-core。

## 记录管理与数据目录

Electron 在 `ready` 前将 `userData` 和 Chromium `sessionData` 固定到操作系统 `appData/Texas Holdem`，房主 SQLite 使用其下的 `rooms` 子目录。网卡选择只存在于当前创建或恢复的 renderer 表单；没有成功创建/恢复时必须丢弃，不能成为应用级宿主配置。

记录管理只能由本机房主操作：运行中记录从内存运行时投影，其他记录从快照、手牌摘要和统计事实重建；恢复优先使用记录中仍属于本机的 IPv4，失效时要求重新选择。一次只能载入一条运行记录；已有运行记录时创建新房间必须先恢复，或按正常关闭流程保存最终快照、通知玩家、停止服务并等待端口释放。

## 品牌和窗口

产品名、窗口、任务栏、快捷方式、安装卸载入口、favicon、Web App 和系统磁贴使用统一资源。构建检查 ICO、favicon、Web App 和系统磁贴派生资源，防止品牌漂移或回退为 Electron 默认资源。窗口以 1920×1080 为目标并按工作区裁剪安全尺寸，不以分辨率检测阻止运行。

## 相关不变量

- `INV-ARCH-001`、`INV-ARCH-002`
- `INV-PERSIST-001`
- `INV-AUTH-001`
