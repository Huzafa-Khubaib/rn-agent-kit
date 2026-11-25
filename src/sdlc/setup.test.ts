import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setupSdlcWorkflow } from "./setup.js";
import { pathExists } from "../utils/fs.js";

describe("setupSdlcWorkflow", () => {
  let tmp: string;

  afterEach(async () => {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it("writes config, env example, mcp, workflows, maestro", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-sdlc-"));
    const result = await setupSdlcWorkflow(tmp, {
      jiraSiteUrl: "https://acme.atlassian.net",
      jiraProjectKey: "KAN",
      figmaFileUrl: "https://www.figma.com/file/x",
      githubRepo: "acme/app",
      jiraEmail: "dev@acme.com",
      jiraApiToken: "jira-secret",
      figmaAccessToken: "figma-secret",
    });

    expect(result.filesWritten).toContain(".agent/config.json");
    expect(result.filesWritten).toContain(".env");
    const agentCfg = JSON.parse(await readFile(path.join(tmp, ".agent/config.json"), "utf8")) as {
      confirm: boolean;
      jira: { confirm: boolean; projectKey: string };
    };
    expect(agentCfg.confirm).toBe(false);
    expect(agentCfg.jira.confirm).toBe(false);
    expect(agentCfg.jira.projectKey).toBe("KAN");
    // secrets must not land in agent config
    expect(JSON.stringify(agentCfg)).not.toContain("jira-secret");
    expect(JSON.stringify(agentCfg)).not.toContain("figma-secret");
    expect(await pathExists(path.join(tmp, ".cursor/mcp.json"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".vscode/mcp.json"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".windsurf/mcp.json"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".github/workflows/ci.yml"))).toBe(true);
    expect(await pathExists(path.join(tmp, "maestro/smoke.yaml"))).toBe(true);

    const envExample = await readFile(path.join(tmp, ".env.example"), "utf8");
    expect(envExample).toContain("FIGMA_ACCESS_TOKEN=");
    expect(envExample).not.toContain("figma-secret");
    expect(envExample).not.toContain("jira-secret");

    const env = await readFile(path.join(tmp, ".env"), "utf8");
    expect(env).toContain("JIRA_EMAIL=dev@acme.com");
    expect(env).toContain("JIRA_API_TOKEN=jira-secret");
    expect(env).toContain("FIGMA_ACCESS_TOKEN=figma-secret");
    expect(env).toContain("JIRA_PROJECT_KEY=KAN");
    expect(env).toContain("DESIGN_SOURCE=figma");
  });

  it("Stitch design source skips Figma token + Figma MCP", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-sdlc-stitch-"));
    await setupSdlcWorkflow(tmp, {
      jiraSiteUrl: "https://acme.atlassian.net",
      jiraProjectKey: "KAN",
      figmaFileUrl: "https://stitch.google.com/project/abc",
      githubRepo: "acme/app",
      designSource: "stitch",
      jiraEmail: "dev@acme.com",
      jiraApiToken: "jira-secret",
    });

    const cfg = JSON.parse(await readFile(path.join(tmp, ".agent/config.json"), "utf8")) as {
      designSource: string;
    };
    expect(cfg.designSource).toBe("stitch");

    const env = await readFile(path.join(tmp, ".env"), "utf8");
    expect(env).toContain("DESIGN_SOURCE=stitch");
    expect(env).toContain("STITCH_FILE_URL=https://stitch.google.com/project/abc");
    expect(env).not.toContain("FIGMA_ACCESS_TOKEN=");

    const mcp = JSON.parse(await readFile(path.join(tmp, ".mcp.json"), "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(mcp.mcpServers.atlassian).toBeDefined();
    expect(mcp.mcpServers.figma).toBeUndefined();
  });

  it("Screenshots design source skips Figma MCP and adds screenshot-to-rn", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-sdlc-shot-"));
    await setupSdlcWorkflow(tmp, {
      jiraSiteUrl: "https://acme.atlassian.net",
      jiraProjectKey: "KAN",
      figmaFileUrl: "screenshots://local",
      githubRepo: "acme/app",
      designSource: "screenshot",
      screenshotsDir: "docs/design-screenshots",
      jiraEmail: "dev@acme.com",
      jiraApiToken: "jira-secret",
      geminiApiKey: "gemini-secret",
    });

    const cfg = JSON.parse(await readFile(path.join(tmp, ".agent/config.json"), "utf8")) as {
      designSource: string;
      screenshotsDir?: string;
    };
    expect(cfg.designSource).toBe("screenshot");
    expect(cfg.screenshotsDir).toBe("docs/design-screenshots");

    const env = await readFile(path.join(tmp, ".env"), "utf8");
    expect(env).toContain("DESIGN_SOURCE=screenshot");
    expect(env).toContain("GEMINI_API_KEY=gemini-secret");
    expect(env).toContain("SCREENSHOTS_DIR=docs/design-screenshots");
    expect(env).not.toContain("FIGMA_ACCESS_TOKEN=");
    expect(JSON.stringify(cfg)).not.toContain("gemini-secret");

    const mcp = JSON.parse(await readFile(path.join(tmp, ".mcp.json"), "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(mcp.mcpServers.atlassian).toBeDefined();
    expect(mcp.mcpServers.figma).toBeUndefined();
    expect(mcp.mcpServers["screenshot-to-rn"]).toBeDefined();
  });
});
