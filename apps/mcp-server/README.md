# MCP Server

Texas Hold'em MCP 适配器通过 stdio 提供一个 AI 玩家生命周期。正式契约和工具说明见 [MCP 适配器设计](../../docs/design-docs/mcp.md)。

本地启动：

```powershell
cd "C:\Users\76458\Desktop\Texas Holdem"
pnpm --filter @texas-holdem/mcp-server build
node apps/mcp-server/dist/index.js
```

开发启动使用 `pnpm --filter @texas-holdem/mcp-server dev`。每个 MCP 进程只控制一个玩家，房间生命周期仍由 Host 管理。

验证：

```powershell
pnpm --filter @texas-holdem/mcp-server test
pnpm --filter @texas-holdem/mcp-server test:closed-loop
pnpm --filter @texas-holdem/mcp-server typecheck
pnpm --filter @texas-holdem/mcp-server build
```

`test:closed-loop` 会启动真实 Host 和独立 stdio MCP Agent，完成三手四街对局，在第一手后同时重启并恢复 Host 与 Agent，最后核验 Host SQLite 与 Agent 恢复令牌；不需要外部模型 API。
