import { describe, expect, test } from "bun:test";
import { AgentRegistryClient, parseRegistryIndex } from "../src/registry.js";

const agent = {
  $schema: "https://absolutejs.com/schemas/agent-discovery/v1",
  capabilities: [
    {
      approval: "never",
      description: "Searches public documentation.",
      effects: ["read"],
      id: "docs.search",
      title: "Search docs",
    },
  ],
  description: "A documentation research agent.",
  id: "https://docs.example/.well-known/absolute-agent.json",
  interfaces: [{ type: "mcp", url: "https://docs.example/mcp" }],
  name: "Docs Researcher",
  publisher: { name: "Example" },
  url: "https://docs.example/",
  version: "1.0.0",
};

const fixture = {
  agents: [{ agent, signatures: [{ algorithm: "Ed25519" }], verified: true }],
  count: 1,
  generatedAt: "2026-07-16T00:00:00.000Z",
  schema: "https://absolutejs.com/schemas/agent-registry-index/v1",
};

const response = (body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json", ...headers },
  });

describe("AgentRegistryClient", () => {
  test("searches verified records across text, capability, and interface", async () => {
    let calls = 0;
    const client = new AgentRegistryClient({
      endpoint: "https://registry.example/index.json",
      fetch: (async () => {
        calls += 1;
        return response(fixture);
      }),
    });

    expect((await client.search({ query: "research" })).total).toBe(1);
    expect((await client.search({ capability: "docs", interfaceType: "mcp" })).count).toBe(1);
    expect((await client.get(agent.id))?.agent.name).toBe("Docs Researcher");
    expect(calls).toBe(1);
  });

  test("supports bounded pagination", async () => {
    const many = {
      ...fixture,
      agents: Array.from({ length: 3 }, (_, index) => ({
        agent: {
          ...agent,
          id: `https://agent-${index}.example/.well-known/absolute-agent.json`,
          name: `Agent ${index}`,
          url: `https://agent-${index}.example/`,
        },
        signatures: [{ algorithm: "Ed25519" }],
        verified: true,
      })),
      count: 3,
    };
    const client = new AgentRegistryClient({
      endpoint: "https://registry.example/index.json",
      fetch: async () => response(many),
    });
    const first = await client.search({ limit: 2 });
    expect(first.count).toBe(2);
    expect(first.nextOffset).toBe(2);
    const second = await client.search({ limit: 2, offset: first.nextOffset ?? 0 });
    expect(second.count).toBe(1);
    expect(second.nextOffset).toBeUndefined();
  });

  test("rejects insecure endpoints, redirects, unverified entries, and oversized bodies", async () => {
    expect(() => new AgentRegistryClient({ endpoint: "http://registry.example" })).toThrow(
      "HTTPS",
    );
    expect(() => parseRegistryIndex({ ...fixture, agents: [{ ...fixture.agents[0], verified: false }] })).toThrow(
      "not signature-verified",
    );
    const client = new AgentRegistryClient({
      endpoint: "https://registry.example/index.json",
      fetch: async () => response(fixture, { "content-length": "999" }),
      maxBytes: 50,
    });
    await expect(client.load()).rejects.toThrow("too large");
  });

  test("rejects malformed registry documents instead of returning partial results", () => {
    expect(() => parseRegistryIndex({ ...fixture, count: 2 })).toThrow("does not match");
    expect(() =>
      parseRegistryIndex({
        ...fixture,
        agents: [
          {
            ...fixture.agents[0],
            agent: { ...agent, interfaces: [{ type: "mcp", url: "javascript:alert(1)" }] },
          },
        ],
      }),
    ).toThrow("HTTPS");
  });
});
