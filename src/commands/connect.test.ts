import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prompts = vi.hoisted(() => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  note: vi.fn(),
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
    error: vi.fn(),
    step: vi.fn(),
  },
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn(), message: vi.fn() })),
  select: vi.fn(),
  text: vi.fn(),
  password: vi.fn(),
  confirm: vi.fn(),
  multiselect: vi.fn(),
  isCancel: vi.fn(() => false),
}));

vi.mock("@clack/prompts", () => prompts);

import { connectCommand } from "./connect.js";

describe("connectCommand", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-connect-"));
    vi.clearAllMocks();
    prompts.isCancel.mockReturnValue(false);
    process.exitCode = undefined;
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it("writes secrets only to .env and merges MCP with ${ENV}", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    await connectCommand(
      {
        cwd: tmp,
        yes: true,
        designSource: "figma",
        tools: ["cursor", "claude"],
        jiraUrl: "https://acme.atlassian.net",
        jiraKey: "APP",
        jiraEmail: "dev@acme.com",
        jiraApiToken: "jira-live-secret",
        figmaUrl: "https://www.figma.com/design/AbCkey/App",
        figmaAccessToken: "figma-live-secret",
        figmaMode: "stdio",
      },
      { connectionDeps: { fetchImpl } },
    );

    const env = await readFile(path.join(tmp, ".env"), "utf8");
    expect(env).toContain("jira-live-secret");
    expect(env).toContain("figma-live-secret");

    const cfg = await readFile(path.join(tmp, ".agent/config.json"), "utf8");
    expect(cfg).not.toContain("jira-live-secret");
    expect(cfg).not.toContain("figma-live-secret");
    expect(cfg).toContain("https://acme.atlassian.net");

    const mcp = await readFile(path.join(tmp, ".cursor/mcp.json"), "utf8");
    expect(mcp).toContain("${FIGMA_ACCESS_TOKEN}");
    expect(mcp).not.toContain("figma-live-secret");

    const gi = await readFile(path.join(tmp, ".gitignore"), "utf8");
    expect(gi).toMatch(/\.env/);

    expect(prompts.outro).toHaveBeenCalledWith(
      expect.stringContaining("Restart your agent, then type anything"),
    );
  });

  it("is idempotent on MCP merge", async () => {
    await writeFile(
      path.join(tmp, ".mcp.json"),
      JSON.stringify({ mcpServers: { custom: { command: "x" } } }),
      "utf8",
    );

    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    const opts = {
      cwd: tmp,
      yes: true,
      skipTest: true as const,
      designSource: "figma" as const,
      tools: ["claude"],
      jiraUrl: "https://acme.atlassian.net",
      jiraKey: "APP",
      jiraEmail: "a@b.com",
      jiraApiToken: "t",
      figmaUrl: "https://www.figma.com/design/AbC/App",
      figmaAccessToken: "f",
    };

    await connectCommand(opts, { connectionDeps: { fetchImpl } });
    await connectCommand(opts, { connectionDeps: { fetchImpl } });

    const mcp = JSON.parse(await readFile(path.join(tmp, ".mcp.json"), "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(mcp.mcpServers.custom).toEqual({ command: "x" });
    expect(mcp.mcpServers.figma).toBeDefined();
  });

  it("Stitch path skips Figma token + Figma MCP and skips Figma live test", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("figma.com")) {
        throw new Error("Figma should not be called for Stitch");
      }
      return { ok: true, status: 200, json: async () => ({ key: "APP" }) };
    }) as unknown as typeof fetch;

    await connectCommand(
      {
        cwd: tmp,
        yes: true,
        designSource: "stitch",
        tools: ["cursor"],
        jiraUrl: "https://acme.atlassian.net",
        jiraKey: "APP",
        jiraEmail: "dev@acme.com",
        jiraApiToken: "jira-live-secret",
        figmaUrl: "https://stitch.google.com/project/demo",
      },
      { connectionDeps: { fetchImpl } },
    );

    const env = await readFile(path.join(tmp, ".env"), "utf8");
    expect(env).toContain("DESIGN_SOURCE=stitch");
    expect(env).toContain("STITCH_FILE_URL=");
    expect(env).not.toContain("FIGMA_ACCESS_TOKEN=fig");

    const cfg = JSON.parse(await readFile(path.join(tmp, ".agent/config.json"), "utf8")) as {
      designSource: string;
    };
    expect(cfg.designSource).toBe("stitch");

    const mcp = JSON.parse(await readFile(path.join(tmp, ".cursor/mcp.json"), "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(mcp.mcpServers.atlassian).toBeDefined();
    expect(mcp.mcpServers.figma).toBeUndefined();
  });
});
