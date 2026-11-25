import os from "node:os";
import path from "node:path";
import { writeMergedMcpJson, type McpConfig } from "../utils/mcp-merge.js";
import { buildKitMcpServers } from "./mcp-servers.js";

export type AgentMcpTarget =
  | "cursor"
  | "claude"
  | "vscode"
  | "windsurf-project"
  | "windsurf-global";

export interface McpInstallResult {
  target: AgentMcpTarget;
  path: string;
  written: boolean;
  skipped?: string;
}

export function mcpPathForTarget(cwd: string, target: AgentMcpTarget): string {
  switch (target) {
    case "cursor":
      return path.join(cwd, ".cursor", "mcp.json");
    case "claude":
      return path.join(cwd, ".mcp.json");
    case "vscode":
      return path.join(cwd, ".vscode", "mcp.json");
    case "windsurf-project":
      return path.join(cwd, ".windsurf", "mcp.json");
    case "windsurf-global":
      return path.join(os.homedir(), ".codeium", "windsurf", "mcp_config.json");
  }
}

/**
 * Merge kit Figma / Atlassian / screenshot-to-rn MCP stubs into agent config files.
 * Existing server keys win (never overwrite unless overwrite=true).
 */
export async function installMcpForTargets(
  cwd: string,
  targets: AgentMcpTarget[],
  opts: {
    figmaMode?: "stdio" | "remote";
    includeFigma?: boolean;
    includeScreenshotToRn?: boolean;
    screenshotToRnMode?: "stdio" | "remote";
    screenshotToRnCwd?: string;
    screenshotToRnRemoteUrl?: string;
    overwrite?: boolean;
    dryRun?: boolean;
  } = {},
): Promise<McpInstallResult[]> {
  const incoming = buildKitMcpServers({
    figmaMode: opts.figmaMode ?? "stdio",
    includeFigma: opts.includeFigma,
    includeScreenshotToRn: opts.includeScreenshotToRn,
    screenshotToRnMode: opts.screenshotToRnMode,
    screenshotToRnCwd: opts.screenshotToRnCwd,
    screenshotToRnRemoteUrl: opts.screenshotToRnRemoteUrl,
  }) as McpConfig;
  const results: McpInstallResult[] = [];

  for (const target of targets) {
    const dest = mcpPathForTarget(cwd, target);
    if (target === "windsurf-global" && !opts.overwrite) {
      // Caller must have confirmed permission; still merge carefully
    }
    const { written } = await writeMergedMcpJson(dest, incoming, {
      overwrite: opts.overwrite,
      dryRun: opts.dryRun,
    });
    results.push({ target, path: dest, written });
  }

  return results;
}

/** Map detected AI tool ids → MCP install targets (project-scoped only). */
export function toolIdsToMcpTargets(toolIds: string[]): AgentMcpTarget[] {
  const set = new Set<AgentMcpTarget>();
  for (const id of toolIds) {
    if (id === "cursor") set.add("cursor");
    if (id === "claude") set.add("claude");
    if (id === "copilot") set.add("vscode");
    if (id === "windsurf") set.add("windsurf-project");
    // agents-md has no MCP config file
  }
  // Always keep root .mcp.json for Claude / generic clients when any tool selected
  if (toolIds.length > 0) set.add("claude");
  return [...set];
}
