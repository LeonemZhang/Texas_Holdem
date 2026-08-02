# Windows 打包与版本管理

根目录 `package.json` 的 `version` 是源码版本的唯一权威值。当前为 `1.0.0`；桌面应用、房主服务和全部 workspace 清单必须与它一致，构建前会自动校验。

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
pnpm version:set 1.0.1
pnpm package:win
```

`version:set` 会更新根版本、所有 workspace 清单和房主服务的版本常量。若手动修改了根版本，可运行 `pnpm version:sync`；构建前可用 `pnpm version:check` 验证一致性。
