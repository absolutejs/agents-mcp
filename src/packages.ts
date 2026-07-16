export const DEFAULT_PACKAGE_REGISTRY_URL =
  "https://absolutejs.github.io/agents/v1/packages/index.json";

export type AbsolutePackage = {
  category: string;
  description: string;
  name: string;
  npm: string;
  repository: string;
  standards?: string[];
  version: string;
};

export type PackageRegistryIndex = {
  count: number;
  generatedAt: string;
  packages: AbsolutePackage[];
  schema: string;
};

export type PackageSearch = {
  category?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  query?: string | undefined;
  standard?: string | undefined;
};

export type PackageSearchResult = {
  count: number;
  nextOffset?: number;
  packages: AbsolutePackage[];
  total: number;
};

export type PackageRegistryClientOptions = {
  cacheTtlMs?: number;
  endpoint?: string;
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  maxBytes?: number;
  timeoutMs?: number;
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
  const parsed = new URL(string(value, field));
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error(`${field} must be an HTTPS URL without credentials`);
  }
  return parsed.toString();
};
const normalize = (value: string) => value.trim().toLocaleLowerCase("en-US");

export const parsePackageRegistryIndex = (value: unknown): PackageRegistryIndex => {
  const candidate = object(value, "package registry");
  if (!Array.isArray(candidate.packages)) {
    throw new Error("package registry.packages must be an array");
  }
  const packages = candidate.packages.map((value, index): AbsolutePackage => {
    const entry = object(value, `package registry.packages[${index}]`);
    const standards = entry.standards;
    if (
      standards !== undefined &&
      (!Array.isArray(standards) || standards.some((item) => typeof item !== "string"))
    ) {
      throw new Error(`package registry.packages[${index}].standards must be strings`);
    }
    const name = string(entry.name, `package registry.packages[${index}].name`);
    if (!name.startsWith("@absolutejs/")) {
      throw new Error(`package registry.packages[${index}].name is outside @absolutejs`);
    }
    return {
      category: string(entry.category, `package registry.packages[${index}].category`),
      description: string(entry.description, `package registry.packages[${index}].description`),
      name,
      npm: httpsUrl(entry.npm, `package registry.packages[${index}].npm`),
      repository: httpsUrl(
        entry.repository,
        `package registry.packages[${index}].repository`,
      ),
      ...(standards === undefined ? {} : { standards: standards as string[] }),
      version: string(entry.version, `package registry.packages[${index}].version`),
    };
  });
  if (typeof candidate.count !== "number" || candidate.count !== packages.length) {
    throw new Error("package registry.count does not match package registry.packages.length");
  }
  return {
    count: packages.length,
    generatedAt: string(candidate.generatedAt, "package registry.generatedAt"),
    packages,
    schema: string(candidate.schema, "package registry.schema"),
  };
};

export class PackageRegistryClient {
  readonly endpoint: string;
  readonly #cacheTtlMs: number;
  readonly #fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  readonly #maxBytes: number;
  readonly #timeoutMs: number;
  #cached: { expiresAt: number; index: PackageRegistryIndex } | undefined;

  constructor(options: PackageRegistryClientOptions = {}) {
    this.endpoint = httpsUrl(
      options.endpoint ??
        process.env.ABSOLUTE_PACKAGE_REGISTRY_URL ??
        DEFAULT_PACKAGE_REGISTRY_URL,
      "package registry endpoint",
    );
    this.#cacheTtlMs = options.cacheTtlMs ?? 30_000;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#maxBytes = options.maxBytes ?? 5_000_000;
    this.#timeoutMs = options.timeoutMs ?? 10_000;
    if (this.#cacheTtlMs < 0 || this.#maxBytes < 1 || this.#timeoutMs < 1) {
      throw new Error("Package registry cache, size, and timeout limits must be positive");
    }
  }

  clearCache(): void {
    this.#cached = undefined;
  }

  async load(): Promise<PackageRegistryIndex> {
    if (this.#cached && this.#cached.expiresAt > Date.now()) return this.#cached.index;
    const response = await this.#fetch(this.endpoint, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(this.#timeoutMs),
    });
    if (!response.ok) throw new Error(`Package registry returned HTTP ${response.status}`);
    if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
      throw new Error("Package registry response is not JSON");
    }
    const length = Number(response.headers.get("content-length") ?? "0");
    if (length > this.#maxBytes) throw new Error("Package registry response is too large");
    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > this.#maxBytes) {
      throw new Error("Package registry response is too large");
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(body);
    } catch {
      throw new Error("Package registry returned invalid JSON");
    }
    const index = parsePackageRegistryIndex(decoded);
    this.#cached = { expiresAt: Date.now() + this.#cacheTtlMs, index };
    return index;
  }

  async get(name: string): Promise<AbsolutePackage | undefined> {
    const needle = normalize(name);
    return (await this.load()).packages.find((entry) => normalize(entry.name) === needle);
  }

  async search(input: PackageSearch = {}): Promise<PackageSearchResult> {
    const index = await this.load();
    const query = normalize(input.query ?? "");
    const category = normalize(input.category ?? "");
    const standard = normalize(input.standard ?? "");
    const offset = Math.max(0, Math.trunc(input.offset ?? 0));
    const limit = Math.min(100, Math.max(1, Math.trunc(input.limit ?? 20)));
    const filtered = index.packages.filter((entry) => {
      const searchable = [entry.name, entry.description, entry.category, ...(entry.standards ?? [])]
        .join("\n")
        .toLocaleLowerCase("en-US");
      return (
        (query.length === 0 || searchable.includes(query)) &&
        (category.length === 0 || normalize(entry.category) === category) &&
        (standard.length === 0 ||
          (entry.standards ?? []).some((item) => normalize(item).includes(standard)))
      );
    });
    const packages = filtered.slice(offset, offset + limit);
    const nextOffset = offset + packages.length;
    return {
      count: packages.length,
      ...(nextOffset < filtered.length ? { nextOffset } : {}),
      packages,
      total: filtered.length,
    };
  }
}
