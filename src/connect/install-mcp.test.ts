import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installMcpForTargets, toolIdsToMcpTargets } from "./install-mcp.js";

describe("installMcpForTargets", () => {
  let tmp: string;

  afterEach(async () => {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it("merges without overwriting existing servers", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-mcp-install-"));
    await mkdir(path.join(tmp, ".cursor"), { recursive: true });
    await writeFile(
      path.join(tmp, ".cursor", "mcp.json"),
      JSON.stringify({ mcpServers: { custom: { command: "keep-me" } } }),
      "utf8",
    );

    await installMcpForTargets(tmp, ["cursor"], { figmaMode: "stdio" });

    const merged = JSON.parse(await readFile(path.join(tmp, ".cursor/mcp.json"), "utf8")) as {
      mcpServers: Record<string, { command?: string; env?: Record<string, string> }>;
    };
    expect(merged.mcpServers.custom?.command).toBe("keep-me");
    expect(merged.mcpServers.figma).toBeDefined();
    expect(merged.mcpServers.atlassian).toBeDefined();
    const raw = await readFile(path.join(tmp, ".cursor/mcp.json"), "utf8");
    expect(raw).toContain("${FIGMA_ACCESS_TOKEN}");
    expect(raw).toContain("${JIRA_API_TOKEN}");
    expect(raw).not.toMatch(/sk-|secret|token-[a-z0-9]{8}/i);
  });

  it("maps tools to mcp targets", () => {
    const targets = toolIdsToMcpTargets(["cursor", "copilot", "windsurf", "agents-md"]);
    expect(targets).toContain("cursor");
    expect(targets).toContain("vscode");
    expect(targets).toContain("windsurf-project");
    expect(targets).toContain("claude"); // always include root .mcp.json
  });
});
