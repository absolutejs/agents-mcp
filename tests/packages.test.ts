import { describe, expect, test } from "bun:test";
import {
  PackageRegistryClient,
  parsePackageRegistryIndex,
} from "../src/packages.js";

const fixture = {
  count: 2,
  generatedAt: "2026-07-16T00:00:00.000Z",
  packages: [
    {
      category: "identity",
      description: "Human and agent authentication.",
      name: "@absolutejs/auth",
      npm: "https://www.npmjs.com/package/@absolutejs/auth",
      repository: "https://github.com/absolutejs/auth",
      standards: ["OAuth 2.0", "OIDC"],
      version: "0.55.0",
    },
    {
      category: "workflow",
      description: "Arazzo workflow execution.",
      name: "@absolutejs/arazzo",
      npm: "https://www.npmjs.com/package/@absolutejs/arazzo",
      repository: "https://github.com/absolutejs/arazzo",
      standards: ["Arazzo 1.1"],
      version: "0.1.0",
    },
  ],
  schema: "https://absolutejs.github.io/agents/schemas/package-registry-index/v1.json",
};
const response = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });

describe("PackageRegistryClient", () => {
  test("searches packages by text, category, and standard", async () => {
    const client = new PackageRegistryClient({
      endpoint: "https://registry.example/packages.json",
      fetch: async () => response(fixture),
    });
    expect((await client.search({ query: "authentication" })).packages[0]?.name).toBe(
      "@absolutejs/auth",
    );
    expect((await client.search({ category: "workflow", standard: "arazzo" })).total).toBe(1);
    expect((await client.get("@absolutejs/arazzo"))?.version).toBe("0.1.0");
  });

  test("rejects count mismatches, foreign names, and insecure endpoints", () => {
    expect(() => parsePackageRegistryIndex({ ...fixture, count: 3 })).toThrow("does not match");
    expect(() =>
      parsePackageRegistryIndex({
        ...fixture,
        packages: [{ ...fixture.packages[0], name: "not-absolute/auth" }],
        count: 1,
      }),
    ).toThrow("outside @absolutejs");
    expect(() => new PackageRegistryClient({ endpoint: "http://registry.example" })).toThrow(
      "HTTPS",
    );
  });
});
