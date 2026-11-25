import * as p from "@clack/prompts";
import path from "node:path";
import { adapters, getAdapter, resolveToolName, type Adapter } from "../adapters/index.js";
import { detectClaudeProject } from "../adapters/claude.js";
import { detectCursorProject } from "../adapters/cursor.js";
import { detectAgentsMd } from "../adapters/agents-md.js";
import { detectCopilotProject } from "../adapters/copilot.js";
import { detectWindsurfProject } from "../adapters/windsurf.js";
import { detectProject, formatDetectionSummary, type ProjectDetection } from "../detect/project.js";
import { applyArchitectureScaffold } from "../scaffold/architecture.js";
import { createNativeProject, type CreateStack } from "../scaffold/create-project.js";
import {
  setupSdlcWorkflow,
  type SdlcDesignSource,
  type SdlcInputs,
} from "../sdlc/setup.js";
import { installClaudeRouterHook } from "../adapters/claude-hooks.js";
import { connectCommand } from "./connect.js";
import { defaultRunCommand, type RunCommand } from "../utils/exec.js";
import { loadSkills } from "../utils/skills.js";

export type ProjectKind = "new" | "existing";

export interface InitOptions {
  cwd?: string;
  yes?: boolean;
  type?: ProjectKind;
  stack?: CreateStack;
  name?: string;
  /** Comma-friendly list of tools/adapters: claude, cursor, agents-md, copilot, windsurf */
  tools?: string[];
  /** @deprecated alias of tools */
  adapters?: string[];
  sdlc?: boolean;
  /** Figma, Stitch, or Screenshots — equal options for SDLC / connect */
  designSource?: SdlcDesignSource;
  jiraUrl?: string;
  jiraKey?: string;
  jiraEmail?: string;
  jiraApiToken?: string;
  figmaUrl?: string;
  figmaAccessToken?: string;
  geminiApiKey?: string;
  screenshotsDir?: string;
  githubRepo?: string;
  /** Opt-in Claude Code UserPromptSubmit hook (default off — CLAUDE.md is enough). */
  claudeHook?: boolean;
}

export interface InitDeps {
  runCommand?: RunCommand;
  createProject?: typeof createNativeProject;
  applyArchitecture?: typeof applyArchitectureScaffold;
  setupSdlc?: typeof setupSdlcWorkflow;
  detect?: typeof detectProject;
  loadSkillsFn?: typeof loadSkills;
}

const TOOL_OPTIONS = [
  { value: "claude", label: "Claude Code", adapter: "claude" },
  { value: "cursor", label: "Cursor", adapter: "cursor" },
  { value: "agents-md", label: "Codex / AGENTS.md", adapter: "agents-md" },
  { value: "copilot", label: "Copilot", adapter: "copilot" },
  { value: "windsurf", label: "Windsurf", adapter: "windsurf" },
] as const;

function cancelIfNeeded(value: unknown): value is symbol {
  if (p.isCancel(value)) {
    p.cancel("Cancelled.");
    process.exitCode = 1;
    return true;
  }
  return false;
}

async function detectAiTools(cwd: string): Promise<string[]> {
  const found: string[] = [];
  if (await detectClaudeProject(cwd)) found.push("claude");
  if (await detectCursorProject(cwd)) found.push("cursor");
  if (await detectAgentsMd(cwd)) found.push("agents-md");
  if (await detectCopilotProject(cwd)) found.push("copilot");
  if (await detectWindsurfProject(cwd)) found.push("windsurf");
  return found;
}

function resolveSelectedAdapters(toolIds: string[]): Adapter[] {
  const selected: Adapter[] = [];
  const missing: string[] = [];
  for (const id of toolIds) {
    const adapter = getAdapter(id);
    if (!adapter) missing.push(id);
    else if (!selected.some((a) => a.name === adapter.name)) selected.push(adapter);
  }
  if (missing.length) {
    throw new Error(`Unknown tool(s): ${missing.join(", ")}`);
  }
  return selected;
}

function printNextSteps(opts: {
  projectDir: string;
  kind: ProjectKind;
  stack?: CreateStack | ProjectDetection["stack"];
  tools: string[];
  sdlc: boolean;
}): void {
  const rel = path.basename(opts.projectDir);
  const lines = [
    opts.kind === "new" ? `cd ${rel}` : `Stay in ${rel}`,
    opts.stack === "expo" ? "npx expo start" : "npx react-native start",
    opts.sdlc
      ? "Load .env (Jira + Figma|Stitch) — already written if you filled prompts; never commit it"
      : "Optional: npx rn-agentic-dev connect  (MCP + live Figma|Stitch + Jira tests)",
    `Verify: npx rn-agentic-dev doctor --connections --cwd ${rel === path.basename(process.cwd()) ? "." : rel}`,
    "Restart your agent, then type anything — the router will guide you",
  ];
  if (opts.sdlc) {
    lines.push("MCP stubs use ${JIRA_*} / ${FIGMA_ACCESS_TOKEN} (Figma only) from your environment");
    lines.push("Adjust maestro/smoke.yaml appId to your bundle id");
  }
  lines.push(`Installed tools: ${opts.tools.join(", ") || "(none)"}`);
  p.note(lines.map((l, i) => `${i + 1}. ${l}`).join("\n"), "Next steps");
}

export async function initCommand(options: InitOptions = {}, deps: InitDeps = {}): Promise<void> {
  const runCommand = deps.runCommand ?? defaultRunCommand;
  const createProject = deps.createProject ?? createNativeProject;
  const applyArchitecture = deps.applyArchitecture ?? applyArchitectureScaffold;
  const setupSdlc = deps.setupSdlc ?? setupSdlcWorkflow;
  const detect = deps.detect ?? detectProject;
  const loadSkillsFn = deps.loadSkillsFn ?? loadSkills;

  const cwd = options.cwd ?? process.cwd();
  const nonInteractive = Boolean(options.yes);

  p.intro("rn-agentic-dev init");

  const detection = await detect(cwd);
  const suggestedKind: ProjectKind = options.type ?? (detection.isReactNative ? "existing" : "new");

  // 1–2. NEW vs EXISTING
  let kind: ProjectKind = suggestedKind;
  if (!options.type && !nonInteractive) {
    const answer = await p.select({
      message: "Is this a NEW project or an EXISTING project?",
      options: [
        {
          value: "new" as const,
          label: "NEW project",
          hint: detection.isReactNative ? undefined : "suggested",
        },
        {
          value: "existing" as const,
          label: "EXISTING project",
          hint: detection.isReactNative ? "react-native detected" : undefined,
        },
      ],
      initialValue: suggestedKind,
    });
    if (cancelIfNeeded(answer)) return;
    kind = answer;
  } else if (options.type) {
    kind = options.type;
  } else if (nonInteractive) {
    kind = suggestedKind;
  }

  let stack: CreateStack | ProjectDetection["stack"] =
    options.stack ?? (detection.stack === "cli" ? "cli" : "expo");
  let projectDir = cwd;

  // 3. NEW project flow
  if (kind === "new") {
    let name = options.name ?? "MyApp";
    if (!options.name && !nonInteractive) {
      const nameAnswer = await p.text({
        message: "Project name",
        placeholder: "MyApp",
        defaultValue: "MyApp",
        validate: (v) => {
          if (!v || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(v)) {
            return "Use a valid package name (letters, numbers, _-)";
          }
        },
      });
      if (cancelIfNeeded(nameAnswer)) return;
      name = nameAnswer;
    }

    let chosenStack: CreateStack = options.stack ?? "expo";
    if (!options.stack && !nonInteractive) {
      const stackAnswer = await p.select({
        message: "Expo or React Native CLI?",
        options: [
          { value: "expo" as const, label: "Expo", hint: "recommended" },
          { value: "cli" as const, label: "React Native CLI" },
        ],
        initialValue: "expo",
      });
      if (cancelIfNeeded(stackAnswer)) return;
      chosenStack = stackAnswer as CreateStack;
    }
    stack = chosenStack;

    // No spinner here: create-expo-app / RN CLI need the full TTY for progress
    // and prompts. A clack spinner hides that and looks like a hang.
    p.log.step(
      chosenStack === "expo"
        ? `Creating Expo app "${name}" (this can take a few minutes)…`
        : `Creating React Native CLI app "${name}" (download + npm install — often 5–15 min)…`,
    );
    try {
      projectDir = await createProject({
        name,
        stack: chosenStack,
        cwd,
        runCommand,
      });
      p.log.success(`Created ${name}`);
    } catch (err) {
      p.cancel(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
      return;
    }

    const archSpinner = p.spinner();
    archSpinner.start("Applying architecture scaffold…");
    const arch = await applyArchitecture(projectDir);
    archSpinner.stop(
      `Scaffold ready (${arch.dirsCreated.length} dirs, ${arch.configsWritten.length} configs)`,
    );
  } else {
    // 4. EXISTING — detect & summarize; never restructure without asking
    if (!detection.isReactNative) {
      p.log.warn(
        "No react-native dependency detected in package.json. Continuing anyway — confirm before scaffolding.",
      );
    }

    p.note(formatDetectionSummary(detection), "Detected project");
    stack = options.stack ?? (detection.stack === "unknown" ? "expo" : detection.stack);

    let applyScaffold = false;
    if (nonInteractive) {
      applyScaffold = false; // never restructure existing without an explicit interactive yes
    } else {
      const scaffoldAnswer = await p.confirm({
        message:
          "Apply architecture scaffold (src/features, src/shared, eslint, prettier, husky, jest)? This will not delete existing files.",
        initialValue: false,
      });
      if (cancelIfNeeded(scaffoldAnswer)) return;
      applyScaffold = scaffoldAnswer;
    }

    if (applyScaffold) {
      const archSpinner = p.spinner();
      archSpinner.start("Applying architecture scaffold…");
      const arch = await applyArchitecture(projectDir);
      archSpinner.stop(
        `Scaffold applied (${arch.dirsCreated.length} new dirs, ${arch.configsWritten.length} configs)`,
      );
    } else {
      p.log.info("Skipping architecture restructure.");
    }
  }

  // 5. AI tools multi-select
  const toolIdsFromFlags = options.tools ?? options.adapters;
  let selectedToolIds: string[] = [];

  if (toolIdsFromFlags?.length) {
    selectedToolIds = toolIdsFromFlags.map((t) => resolveToolName(t) ?? t).filter(Boolean);
  } else if (nonInteractive) {
    selectedToolIds = TOOL_OPTIONS.map((t) => t.value);
  } else {
    const detectedTools = await detectAiTools(projectDir);
    const toolAnswer = await p.multiselect({
      message: "Which AI tools should we install skills for?",
      options: TOOL_OPTIONS.map((t) => ({
        value: t.value,
        label: t.label,
        hint: detectedTools.includes(t.value) ? "detected" : undefined,
      })),
      initialValues: detectedTools.length > 0 ? detectedTools : TOOL_OPTIONS.map((t) => t.value),
      required: true,
    });
    if (cancelIfNeeded(toolAnswer)) return;
    selectedToolIds = toolAnswer as string[];
  }

  let selectedAdapters: Adapter[];
  try {
    selectedAdapters = resolveSelectedAdapters(selectedToolIds);
  } catch (err) {
    p.cancel(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }

  // 6. SDLC workflow
  let sdlcEnabled = Boolean(options.sdlc);
  if (options.sdlc === undefined && !nonInteractive) {
    const sdlcAnswer = await p.confirm({
      message:
        "Install the SDLC workflow (Figma|Stitch|Screenshots → Jira → Maestro → CI)?",
      initialValue: false,
    });
    if (cancelIfNeeded(sdlcAnswer)) return;
    sdlcEnabled = sdlcAnswer;
  }

  let resolvedDesignSource: SdlcDesignSource =
    options.designSource === "stitch"
      ? "stitch"
      : options.designSource === "screenshot"
        ? "screenshot"
        : "figma";

  if (sdlcEnabled) {
    let inputs: SdlcInputs = {
      jiraSiteUrl: options.jiraUrl ?? "https://your-domain.atlassian.net",
      jiraProjectKey: options.jiraKey ?? "KAN",
      figmaFileUrl:
        options.figmaUrl ??
        (resolvedDesignSource === "stitch"
          ? "https://stitch.google.com/project/example"
          : resolvedDesignSource === "screenshot"
            ? "screenshots://local"
            : "https://www.figma.com/design/example"),
      githubRepo: options.githubRepo ?? "org/repo",
      designSource: resolvedDesignSource,
      screenshotsDir: options.screenshotsDir ?? "docs/design-screenshots",
      jiraEmail: options.jiraEmail,
      jiraApiToken: options.jiraApiToken,
      figmaAccessToken:
        resolvedDesignSource === "figma" ? options.figmaAccessToken : undefined,
      geminiApiKey:
        resolvedDesignSource === "screenshot" ? options.geminiApiKey : undefined,
    };

    if (!nonInteractive) {
      p.log.step("SDLC credentials — secrets go to .env only (gitignored)");

      const jiraUrl = await p.text({
        message: "JIRA_SITE_URL",
        placeholder: "https://your-domain.atlassian.net",
        initialValue: options.jiraUrl ?? "",
        validate: (v) => (v?.trim() ? undefined : "Required"),
      });
      if (cancelIfNeeded(jiraUrl)) return;

      const jiraKey = await p.text({
        message: "JIRA_PROJECT_KEY",
        placeholder: "KAN",
        initialValue: options.jiraKey ?? "KAN",
        validate: (v) => (v?.trim() ? undefined : "Required"),
      });
      if (cancelIfNeeded(jiraKey)) return;

      const jiraEmail = await p.text({
        message: "JIRA_EMAIL",
        placeholder: "you@company.com",
        validate: (v) => (v?.trim() ? undefined : "Required"),
      });
      if (cancelIfNeeded(jiraEmail)) return;

      const jiraApiToken = await p.password({
        message: "JIRA_API_TOKEN",
        validate: (v) => (v?.trim() ? undefined : "Required"),
      });
      if (cancelIfNeeded(jiraApiToken)) return;

      p.log.step("Design source");
      const sourceAnswer = await p.select({
        message: "Figma, Stitch, or Screenshots?",
        options: [
          {
            value: "figma" as const,
            label: "Figma",
            hint: "file URL + access token / MCP",
          },
          {
            value: "stitch" as const,
            label: "Stitch (Google Stitch)",
            hint: "project link — no Figma token",
          },
          {
            value: "screenshot" as const,
            label: "Screenshots / recordings",
            hint: "screenshot-to-rn MCP + Gemini",
          },
        ],
        initialValue: resolvedDesignSource,
      });
      if (cancelIfNeeded(sourceAnswer)) return;
      resolvedDesignSource = sourceAnswer as SdlcDesignSource;

      let designFileUrl = options.figmaUrl ?? "";
      let figmaAccessToken = "";
      let geminiApiKey = "";
      let screenshotsDir = options.screenshotsDir ?? "docs/design-screenshots";

      if (resolvedDesignSource === "figma") {
        const figmaUrl = await p.text({
          message: "FIGMA_FILE_URL",
          placeholder: "https://www.figma.com/design/…",
          initialValue: options.figmaUrl ?? "",
          validate: (v) => (v?.trim() ? undefined : "Required"),
        });
        if (cancelIfNeeded(figmaUrl)) return;
        designFileUrl = String(figmaUrl).trim();

        const tok = await p.password({
          message: "FIGMA_ACCESS_TOKEN",
          validate: (v) => (v?.trim() ? undefined : "Required for Figma"),
        });
        if (cancelIfNeeded(tok)) return;
        figmaAccessToken = String(tok).trim();
      } else if (resolvedDesignSource === "stitch") {
        p.note(
          "Stitch has no Figma MCP — feature-grill uses screenshots + CSS/Tailwind.",
          "Stitch setup",
        );
        const stitchUrl = await p.text({
          message: "STITCH_FILE_URL (project / share link)",
          placeholder: "https://…stitch…",
          initialValue: options.figmaUrl ?? "",
          validate: (v) => (v?.trim() ? undefined : "Required"),
        });
        if (cancelIfNeeded(stitchUrl)) return;
        designFileUrl = String(stitchUrl).trim();
      } else {
        p.note(
          "Screenshots use screenshot-to-rn MCP. Run the vendor backend with GEMINI_API_KEY.",
          "Screenshots setup",
        );
        designFileUrl = "screenshots://local";
        const shots = await p.text({
          message: "SCREENSHOTS_DIR",
          placeholder: "docs/design-screenshots",
          initialValue: screenshotsDir,
        });
        if (cancelIfNeeded(shots)) return;
        screenshotsDir = String(shots).trim() || screenshotsDir;
        const gem = await p.password({
          message: "GEMINI_API_KEY",
          validate: (v) => (v?.trim() ? undefined : "Required for Screenshots"),
        });
        if (cancelIfNeeded(gem)) return;
        geminiApiKey = String(gem).trim();
      }

      const githubRepo = await p.text({
        message: "GitHub repo (owner/name) — optional",
        placeholder: "acme/my-app",
        initialValue: options.githubRepo ?? "",
      });
      if (cancelIfNeeded(githubRepo)) return;

      inputs = {
        jiraSiteUrl: String(jiraUrl).trim(),
        jiraProjectKey: String(jiraKey).trim(),
        jiraEmail: String(jiraEmail).trim(),
        jiraApiToken: String(jiraApiToken).trim(),
        designSource: resolvedDesignSource,
        figmaFileUrl: designFileUrl,
        figmaAccessToken:
          resolvedDesignSource === "figma" ? figmaAccessToken : undefined,
        geminiApiKey:
          resolvedDesignSource === "screenshot" ? geminiApiKey : undefined,
        screenshotsDir:
          resolvedDesignSource === "screenshot" ? screenshotsDir : undefined,
        githubRepo: String(githubRepo).trim() || "org/repo",
      };
    }

    const sdlcSpinner = p.spinner();
    sdlcSpinner.start("Configuring SDLC workflow…");
    const result = await setupSdlc(projectDir, inputs);
    sdlcSpinner.stop(`SDLC files: ${result.filesWritten.join(", ")}`);
    if (result.filesWritten.includes(".env")) {
      const label =
        resolvedDesignSource === "stitch"
          ? "Stitch"
          : resolvedDesignSource === "screenshot"
            ? "Screenshots"
            : "Figma";
      p.log.success(`Wrote .env (gitignored) with Jira + ${label} values`);
    }
  }

  // 7. Install adapters
  const skills = await loadSkillsFn();
  if (skills.length === 0) {
    p.cancel("No skills found in package. Aborting adapter install.");
    process.exitCode = 1;
    return;
  }

  const installSpinner = p.spinner();
  installSpinner.start("Installing agent skills…");
  for (const adapter of selectedAdapters) {
    await adapter.install(skills, projectDir);
  }
  installSpinner.stop(`Installed: ${selectedAdapters.map((a) => a.name).join(", ") || "(none)"}`);

  if (
    options.claudeHook &&
    selectedAdapters.some((a) => a.name === "claude")
  ) {
    const hook = await installClaudeRouterHook(projectDir);
    p.log.success(
      hook.written
        ? `Claude UserPromptSubmit hook → ${path.relative(projectDir, hook.path) || ".claude/settings.json"}`
        : "Claude UserPromptSubmit hook already present",
    );
  }

  // 8. Optional MCP connect wizard (credentials + merge + live tests)
  if (!nonInteractive) {
    const runConnect = await p.confirm({
      message: sdlcEnabled
        ? "Run MCP connect wizard now (merge agent MCP configs + live design/Jira tests)?"
        : "Set up Figma or Stitch + Jira MCP now (rn-agentic-dev connect)?",
      initialValue: sdlcEnabled,
    });
    if (!cancelIfNeeded(runConnect) && runConnect) {
      await connectCommand({
        cwd: projectDir,
        tools: selectedAdapters.map((a) => a.name),
        designSource: resolvedDesignSource,
        jiraUrl: options.jiraUrl,
        jiraKey: options.jiraKey,
        jiraEmail: options.jiraEmail,
        jiraApiToken: options.jiraApiToken,
        figmaUrl: options.figmaUrl,
        figmaAccessToken:
          resolvedDesignSource === "figma" ? options.figmaAccessToken : undefined,
      });
    }
  }

  printNextSteps({
    projectDir,
    kind,
    stack,
    tools: selectedAdapters.map((a) => a.name),
    sdlc: sdlcEnabled,
  });

  p.outro("rn-agentic-dev init complete.");
}

export { adapters, TOOL_OPTIONS };
