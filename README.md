# @absolutejs/agents-mcp

A production, read-only MCP server for finding cryptographically verified AI
agents in the [AbsoluteJS public agent registry](https://absolutejs.github.io/agents/).
It gives MCP clients one installable discovery surface for agent names,
capabilities, protocols, publishers, authentication metadata, and signed
descriptors.

## Run it

```json
{
  "mcpServers": {
    "absolute-agents": {
      "command": "npx",
      "args": ["-y", "@absolutejs/agents-mcp"]
    }
  }
}
```

No credentials are required. The server fetches the public HTTPS registry,
refuses redirects, bounds response size and time, validates every record, and
caches successful indexes briefly. To use a compatible federated registry, set
`ABSOLUTE_AGENT_REGISTRY_URL` to its HTTPS index URL.

## MCP surface

- `search_agents` filters verified listings by text, capability, and MCP/A2A/
  HTTP/OpenAPI/WebSocket interface type, with bounded pagination.
- `get_agent` returns one listing by canonical discovery ID or agent URL.
- `registry_status` reports freshness, schema, endpoint, and verified count.
- `absolute-agents://registry/index` exposes the validated index as a resource.

All tools are marked read-only. Discovery never grants authorization: callers
must follow each returned agent's advertised OAuth, approval, and delegation
requirements before taking actions.

## Library use

```ts
import { AgentRegistryClient, createAgentsMcpServer } from "@absolutejs/agents-mcp";

const registry = new AgentRegistryClient();
const results = await registry.search({ capability: "calendar", interfaceType: "a2a" });
const { server } = createAgentsMcpServer({ client: registry });
```

The npm package declares `mcpName: io.github.absolutejs/agents` and ships the
official MCP Registry `server.json` metadata alongside its AbsoluteJS manifest.
