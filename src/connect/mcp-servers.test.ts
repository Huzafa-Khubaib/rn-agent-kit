import { describe, expect, it } from "vitest";
import {
  buildKitMcpServers,
  screenshotToRnRemoteServer,
  screenshotToRnServer,
} from "./mcp-servers.js";

describe("screenshot-to-rn MCP stubs", () => {
  it("stdio stub uses run script when cwd set", () => {
    const stub = screenshotToRnServer({
      mcpCwd: "/abs/vendor-screenshot-to-code/mcp",
    });
    expect(stub.command).toBe("/abs/vendor-screenshot-to-code/mcp/run_mcp.sh");
    expect(stub).not.toHaveProperty("url");
  });

  it("remote stub is Figma-style url + Bearer header", () => {
    const stub = screenshotToRnRemoteServer({
      url: "https://shot.onrender.com",
    });
    expect(stub.url).toBe("https://shot.onrender.com/mcp");
    expect(stub.headers).toEqual({
      Authorization: "Bearer ${SCREENSHOT_TO_RN_MCP_API_KEY}",
    });
  });

  it("remote stub keeps existing /mcp path", () => {
    const stub = screenshotToRnRemoteServer({
      url: "https://shot.onrender.com/mcp",
    });
    expect(stub.url).toBe("https://shot.onrender.com/mcp");
  });

  it("buildKitMcpServers merges remote screenshot MCP", () => {
    const { mcpServers } = buildKitMcpServers({
      includeFigma: false,
      includeScreenshotToRn: true,
      screenshotToRnMode: "remote",
      screenshotToRnRemoteUrl: "https://example.onrender.com",
    });
    expect(mcpServers.figma).toBeUndefined();
    expect(mcpServers["screenshot-to-rn"]).toMatchObject({
      url: "https://example.onrender.com/mcp",
    });
  });
});
