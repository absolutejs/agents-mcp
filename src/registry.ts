export const DEFAULT_REGISTRY_URL =
  "https://absolutejs.github.io/agents/v1/agents/index.json";

export type AgentCapability = {
  approval?: string;
  description?: string;
  effects?: string[];
  id: string;
  title?: string;
};

export type AgentInterface = {
  protocolVersion?: string;
  type: string;
  url: string;
};

export type RegistryAgent = {
  $schema?: string;
  authentication?: unknown;
  capabilities: AgentCapability[];
  createdAt?: string;
  description: string;
  id: string;
  interfaces: AgentInterface[];
  name: string;
  publisher?: {
    id?: string;
    name?: string;
    url?: string;
    jwksUri?: string;
  };
  updatedAt?: string;
  url: string;
  version: string;
};

export type RegistryRecord = {
  agent: RegistryAgent;
  signatures: unknown[];
  verified: true;
};

export type RegistryIndex = {
  agents: RegistryRecord[];
  count: number;
  generatedAt: string;
  schema: string;
};

export type RegistryClientOptions = {
  cacheTtlMs?: number;
  endpoint?: string;
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  maxBytes?: number;
  timeoutMs?: number;
};

export type AgentSearch = {
  capability?: string | undefined;
  interfaceType?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  query?: string | undefined;
};

export type AgentSearchResult = {
  agents: RegistryRecord[];
  count: number;
  nextOffset?: number;
  total: number;
};

const object = (value: unknown, field: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
};

const string = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
};

const httpsUrl = (value: unknown, field: string): string => {
  const raw = string(value, field);
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error(`${field} must be an HTTPS URL without credentials`);
  }
  return parsed.toString();
};

const parseCapability = (value: unknown, field: string): AgentCapability => {
  const candidate = object(value, field);
  const effects = candidate.effects;
  if (
    effects !== undefined &&
    (!Array.isArray(effects) || effects.some((effect) => typeof effect !== "string"))
  ) {
    throw new Error(`${field}.effects must be an array of strings`);
  }
  return {
    id: string(candidate.id, `${field}.id`),
    ...(typeof candidate.title === "string" ? { title: candidate.title } : {}),
    ...(typeof candidate.description === "string"
      ? { description: candidate.description }
      : {}),
    ...(typeof candidate.approval === "string"
      ? { approval: candidate.approval }
      : {}),
    ...(effects === undefined ? {} : { effects: effects as string[] }),
  };
};

const parseAgent = (value: unknown, field: string): RegistryAgent => {
  const candidate = object(value, field);
  if (!Array.isArray(candidate.capabilities) || candidate.capabilities.length === 0) {
    throw new Error(`${field}.capabilities must be a non-empty array`);
  }
  if (!Array.isArray(candidate.interfaces) || candidate.interfaces.length === 0) {
    throw new Error(`${field}.interfaces must be a non-empty array`);
  }
  const publisherValue = candidate.publisher;
  const publisher =
    publisherValue === undefined ? undefined : object(publisherValue, `${field}.publisher`);

  return {
    ...(typeof candidate.$schema === "string" ? { $schema: candidate.$schema } : {}),
    ...(candidate.authentication === undefined
      ? {}
      : { authentication: candidate.authentication }),
    capabilities: candidate.capabilities.map((item, index) =>
      parseCapability(item, `${field}.capabilities[${index}]`),
    ),
    ...(typeof candidate.createdAt === "string" ? { createdAt: candidate.createdAt } : {}),
    description: string(candidate.description, `${field}.description`),
    id: httpsUrl(candidate.id, `${field}.id`),
    interfaces: candidate.interfaces.map((item, index) => {
      const entry = object(item, `${field}.interfaces[${index}]`);
      return {
        type: string(entry.type, `${field}.interfaces[${index}].type`),
        url: httpsUrl(entry.url, `${field}.interfaces[${index}].url`),
        ...(typeof entry.protocolVersion === "string"
          ? { protocolVersion: entry.protocolVersion }
          : {}),
      };
    }),
    name: string(candidate.name, `${field}.name`),
    ...(publisher === undefined
      ? {}
      : {
          publisher: {
            ...(typeof publisher.id === "string" ? { id: publisher.id } : {}),
            ...(typeof publisher.name === "string" ? { name: publisher.name } : {}),
            ...(typeof publisher.url === "string" ? { url: publisher.url } : {}),
            ...(typeof publisher.jwksUri === "string"
              ? { jwksUri: publisher.jwksUri }
              : {}),
          },
        }),
    ...(typeof candidate.updatedAt === "string" ? { updatedAt: candidate.updatedAt } : {}),
    url: httpsUrl(candidate.url, `${field}.url`),
    version: string(candidate.version, `${field}.version`),
  };
};

export const parseRegistryIndex = (value: unknown): RegistryIndex => {
  const candidate = object(value, "registry");
  if (!Array.isArray(candidate.agents)) throw new Error("registry.agents must be an array");
  const agents = candidate.agents.map((item, index): RegistryRecord => {
    const record = object(item, `registry.agents[${index}]`);
    if (record.verified !== true) {
      throw new Error(`registry.agents[${index}] is not signature-verified`);
    }
    if (!Array.isArray(record.signatures) || record.signatures.length === 0) {
      throw new Error(`registry.agents[${index}].signatures must be non-empty`);
    }
    return {
      agent: parseAgent(record.agent, `registry.agents[${index}].agent`),
      signatures: record.signatures,
      verified: true,
    };
  });
  if (typeof candidate.count !== "number" || candidate.count !== agents.length) {
    throw new Error("registry.count does not match registry.agents.length");
  }
  return {
    agents,
    count: agents.length,
    generatedAt: string(candidate.generatedAt, "registry.generatedAt"),
    schema: string(candidate.schema, "registry.schema"),
  };
};

const normalize = (value: string) => value.trim().toLocaleLowerCase("en-US");

export class AgentRegistryClient {
  readonly endpoint: string;
  readonly #cacheTtlMs: number;
  readonly #fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  readonly #maxBytes: number;
  readonly #timeoutMs: number;
  #cached: { expiresAt: number; index: RegistryIndex } | undefined;

  constructor(options: RegistryClientOptions = {}) {
    this.endpoint = httpsUrl(
      options.endpoint ?? process.env.ABSOLUTE_AGENT_REGISTRY_URL ?? DEFAULT_REGISTRY_URL,
      "registry endpoint",
    );
    this.#cacheTtlMs = options.cacheTtlMs ?? 30_000;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#maxBytes = options.maxBytes ?? 5_000_000;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    if (this.#cacheTtlMs < 0 || this.#maxBytes < 1 || this.#timeoutMs < 1) {
      throw new Error("Registry cache, size, and timeout limits must be positive");
    }
  }

  clearCache(): void {
    this.#cached = undefined;
  }

  async load(): Promise<RegistryIndex> {
    if (this.#cached !== undefined && this.#cached.expiresAt > Date.now()) {
      return this.#cached.index;
    }
    const response = await this.#fetch(this.endpoint, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    if (!response.ok) throw new Error(`Registry returned HTTP ${response.status}`);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) {
      throw new Error("Registry response is not JSON");
    }
    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (declaredLength > this.#maxBytes) throw new Error("Registry response is too large");
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > this.#maxBytes) {
      throw new Error("Registry response is too large");
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(text);
    } catch {
      throw new Error("Registry returned invalid JSON");
    }
    const index = parseRegistryIndex(decoded);
    this.#cached = { expiresAt: Date.now() + this.#cacheTtlMs, index };
    return index;
  }

  async get(id: string): Promise<RegistryRecord | undefined> {
    const needle = normalize(id);
    return (await this.load()).agents.find(
      ({ agent }) => normalize(agent.id) === needle || normalize(agent.url) === needle,
    );
  }

  async search(input: AgentSearch = {}): Promise<AgentSearchResult> {
    const index = await this.load();
    const query = normalize(input.query ?? "");
    const capability = normalize(input.capability ?? "");
    const interfaceType = normalize(input.interfaceType ?? "");
    const offset = Math.max(0, Math.trunc(input.offset ?? 0));
    const limit = Math.min(100, Math.max(1, Math.trunc(input.limit ?? 20)));
    const filtered = index.agents.filter(({ agent }) => {
      const searchable = [
        agent.id,
        agent.name,
        agent.description,
        agent.publisher?.name ?? "",
        ...agent.capabilities.flatMap((item) => [item.id, item.title ?? "", item.description ?? ""]),
      ]
        .join("\n")
        .toLocaleLowerCase("en-US");
      return (
        (query.length === 0 || searchable.includes(query)) &&
        (capability.length === 0 ||
          agent.capabilities.some((item) => normalize(item.id).includes(capability))) &&
        (interfaceType.length === 0 ||
          agent.interfaces.some((item) => normalize(item.type) === interfaceType))
      );
    });
    const agents = filtered.slice(offset, offset + limit);
    const nextOffset = offset + agents.length;
    return {
      agents,
      count: agents.length,
      ...(nextOffset < filtered.length ? { nextOffset } : {}),
      total: filtered.length,
    };
  }
}
