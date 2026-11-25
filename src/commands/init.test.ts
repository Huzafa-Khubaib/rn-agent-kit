import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
  spinner: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn(),
    message: vi.fn(),
  })),
  select: vi.fn(),
  text: vi.fn(),
  password: vi.fn(),
  confirm: vi.fn(),
  multiselect: vi.fn(),
  isCancel: vi.fn(() => false),
}));

vi.mock("@clack/prompts", () => prompts);

import { initCommand } from "./init.js";
import type { Skill } from "../adapters/types.js";
import type { RunCommand } from "../utils/exec.js";

const sampleSkills: Skill[] = [
  {
    name: "rn-architecture",
    content:
      '---\ndescription: Architecture\nglobs: "**/*"\nalwaysApply: false\n---\n\n# Architecture\n',
    description: "Architecture",
    globs: ["**/*"],
    alwaysApply: false,
  },
];

describe("initCommand", () => {
  let tmp: string;
  let runCommand: ReturnType<typeof vi.fn<RunCommand>>;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-agentic-dev-init-"));
    runCommand = vi.fn(async (file, args = []) => {
      // Simulate create-expo-app / RN CLI creating a folder
      const name = String(args[1] === "init" ? args[2] : args[1]);
      const projectDir = path.join(tmp, name);
      await mkdir(projectDir, { recursive: true });
      await writeFile(
        path.join(projectDir, "package.json"),
        JSON.stringify({
          name,
          dependencies: {
            "react-native": "0.76.0",
            ...(String(args[0]).includes("expo") ? { expo: "52.0.0" } : {}),
          },
        }),
        "utf8",
      );
      return { exitCode: 0 } as Awaited<ReturnType<RunCommand>>;
    });
    vi.clearAllMocks();
    prompts.isCancel.mockReturnValue(false);
    process.exitCode = undefined;
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it("non-interactive existing: installs tools without scaffolding or execa", async () => {
    await writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({
        name: "existing-app",
        dependencies: { "react-native": "0.76.0", expo: "52.0.0" },
      }),
      "utf8",
    );

    await initCommand(
      {
        cwd: tmp,
        yes: true,
        type: "existing",
        tools: ["claude", "cursor"],
      },
      {
        runCommand,
        loadSkillsFn: async () => sampleSkills,
      },
    );

    expect(runCommand).not.toHaveBeenCalled();
    expect(prompts.select).not.toHaveBeenCalled();
    expect(
      await readFile(path.join(tmp, ".claude/skills/rn-architecture/SKILL.md"), "utf8"),
    ).toContain("Architecture");
    expect(await readFile(path.join(tmp, ".cursor/rules/rn-architecture.mdc"), "utf8")).toContain(
      "description: Architecture",
    );
    // existing + --yes must not restructure
    expect(await readFile(path.join(tmp, "package.json"), "utf8")).not.toContain("src/features");
  });

  it("non-interactive new expo: runs create-expo-app and scaffolds", async () => {
    await initCommand(
      {
        cwd: tmp,
        yes: true,
        type: "new",
        stack: "expo",
        name: "CoolApp",
        tools: ["agents-md", "windsurf"],
      },
      {
        runCommand,
        loadSkillsFn: async () => sampleSkills,
      },
    );

    expect(runCommand).toHaveBeenCalledWith(
      "npx",
      ["create-expo-app@latest", "CoolApp", "--template", "blank-typescript", "--yes"],
      expect.objectContaining({ cwd: tmp }),
    );

    const projectDir = path.join(tmp, "CoolApp");
    expect(await readFile(path.join(projectDir, "AGENTS.md"), "utf8")).toContain(
      "rn-agentic-dev:start",
    );
    expect(
      await readFile(path.join(projectDir, ".windsurf/rules/rn-architecture.md"), "utf8"),
    ).toContain("Architecture");
    expect(
      await readFile(path.join(projectDir, "src/features/example/index.ts"), "utf8"),
    ).toContain("Public API");
  });

  it("interactive flow uses mocked prompts for existing + SDLC", async () => {
    await writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({
        name: "app",
        dependencies: {
          "react-native": "0.76.0",
          "@react-navigation/native": "7.0.0",
          typescript: "5.0.0",
        },
      }),
      "utf8",
    );
    await writeFile(path.join(tmp, "yarn.lock"), "", "utf8");

    prompts.select
      .mockResolvedValueOnce("existing")
      .mockResolvedValueOnce("figma"); // design source
    prompts.confirm
      .mockResolvedValueOnce(false) // scaffold
      .mockResolvedValueOnce(true) // sdlc
      .mockResolvedValueOnce(false); // skip connect wizard
    prompts.multiselect.mockResolvedValueOnce(["copilot"]);
    prompts.text
      .mockResolvedValueOnce("https://acme.atlassian.net") // JIRA_SITE_URL
      .mockResolvedValueOnce("MOB") // JIRA_PROJECT_KEY
      .mockResolvedValueOnce("dev@acme.com") // JIRA_EMAIL
      .mockResolvedValueOnce("https://www.figma.com/file/abc") // FIGMA_FILE_URL
      .mockResolvedValueOnce("acme/mobile"); // github
    prompts.password
      .mockResolvedValueOnce("jira-token-test") // JIRA_API_TOKEN
      .mockResolvedValueOnce("figma-token-test"); // FIGMA_ACCESS_TOKEN

    await initCommand(
      { cwd: tmp },
      {
        runCommand,
        loadSkillsFn: async () => sampleSkills,
      },
    );

    expect(prompts.select).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Is this a NEW project or an EXISTING project?",
      }),
    );
    expect(runCommand).not.toHaveBeenCalled();

    const agentConfig = JSON.parse(
      await readFile(path.join(tmp, ".agent/config.json"), "utf8"),
    ) as {
      designSource?: string;
      jira: { projectKey: string };
      github: { repo: string };
    };
    expect(agentConfig.jira.projectKey).toBe("MOB");
    expect(agentConfig.github.repo).toBe("acme/mobile");
    expect(agentConfig.designSource).toBe("figma");

    expect(prompts.select).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Figma or Stitch?",
      }),
    );

    const envExample = await readFile(path.join(tmp, ".env.example"), "utf8");
    expect(envExample).toContain("JIRA_API_TOKEN=");
    expect(envExample).not.toMatch(/JIRA_API_TOKEN=.+/); // no secret value in example
    expect(envExample).toContain("DESIGN_SOURCE=figma");

    const envLocal = await readFile(path.join(tmp, ".env"), "utf8");
    expect(envLocal).toContain("JIRA_EMAIL=dev@acme.com");
    expect(envLocal).toContain("JIRA_API_TOKEN=jira-token-test");
    expect(envLocal).toContain("FIGMA_ACCESS_TOKEN=figma-token-test");
    expect(envLocal).toContain("JIRA_PROJECT_KEY=MOB");
    expect(envLocal).toContain("DESIGN_SOURCE=figma");

    const gi = await readFile(path.join(tmp, ".gitignore"), "utf8");
    expect(gi).toMatch(/\.env/);

    const mcp = JSON.parse(await readFile(path.join(tmp, ".mcp.json"), "utf8")) as {
      mcpServers: Record<string, unknown>;
    };
    expect(mcp.mcpServers.figma).toBeDefined();
    expect(mcp.mcpServers.atlassian).toBeDefined();

    expect(await readFile(path.join(tmp, ".github/copilot-instructions.md"), "utf8")).toContain(
      "rn-agentic-dev:start",
    );
  });

  it("rejects unknown tools", async () => {
    await writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({ name: "app", dependencies: { "react-native": "0.76.0" } }),
      "utf8",
    );

    await initCommand(
      {
        cwd: tmp,
        yes: true,
        type: "existing",
        tools: ["not-a-tool"],
      },
      { runCommand, loadSkillsFn: async () => sampleSkills },
    );

    expect(process.exitCode).toBe(1);
    expect(prompts.cancel).toHaveBeenCalled();
  });

  it("new CLI stack invokes community CLI init", async () => {
    await initCommand(
      {
        cwd: tmp,
        yes: true,
        type: "new",
        stack: "cli",
        name: "BareApp",
        tools: ["claude"],
      },
      { runCommand, loadSkillsFn: async () => sampleSkills },
    );

    expect(runCommand).toHaveBeenCalledWith(
      "npx",
      [
        "@react-native-community/cli@latest",
        "init",
        "BareApp",
        "--pm",
        "npm",
        "--install-pods",
        "false",
      ],
      expect.objectContaining({ cwd: tmp }),
    );
  });
});
