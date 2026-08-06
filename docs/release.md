# Windows 打包与版本管理

根目录 `package.json` 的 `version` 是源码版本的唯一权威值；桌面应用、房主服务和全部 workspace 清单必须与它一致，构建前会自动校验。

## 发布 Windows 产物

在仓库根目录执行：

```powershell
pnpm package:win
```

产物写入 `release/artifacts/`：

- `Texas Holdem-<版本>-x64.msi`：默认安装包。
- `Texas Holdem-<版本>-x64.zip`：免安装压缩包，解压后运行其中的 `Texas Holdem.exe`。

MSI 使用固定的 UpgradeCode。发布更高版本号的 MSI 时，Windows Installer 会将已安装的旧版本升级为新版本；这个 UpgradeCode 不能修改。ZIP 不参与安装或更新，适用于便携运行。

## 升级源码版本

```powershell
pnpm version:set <版本>
pnpm package:win
```

`version:set` 会更新根版本、所有 workspace 清单和房主服务的版本常量。若手动修改了根版本，可运行 `pnpm version:sync`；构建前可用 `pnpm version:check` 验证一致性。

本次 v1.0.1 发布使用：

```powershell
pnpm version:set 1.0.1
```

## 品牌资源

`assets/branding/app-icon.svg` 是桌面端和浏览器端图标的唯一母版。修改后运行：

```powershell
pnpm brand:generate
pnpm brand:check
```

生成器会更新 Windows 多尺寸 ICO、Electron 窗口 PNG、浏览器 favicon、Apple Touch Icon、Web App manifest、maskable 图标和 Windows 磁贴资源。根 `pnpm build` 会先执行 `brand:check`，派生资源缺失或过期时停止构建。

发布验收至少确认以下系统表面均显示 `Texas Holdem` 与统一品牌图标：

- 解压版和安装版可执行文件、原生窗口、任务栏及任务管理器进程组。
- 桌面快捷方式、开始菜单和 Windows 卸载入口。
- 浏览器标签页、收藏夹、添加到主屏幕和 Web App manifest。

MSI 的 UpgradeCode 必须保持不变。同版本 MSI 不作为已安装版本的升级包；版本不变时使用干净环境或先卸载后重装进行品牌验收。

## 正式发布门禁

最终候选提交必须在干净工作区运行：

```powershell
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm audit --prod
pnpm package:win
```

发布前必须确认 MSI 可安装、启动和卸载，ZIP 可完整解压并启动，两个产物均可创建房间并完成最小浏览器联机牌局。便携版和安装版都必须包含 `LICENSE.txt` 与 `THIRD_PARTY_NOTICES.md`。

正式 Release 只上传 MSI、ZIP 和 `SHA256SUMS.txt`。tag 使用 `v<版本>`，并且必须指向通过本地门禁和 GitHub Actions 的同一提交。先创建 Draft Release、上传并重新下载附件复核 SHA-256，确认无误后再发布。
