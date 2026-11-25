import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  note: vi.fn(),
  confirm: vi.fn(async () => true),
  isCancel: vi.fn(() => false),
  log: {
    success: vi.fn(),
    message: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { jiraSyncCommand } from "./jira-sync.js";
import type { JiraClient } from "../jira/client.js";

describe("jiraSyncCommand", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-jsync-"));
    const feat = path.join(tmp, "docs", "features", "login");
    await mkdir(feat, { recursive: true });
    await mkdir(path.join(tmp, ".agent"), { recursive: true });
    await writeFile(
      path.join(feat, "spec.md"),
      `# Login\n## Acceptance criteria\n- AC-1: works\n## Open items\n(none)\n`,
      "utf8",
    );
    await writeFile(
      path.join(feat, "plan.json"),
      JSON.stringify({
        version: 1,
        slug: "login",
        projectKey: "APP",
        title: "Login",
        tickets: [
          {
            id: "epic-login",
            title: "[PRD] Login",
            type: "epic",
            body: "## Acceptance Criteria\nGiven x\nWhen y\nThen z\n\n## testIDs\n- `login-submit`\n\nhttps://www.figma.com/design/AbC/App?node-id=1-2\n",
          },
          {
            id: "story-login",
            title: "Login screen",
            type: "story",
            body: "## Acceptance Criteria\nGiven a\nWhen b\nThen c\n\n## testIDs\n- `login-email`\n\nhttps://www.figma.com/design/AbC/App?node-id=1-2\n",
            figmaUrl: "https://www.figma.com/design/AbC/App?node-id=1-2",
          },
          {
            id: "sub-ui",
            title: "UI build",
            type: "subtask",
            parentId: "story-login",
            body: "## Acceptance Criteria\nGiven a\nWhen b\nThen c\n\n## testIDs\n- `login-email`\n\nhttps://www.figma.com/design/AbC/App?node-id=1-2\n",
          },
        ],
      }),
      "utf8",
    );
    await writeFile(
      path.join(tmp, ".agent", "approvals.json"),
      JSON.stringify({
        version: 1,
        approvals: [
          {
            slug: "login",
            planPath: "docs/features/login/plan.md",
            specPath: "docs/features/login/spec.md",
            approvedAt: new Date().toISOString(),
            approvedBy: "user",
            phrase: "approve",
          },
        ],
      }),
      "utf8",
    );
    await writeFile(
      path.join(tmp, ".agent", "config.json"),
      JSON.stringify({
        version: 1,
        jira: { siteUrl: "https://acme.atlassian.net", projectKey: "APP" },
        figma: { fileUrl: "https://www.figma.com/design/AbC/App" },
      }),
      "utf8",
    );
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  function mockClient(): JiraClient & { created: string[] } {
    const created: string[] = [];
    let n = 100;
    return {
      created,
      async getIssue() {
        return { key: "APP-1" };
      },
      async createIssue(input) {
        const key = `APP-${n++}`;
        created.push(`${input.issueType}:${input.summary}`);
        return { key };
      },
      async updateIssue() {},
      async addComment() {},
    };
  }

  it("dry-run does not write map or call create", async () => {
    const client = mockClient();
    const code = await jiraSyncCommand({
      cwd: tmp,
      slug: "login",
      dryRun: true,
      yes: true,
      client,
    });
    expect(code).toBe(0);
    expect(client.created).toHaveLength(0);
    await expect(readFile(path.join(tmp, ".agent", "jira-map.json"), "utf8")).rejects.toThrow();
  });

  it("creates issues and is idempotent on second run", async () => {
    const client = mockClient();
    expect(
      await jiraSyncCommand({ cwd: tmp, slug: "login", yes: true, client }),
    ).toBe(0);
    const map1 = JSON.parse(await readFile(path.join(tmp, ".agent", "jira-map.json"), "utf8")) as {
      epic: { key: string };
      stories: Record<string, { key: string }>;
    };
    expect(map1.epic.key).toMatch(/^APP-/);
    const createdFirst = client.created.length;
    expect(createdFirst).toBeGreaterThanOrEqual(2);

    expect(
      await jiraSyncCommand({ cwd: tmp, slug: "login", yes: true, client }),
    ).toBe(0);
    // Second run updates — no new creates
    expect(client.created.length).toBe(createdFirst);
  });

  it("refuses without approval", async () => {
    await writeFile(
      path.join(tmp, ".agent", "approvals.json"),
      JSON.stringify({ version: 1, approvals: [] }),
      "utf8",
    );
    const code = await jiraSyncCommand({
      cwd: tmp,
      slug: "login",
      yes: true,
      dryRun: true,
      client: mockClient(),
    });
    expect(code).toBe(1);
  });
});
