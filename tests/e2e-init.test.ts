import { mkdtemp, readdir, readFile, writeFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clack/prompts", () => ({
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
  confirm: vi.fn(),
  multiselect: vi.fn(),
  isCancel: vi.fn(() => false),
}));

import { initCommand } from "../src/commands/init.js";

async function walkRel(root: string, dir = root, acc: string[] = []): Promise<string[]> {
  const entries = await readdir(dir);
  for (const name of entries.sort()) {
    const full = path.join(dir, name);
    const rel = path.relative(root, full).split(path.sep).join("/");
    const info = await stat(full);
    if (info.isDirectory()) {
      acc.push(`${rel}/`);
      await walkRel(root, full, acc);
    } else {
      acc.push(rel);
    }
  }
  return acc;
}

describe("e2e: init --yes", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-e2e-init-"));
    await writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({
        name: "e2e-app",
        private: true,
        dependencies: { "react-native": "0.76.0", expo: "52.0.0" },
      }),
      "utf8",
    );
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it("installs adapters + optional sdlc and matches a stable file snapshot", async () => {
    await initCommand(
      {
        cwd: tmp,
        yes: true,
        type: "existing",
        tools: ["claude", "cursor", "agents-md", "copilot", "windsurf"],
        sdlc: true,
        jiraUrl: "https://acme.atlassian.net",
        jiraKey: "APP",
        figmaUrl: "https://www.figma.com/design/AbC/App",
        githubRepo: "acme/e2e-app",
      },
      {
        runCommand: async () => {
          throw new Error("createNativeProject must not run for existing --yes");
        },
      },
    );

    const tree = await walkRel(tmp);
    // Snapshot structural paths (ignore skill name churn by asserting prefixes / key files)
    const important = tree.filter(
      (f) =>
        f === "AGENTS.md" ||
        f === "CLAUDE.md" ||
        f === ".agent/config.json" ||
        f === ".env.example" ||
        f === ".mcp.json" ||
        f === ".cursor/mcp.json" ||
        f === ".vscode/mcp.json" ||
        f === ".windsurf/mcp.json" ||
        f.startsWith(".claude/skills/") ||
        f.startsWith(".cursor/rules/") ||
        f.startsWith(".windsurf/rules/") ||
        f.startsWith(".github/") ||
        f.startsWith("maestro/") ||
        f === "package.json",
    );

    expect(important).toMatchInlineSnapshot(`
      [
        ".agent/config.json",
        ".claude/skills/",
        ".claude/skills/bug-triage/",
        ".claude/skills/bug-triage/SKILL.md",
        ".claude/skills/expo-cli/",
        ".claude/skills/expo-cli/SKILL.md",
        ".claude/skills/feature-grill/",
        ".claude/skills/feature-grill/SKILL.md",
        ".claude/skills/figma-to-tokens/",
        ".claude/skills/figma-to-tokens/SKILL.md",
        ".claude/skills/github-actions-ci/",
        ".claude/skills/github-actions-ci/SKILL.md",
        ".claude/skills/maestro-e2e/",
        ".claude/skills/maestro-e2e/SKILL.md",
        ".claude/skills/plan-review/",
        ".claude/skills/plan-review/SKILL.md",
        ".claude/skills/prd-to-jira/",
        ".claude/skills/prd-to-jira/SKILL.md",
        ".claude/skills/rn-agent-router/",
        ".claude/skills/rn-agent-router/SKILL.md",
        ".claude/skills/rn-architecture/",
        ".claude/skills/rn-architecture/SKILL.md",
        ".claude/skills/rn-native-android-ios/",
        ".claude/skills/rn-native-android-ios/SKILL.md",
        ".claude/skills/rn-sdk-integrations/",
        ".claude/skills/rn-sdk-integrations/SKILL.md",
        ".claude/skills/rn-typescript-react/",
        ".claude/skills/rn-typescript-react/SKILL.md",
        ".claude/skills/ticket-to-code/",
        ".claude/skills/ticket-to-code/SKILL.md",
        ".cursor/mcp.json",
        ".cursor/rules/",
        ".cursor/rules/bug-triage.mdc",
        ".cursor/rules/expo-cli.mdc",
        ".cursor/rules/feature-grill.mdc",
        ".cursor/rules/figma-to-tokens.mdc",
        ".cursor/rules/github-actions-ci.mdc",
        ".cursor/rules/maestro-e2e.mdc",
        ".cursor/rules/plan-review.mdc",
        ".cursor/rules/prd-to-jira.mdc",
        ".cursor/rules/rn-agent-router.mdc",
        ".cursor/rules/rn-architecture.mdc",
        ".cursor/rules/rn-native-android-ios.mdc",
        ".cursor/rules/rn-sdk-integrations.mdc",
        ".cursor/rules/rn-typescript-react.mdc",
        ".cursor/rules/ticket-to-code.mdc",
        ".env.example",
        ".github/",
        ".github/copilot-instructions.md",
        ".github/workflows/",
        ".github/workflows/ci.yml",
        ".github/workflows/e2e-android.yml",
        ".github/workflows/e2e-ios.yml",
        ".github/workflows/eas-build.yml",
        ".mcp.json",
        ".vscode/mcp.json",
        ".windsurf/mcp.json",
        ".windsurf/rules/",
        ".windsurf/rules/bug-triage.md",
        ".windsurf/rules/expo-cli.md",
        ".windsurf/rules/feature-grill.md",
        ".windsurf/rules/figma-to-tokens.md",
        ".windsurf/rules/github-actions-ci.md",
        ".windsurf/rules/maestro-e2e.md",
        ".windsurf/rules/plan-review.md",
        ".windsurf/rules/prd-to-jira.md",
        ".windsurf/rules/rn-agent-router.md",
        ".windsurf/rules/rn-architecture.md",
        ".windsurf/rules/rn-native-android-ios.md",
        ".windsurf/rules/rn-sdk-integrations.md",
        ".windsurf/rules/rn-typescript-react.md",
        ".windsurf/rules/ticket-to-code.md",
        "AGENTS.md",
        "CLAUDE.md",
        "maestro/",
        "maestro/smoke.yaml",
        "package.json",
      ]
    `);

    const agents = await readFile(path.join(tmp, "AGENTS.md"), "utf8");
    expect(agents).toContain("<!-- rn-agentic-dev:start -->");
    expect(agents).toContain("rn-architecture");

    const cfg = JSON.parse(await readFile(path.join(tmp, ".agent/config.json"), "utf8")) as {
      jira: { projectKey: string };
      confirm: boolean;
    };
    expect(cfg.jira.projectKey).toBe("APP");
    expect(cfg.confirm).toBe(false);

    // existing --yes must NOT create architecture scaffold dirs
    expect(important.some((f) => f.startsWith("src/features/"))).toBe(false);
  });
});
