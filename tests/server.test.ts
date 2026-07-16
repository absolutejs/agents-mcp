import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { AgentRegistryClient } from "../src/registry.js";
import { createAgentsMcpServer } from "../src/server.js";
import { PackageRegistryClient } from "../src/packages.js";

test("exposes searchable tools and a registry resource over MCP", async () => {
  const fixture = {
    agents: [
      {
        agent: {
          capabilities: [{ id: "code.review" }],
          description: "Reviews code.",
          id: "https://review.example/.well-known/absolute-agent.json",
          interfaces: [{ type: "a2a", url: "https://review.example/a2a" }],
          name: "Reviewer",
          url: "https://review.example/",
          version: "1.0.0",
        },
        signatures: [{}],
        verified: true,
      },
    ],
    count: 1,
    generatedAt: "2026-07-16T00:00:00.000Z",
    schema: "https://absolutejs.com/schemas/agent-registry-index/v1",
  };
  const registryClient = new AgentRegistryClient({
    endpoint: "https://registry.example/index.json",
    fetch: async () =>
      new Response(JSON.stringify(fixture), {
        headers: { "content-type": "application/json" },
      }),
  });
  const packageClient = new PackageRegistryClient({
    endpoint: "https://registry.example/packages.json",
    fetch: async () =>
      new Response(
        JSON.stringify({
          count: 1,
          generatedAt: "2026-07-16T00:00:00.000Z",
          packages: [
            {
              category: "identity",
              description: "Human and agent auth.",
              name: "@absolutejs/auth",
              npm: "https://www.npmjs.com/package/@absolutejs/auth",
              repository: "https://github.com/absolutejs/auth",
              version: "0.55.0",
            },
          ],
          schema: "https://absolutejs.github.io/agents/schemas/package-registry-index/v1.json",
        }),
        { headers: { "content-type": "application/json" } },
      ),
  });
  const { server } = createAgentsMcpServer({ client: registryClient, packageClient });
  const client = new Client({ name: "test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const tools = await client.listTools();
  expect(tools.tools.map(({ name }) => name)).toEqual([
    "search_agents",
    "search_packages",
    "get_package",
    "get_agent",
    "registry_status",
  ]);
  const result = await client.callTool({
    name: "search_agents",
    arguments: { capability: "code.review" },
  });
  expect(JSON.stringify(result)).toContain("Reviewer");
  const packageResult = await client.callTool({
    name: "search_packages",
    arguments: { query: "auth" },
  });
  expect(JSON.stringify(packageResult)).toContain("@absolutejs/auth");
  const resources = await client.listResources();
  expect(resources.resources[0]?.uri).toBe("absolute-agents://registry/index");
  expect(resources.resources[1]?.uri).toBe("absolute-agents://packages/index");

  await client.close();
  await server.close();
});
