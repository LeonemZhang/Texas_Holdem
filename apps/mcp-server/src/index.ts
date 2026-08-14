#!/usr/bin/env node
import { startMcpServer } from './mcp-server.js';

startMcpServer().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`MCP server fatal: ${message}\n`);
  process.exit(1);
});
