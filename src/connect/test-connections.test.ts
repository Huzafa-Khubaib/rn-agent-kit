import { describe, expect, it, vi } from "vitest";
import { connectionsHaveFailures, runConnectionTests } from "./test-connections.js";

describe("runConnectionTests", () => {
  it("fails with actionable fix when token missing", async () => {
    const checks = await runConnectionTests(
      { figmaFileUrl: "https://www.figma.com/design/AbC/App", jiraSiteUrl: "https://x.atlassian.net" },
      { env: {}, fetchImpl: vi.fn() as unknown as typeof fetch },
    );
    expect(checks.find((c) => c.id === "figma-api")?.status).toBe("fail");
    expect(checks.find((c) => c.id === "figma-api")?.fix).toMatch(/figma\.com\/developers/);
    expect(checks.find((c) => c.id === "jira-api")?.status).toBe("fail");
    expect(checks.find((c) => c.id === "jira-api")?.fix).toMatch(/id\.atlassian\.com/);
  });

  it("passes when mocked APIs succeed", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("figma.com")) {
        return { ok: true, status: 200, json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => ({ key: "KAN" }) };
    }) as unknown as typeof fetch;

    const checks = await runConnectionTests(
      {
        figmaFileUrl: "https://www.figma.com/design/AbCxyz/App",
        jiraSiteUrl: "https://acme.atlassian.net",
        jiraProjectKey: "KAN",
      },
      {
        fetchImpl,
        env: {
          FIGMA_ACCESS_TOKEN: "fig-secret",
          JIRA_EMAIL: "a@b.com",
          JIRA_API_TOKEN: "jira-secret",
        },
      },
    );

    expect(checks.every((c) => c.status === "pass")).toBe(true);
    expect(connectionsHaveFailures(checks)).toBe(false);
    // never leak secrets into detail
    expect(JSON.stringify(checks)).not.toContain("fig-secret");
    expect(JSON.stringify(checks)).not.toContain("jira-secret");
  });

  it("skips Figma API when design source is stitch", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ key: "KAN" }),
    })) as unknown as typeof fetch;

    const checks = await runConnectionTests(
      {
        designSource: "stitch",
        jiraSiteUrl: "https://acme.atlassian.net",
        jiraProjectKey: "KAN",
      },
      {
        fetchImpl,
        env: { JIRA_EMAIL: "a@b.com", JIRA_API_TOKEN: "t" },
      },
    );
    expect(checks.find((c) => c.id === "figma-api")?.status).toBe("skip");
    expect(checks.find((c) => c.id === "jira-api")?.status).toBe("pass");
  });

  it("reports 403 with regenerate fix", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    const checks = await runConnectionTests(
      {
        figmaFileUrl: "https://www.figma.com/design/AbC/App",
        jiraSiteUrl: "https://acme.atlassian.net",
        jiraProjectKey: "KAN",
      },
      {
        fetchImpl,
        env: {
          FIGMA_ACCESS_TOKEN: "bad",
          JIRA_EMAIL: "a@b.com",
          JIRA_API_TOKEN: "bad",
        },
      },
    );

    expect(checks.find((c) => c.id === "figma-api")?.fix).toMatch(/regenerate/i);
    expect(checks.find((c) => c.id === "jira-api")?.fix).toMatch(/API token/i);
  });
});
