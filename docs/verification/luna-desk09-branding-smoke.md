# LUNA-DESK09 品牌身份验收记录

验收日期：2026-08-05（Asia/Shanghai）

## 资源与构建

- `pnpm brand:check`：通过，共 14 个派生资源。
- Windows ICO 包含 16、24、32、48、64、128 和 256 像素帧。
- `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm build`：通过。
- 客户端测试：32 个文件、157 项通过。
- 桌面端测试：12 个文件、31 项通过。
- `pnpm package:win`：通过，版本保持 `1.0.1`。

## Windows 产物

| 产物                            | 大小（bytes） | SHA-256                                                            |
| ------------------------------- | ------------: | ------------------------------------------------------------------ |
| `Texas Holdem-1.0.1-x64.msi`    |   115,585,024 | `2E983D1804278FC08D4511ABEE0720CCF1091AF409F90EA38EC9546D5DCF5D51` |
| `Texas Holdem-1.0.1-x64.zip`    |   142,212,971 | `6D62C4B2AA36539446F088A8312C6A91E9D31B1FB0D10F40931DF88F1AD971FB` |
| `win-unpacked/Texas Holdem.exe` |   225,949,696 | `D49BE143F16ECEED18722ADF937343F4B25764B1D31DFF54B391C0B9566CC23B` |

- EXE 的 `FileDescription`、`ProductName` 和 `InternalName` 均为 `Texas Holdem`。
- 包内 `resources/icon.ico` 与源码生成的 ICO SHA-256 完全一致；从 EXE 提取的系统图标为筹码双牌品牌图标。
- 隔离用户目录启动解压版后，系统中 5 个应用进程均命名为 `Texas Holdem.exe`；DevTools 页面目标标题为 `Texas Holdem`，地址为打包资源下的本地 `file://.../resources/client/index.html`。

## MSI 安装与快捷方式

- MSI 数据库：`ProductName=Texas Holdem`、`ProductVersion=1.0.1.0`，UpgradeCode 保持 `{B419EE84-D582-4FA3-9F65-60D45105F7B8}`。
- 卸载项 `ARPPRODUCTICON`、桌面快捷方式和开始菜单快捷方式均引用 `TexasHoldemIcon.exe`。
- 在系统无旧版安装的前提下执行当前用户静默安装，退出码为 `0`。
- 桌面和开始菜单均创建 `Texas Holdem.lnk`，目标为 `%LOCALAPPDATA%\Programs\Texas Holdem\Texas Holdem.exe`；两处从 Windows Installer 图标缓存提取出的图标均为筹码双牌。
- 测试完成后静默卸载，退出码为 `0`；快捷方式和安装目录均已清理。

## 浏览器资源

- Playwright 真实浏览器访问生产构建首页返回 HTTP 200，页面标题为 `Texas Holdem`，应用脚本、样式和房间探测请求正常。
- favicon SVG/ICO/16px/32px、Apple Touch Icon、Safari pinned-tab、manifest、browserconfig、192px/512px/maskable 图标和 Windows 磁贴共 12 个公开 URL 均返回 HTTP 200，并具有正确的 SVG、ICO、PNG、manifest 或 XML Content-Type。
- 生产 `index.html` 中全部品牌资源使用相对路径，可同时供房主 HTTP 服务和 Electron `file://` 页面加载。

## 已知边界

- 开发态任务管理器“详细信息”的底层调试二进制仍可显示 `electron.exe`；开发窗口与任务栏使用 `Texas Holdem` 身份。
- `.msi` 文件在资源管理器中可继续使用 Windows Installer 的文件类型图标；安装后的应用、快捷方式和卸载项不使用 Electron 默认资源。
- 产物未进行代码签名，保持现有发布策略。
- 版本未提升，已安装的同版本 `1.0.1` 需要先卸载再安装才能刷新系统缓存中的品牌资源。
