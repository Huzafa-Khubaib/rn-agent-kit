import { readFile } from "node:fs/promises";
import { pathExists, writeText } from "./fs.js";

export type McpConfig = {
  mcpServers?: Record<string, unknown>;
  servers?: Record<string, unknown>;
  [key: string]: unknown;
};

/** Deep-merge MCP server maps: existing keys win unless `overwrite` is true. */
export function mergeMcpConfig(
  existing: McpConfig | null,
  incoming: McpConfig,
  opts: { overwrite?: boolean } = {},
): McpConfig {
  const overwrite = Boolean(opts.overwrite);
  const base: McpConfig = existing ? { ...existing } : {};
  const baseServers = {
    ...(base.mcpServers ?? {}),
  };
  const incomingServers = incoming.mcpServers ?? incoming.servers ?? {};
  for (const [name, server] of Object.entries(incomingServers)) {
    if (overwrite || !(name in baseServers)) {
      baseServers[name] = server;
    }
  }
  return {
    ...base,
    ...incoming,
    mcpServers: baseServers,
  };
}

export async function writeMergedMcpJson(
  filePath: string,
  incoming: McpConfig,
  opts: { overwrite?: boolean; dryRun?: boolean } = {},
): Promise<{ written: boolean; merged: McpConfig }> {
  let existing: McpConfig | null = null;
  if (await pathExists(filePath)) {
    try {
      existing = JSON.parse(await readFile(filePath, "utf8")) as McpConfig;
    } catch {
      existing = null;
    }
  }
  const merged = mergeMcpConfig(existing, incoming, { overwrite: opts.overwrite });
  if (!opts.dryRun) {
    await writeText(filePath, `${JSON.stringify(merged, null, 2)}\n`);
  }
  return { written: !opts.dryRun, merged };
}
