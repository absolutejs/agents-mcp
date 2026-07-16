import { defineManifest, toolFactory } from "@absolutejs/manifest";
import { Type } from "@sinclair/typebox";

const tool = toolFactory<never>();

export const manifest = defineManifest<Record<string, never>, never>()({
  contract: 2,
  identity: {
    accent: "#7c3aed",
    category: "ai",
    description:
      "A read-only MCP server for finding verified agents and production agent-first packages in the public AbsoluteJS registry.",
    docsUrl: "https://github.com/absolutejs/agents-mcp",
    name: "@absolutejs/agents-mcp",
    tagline: "Let every MCP client discover verified agents and packages.",
  },
  settings: Type.Object({}),
  tools: {
    configure_agents_mcp: tool.workspace({
      annotations: { readOnlyHint: true },
      capabilities: ["read"],
      description: "Return the install-and-run configuration for the AbsoluteJS agent registry MCP server.",
      input: Type.Object({}),
      handler: async () =>
        JSON.stringify({ command: "npx", args: ["-y", "@absolutejs/agents-mcp"] }),
    }),
  },
  wiring: [
    {
      description: "Run the signed agent registry server over stdio.",
      id: "stdio",
      server: {
        code: "await serveAgentsMcpStdio()",
        imports: [{ from: "@absolutejs/agents-mcp", names: ["serveAgentsMcpStdio"] }],
        placement: "module-scope",
      },
      title: "Agent registry MCP server",
    },
  ],
});
