const packageJson = await Bun.file("package.json").json();
const serverJson = await Bun.file("server.json").json();
if (packageJson.mcpName !== serverJson.name) throw new Error("MCP names do not match");
if (packageJson.version !== serverJson.version) throw new Error("Server version is stale");
if (serverJson.packages?.[0]?.identifier !== packageJson.name) {
  throw new Error("MCP package identifier is stale");
}
if (serverJson.packages?.[0]?.version !== packageJson.version) {
  throw new Error("MCP package version is stale");
}
const cli = await Bun.file("dist/cli.js").text();
if (!cli.startsWith("#!/usr/bin/env node")) throw new Error("Published CLI lost its shebang");

const proc = Bun.spawn(["npm", "pack", "--dry-run", "--json"], {
  stdout: "pipe",
  stderr: "pipe",
});
const [stdout, stderr, exitCode] = await Promise.all([
  new Response(proc.stdout).text(),
  new Response(proc.stderr).text(),
  proc.exited,
]);
if (exitCode !== 0) throw new Error(stderr || "npm pack failed");
const packed = JSON.parse(stdout)[0];
const files = new Set<string>(packed.files.map((entry: { path: string }) => entry.path));
for (const required of ["dist/cli.js", "dist/index.js", "dist/index.d.ts", "dist/manifest.json", "server.json"]) {
  if (!files.has(required)) throw new Error(`Tarball is missing ${required}`);
}
console.log(`Validated ${packed.name}@${packed.version} (${packed.size} bytes).`);
