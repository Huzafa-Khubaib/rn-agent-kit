import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runDoctorChecks } from "./doctor-checks.js";

describe("runDoctorChecks", () => {
  let tmp: string;

  afterEach(async () => {
    // temp cleaned by OS
  });

  it("passes node and validates agent config + mcp + env with injected deps", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-doctor-"));
    await mkdir(path.join(tmp, ".agent"), { recursive: true });
    await writeFile(
      path.join(tmp, ".agent", "config.json"),
      JSON.stringify({
        jira: { siteUrl: "https://acme.atlassian.net", projectKey: "APP" },
        figma: { fileUrl: "https://www.figma.com/design/x" },
      }),
      "utf8",
    );
    await writeFile(
      path.join(tmp, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          figma: { command: "npx" },
          atlassian: { command: "npx" },
        },
      }),
      "utf8",
    );

    const results = await runDoctorChecks(tmp, {
      platform: "linux",
      env: {
        FIGMA_TOKEN: "x",
        JIRA_SITE_URL: "https://acme.atlassian.net",
        JIRA_EMAIL: "a@b.com",
        JIRA_API_TOKEN: "t",
        ANDROID_HOME: tmp,
      },
      which: async (cmd) => (["git", "java", "maestro"].includes(cmd) ? `/bin/${cmd}` : null),
      exec: async (file) => ({ exitCode: 0, stdout: `${path.basename(file)} 1.0` }),
    });

    const byId = Object.fromEntries(results.map((r) => [r.id, r]));
    expect(byId.node?.status).toBe("pass");
    expect(byId.git?.status).toBe("pass");
    expect(byId.maestro?.status).toBe("pass");
    expect(byId["android-sdk"]?.status).toBe("pass");
    expect(byId.xcode?.status).toBe("skip");
    expect(byId["mcp-config"]?.status).toBe("pass");
    expect(byId["figma-token"]?.status).toBe("pass");
    expect(byId["jira-env"]?.status).toBe("pass");
    expect(byId["agent-config"]?.status).toBe("pass");
  });

  it("fails invalid agent config JSON and warns on missing tools", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-doctor-"));
    await mkdir(path.join(tmp, ".agent"), { recursive: true });
    await writeFile(path.join(tmp, ".agent", "config.json"), "{not-json", "utf8");

    const results = await runDoctorChecks(tmp, {
      platform: "darwin",
      env: {},
      which: async () => null,
      exec: async () => ({ exitCode: 1, stdout: "" }),
    });

    const byId = Object.fromEntries(results.map((r) => [r.id, r]));
    expect(byId.git?.status).toBe("fail");
    expect(byId.xcode?.status).toBe("warn");
    expect(byId.maestro?.status).toBe("warn");
    expect(byId["agent-config"]?.status).toBe("fail");
    expect(byId["agent-config"]?.fix).toMatch(/JSON/i);
  });
});
