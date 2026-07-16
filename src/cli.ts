#!/usr/bin/env node
import { serveAgentsMcpStdio } from "./server.js";

process.on("uncaughtException", (error) => {
  console.error("absolute-agents-mcp:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
process.on("unhandledRejection", (error) => {
  console.error("absolute-agents-mcp:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

await serveAgentsMcpStdio();
