import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AgentRegistryClient, type RegistryClientOptions } from "./registry.js";

const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  structuredContent: value as Record<string, unknown>,
});

export type AgentsMcpServerOptions = RegistryClientOptions & {
  client?: AgentRegistryClient;
};

export const createAgentsMcpServer = (options: AgentsMcpServerOptions = {}) => {
  const client = options.client ?? new AgentRegistryClient(options);
  const server = new McpServer({ name: "absolute-agents", version: "0.1.1" });

  server.registerTool(
    "search_agents",
    {
      annotations: { readOnlyHint: true, openWorldHint: true },
      description:
        "Search cryptographically verified agent listings by text, capability, or interface protocol.",
      inputSchema: {
        query: z.string().max(500).optional().describe("Text found in agent metadata."),
        capability: z.string().max(200).optional().describe("Capability ID or fragment."),
        interfaceType: z
          .enum(["a2a", "http", "mcp", "openapi", "websocket"])
          .optional(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      },
    },
    async (input) => json(await client.search(input)),
  );

  server.registerTool(
    "get_agent",
    {
      annotations: { readOnlyHint: true, openWorldHint: true },
      description: "Get one verified agent listing by its canonical discovery ID or agent URL.",
      inputSchema: { id: z.string().url().max(2_048) },
    },
    async ({ id }) => {
      const record = await client.get(id);
      return record === undefined
        ? {
            content: [{ type: "text" as const, text: `No verified agent found for ${id}` }],
            isError: true,
          }
        : json(record);
    },
  );

  server.registerTool(
    "registry_status",
    {
      annotations: { readOnlyHint: true, openWorldHint: true },
      description: "Report the public registry endpoint, generation time, schema, and agent count.",
      inputSchema: {},
    },
    async () => {
      const index = await client.load();
      return json({
        agentCount: index.count,
        endpoint: client.endpoint,
        generatedAt: index.generatedAt,
        schema: index.schema,
      });
    },
  );

  server.registerResource(
    "agent-registry-index",
    "absolute-agents://registry/index",
    {
      description: "The current verified AbsoluteJS public agent registry index.",
      mimeType: "application/json",
      title: "AbsoluteJS Agent Registry",
    },
    async (uri) => ({
      contents: [
        {
          mimeType: "application/json",
          text: JSON.stringify(await client.load(), null, 2),
          uri: uri.href,
        },
      ],
    }),
  );

  return { client, server };
};

export const serveAgentsMcpStdio = async (options: AgentsMcpServerOptions = {}) => {
  const instance = createAgentsMcpServer(options);
  await instance.server.connect(new StdioServerTransport());
  return instance;
};
