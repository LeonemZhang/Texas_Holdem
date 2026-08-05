# LUNA-DESK09 图标更新验收记录

验收日期：2026-08-05（Asia/Shanghai）

## 变更范围

- SVG 母版改为深绿底、金色双牌和黑桃 A 图标。
- 扑克牌轮廓改编自 SVG Repo 的 `Poker Cards` CC0 1.0 资源，来源及许可记录在 `THIRD_PARTY_NOTICES.md`。
- 由同一母版重新生成 Windows ICO、Electron PNG、浏览器 favicon、Apple Touch Icon、Web App、maskable 和 Windows 磁贴资源。
- 产品名、AppUserModelID、MSI UpgradeCode 和版本保持不变。

## 自动验证

- `pnpm brand:check`：通过，共 14 个派生资源；ICO 包含 16、24、32、48、64、128 和 256 像素帧。
- `pnpm format:check`、`pnpm lint`、`pnpm typecheck`、`pnpm build`：通过。
- 客户端测试：32 个文件、158 项通过。
- 桌面端测试：12 个文件、31 项通过。
- `pnpm package:win`：通过，版本保持 `1.0.1`。

## Windows 产物

| 产物                            | 大小（bytes） | SHA-256                                                            |
| ------------------------------- | ------------: | ------------------------------------------------------------------ |
| `Texas Holdem-1.0.1-x64.msi`    |   115,658,752 | `0A2759A8F8B74AA7A58AFC7081F40D33BC9D18906E4C0980DF3A5FC85D9E14AC` |
| `Texas Holdem-1.0.1-x64.zip`    |   142,298,058 | `88809FC0E527C5CDCC1B2F27A12360CF3B6F90B66154F8038AB47FDDE2941A02` |
| `win-unpacked/Texas Holdem.exe` |   225,949,696 | `E6E293C08E37DDC1EFC91A753E40D1CCE04F0C456BD69E5B5C405D261F673F22` |

- 打包目录的 `resources/icon.ico` 与源码生成的 ICO SHA-256 均为 `8526A67A9B74EB44A6B95E50BA293110EB4EB22AC220DD4185FEF9289A63A580`。
- 从打包后 EXE 提取的系统图标为新的金色双牌图标。
- EXE 的 `FileDescription`、`ProductName` 和 `InternalName` 均为 `Texas Holdem`。
- MSI 数据库保持 `ProductName=Texas Holdem`、`ProductVersion=1.0.1.0`、`ARPPRODUCTICON=TexasHoldemIcon.exe` 和原 UpgradeCode `{B419EE84-D582-4FA3-9F65-60D45105F7B8}`。
- Safari pinned-tab 从同一母版生成单色双牌遮罩；源码、生产构建和打包资源中的文件 SHA-256 均为 `5DEBE952B7E475F4FA14E1CF78DD28A18B5ED6677F696E5F4ACB7DD992AA23BF`。

## 人工检查边界

- 已检查桌面 512px、浏览器 32px、maskable 安全区和打包 EXE 提取图标，均为新的金色双牌图标。
- 本次更新未安装 MSI，也未改动系统快捷方式；同版本 `1.0.1` 如需检查 Windows 图标缓存，应先卸载已安装版本再重装。
