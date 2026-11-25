import { describe, expect, it } from "vitest";
import { mergeMcpConfig } from "./mcp-merge.js";

describe("mergeMcpConfig", () => {
  it("keeps existing servers by default", () => {
    const merged = mergeMcpConfig(
      { mcpServers: { custom: { command: "keep" } } },
      { mcpServers: { figma: { command: "npx" }, custom: { command: "overwrite?" } } },
    );
    expect(merged.mcpServers?.custom).toEqual({ command: "keep" });
    expect(merged.mcpServers?.figma).toEqual({ command: "npx" });
  });

  it("overwrites when requested", () => {
    const merged = mergeMcpConfig(
      { mcpServers: { figma: { command: "old" } } },
      { mcpServers: { figma: { command: "new" } } },
      { overwrite: true },
    );
    expect(merged.mcpServers?.figma).toEqual({ command: "new" });
  });
});
