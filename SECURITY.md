# 安全策略

## 支持范围

安全修复只面向最新 GitHub Release。早期开发构建和旧协议版本不会单独维护。

## 报告漏洞

请优先通过本仓库的 [GitHub Security Advisory](https://github.com/LeonemZhang/Texas_Holdem/security/advisories/new) 私下报告漏洞，不要在公开 Issue、讨论区或 Pull Request 中披露完整利用步骤、令牌、牌局数据或玩家隐私信息。

报告中请尽量包含：

- 受影响版本和操作系统。
- 可复现的最小步骤。
- 实际影响与预期行为。
- 必要的日志或截图；提交前请移除重连令牌、虚拟网络密钥和私人 IP。

如果私密报告入口不可用，请只创建一个不含敏感细节的 Issue，请求维护者提供私下沟通方式。

## 安全边界

Texas Holdem 面向可信朋友组成的实体或虚拟局域网。应用层使用 HTTP 与 Socket.IO，不自行提供 TLS 或端到端加密，也不应把 `32100/TCP` 或 `32101/UDP` 直接暴露到公网。使用 EasyTier 等第三方虚拟网络时，其传输保护取决于对应工具的配置。

本项目不防御能够控制房主电脑或修改房主服务进程的恶意房主。
