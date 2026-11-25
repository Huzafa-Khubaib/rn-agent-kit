import * as p from "@clack/prompts";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { detectClaudeProject } from "../adapters/claude.js";
import { detectCursorProject } from "../adapters/cursor.js";
import { detectAgentsMd } from "../adapters/agents-md.js";
import { detectCopilotProject } from "../adapters/copilot.js";
import { detectWindsurfProject } from "../adapters/windsurf.js";
import {
  ATLASSIAN_TOKEN_URL,
  FIGMA_MCP_GUIDE_URL,
  FIGMA_REMOTE_MCP_URL,
  FIGMA_TOKEN_URL,
} from "../connect/mcp-servers.js";
import {
  installMcpForTargets,
  toolIdsToMcpTargets,
  type AgentMcpTarget,
} from "../connect/install-mcp.js";
import { loadProjectEnv } from "../connect/load-dotenv.js";
import {
  connectionsHaveFailures,
  runConnectionTests,
  type ConnectionCheck,
  type ConnectionTestDeps,
} from "../connect/test-connections.js";
import type { DesignSource } from "../schema/agent-config.js";
import { ensureEnvGitignore } from "../utils/gitignore.js";
import { pathExists, writeText } from "../utils/fs.js";

export type { DesignSource };

export interface ConnectOptions {
  cwd?: string;
  yes?: boolean;
  /** Skip live API tests */
  skipTest?: boolean;
  /** Figma, Stitch, or Screenshots — equal options */
  designSource?: DesignSource;
  figmaMode?: "stdio" | "remote";
  /** Include Windsurf global MCP config (requires interactive confirm unless --yes + --windsurf-global) */
  windsurfGlobal?: boolean;
  tools?: string[];
  jiraUrl?: string;
  jiraKey?: string;
  jiraEmail?: string;
  jiraApiToken?: string;
  figmaUrl?: string;
  figmaAccessToken?: string;
  geminiApiKey?: string;
  screenshotsDir?: string;
  screenshotToRnMcpCwd?: string;
  screenshotToCodeWsUrl?: string;
  /** Local stdio vs hosted Streamable HTTP (Render) */
  screenshotToRnMode?: "stdio" | "remote";
  /** Public MCP URL (https://….onrender.com or …/mcp) */
  screenshotToRnRemoteUrl?: string;
  screenshotToRnMcpApiKey?: string;
}

export interface ConnectDeps {
  connectionDeps?: ConnectionTestDeps;
  installMcp?: typeof installMcpForTargets;
}

const TOOL_LABELS: Record<string, string> = {
  claude: "Claude Code",
  cursor: "Cursor",
  "agents-md": "AGENTS.md",
  copilot: "Copilot / VS Code",
  windsurf: "Windsurf",
};

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

async function readAgentConfig(cwd: string): Promise<{
  jiraSiteUrl?: string;
  jiraProjectKey?: string;
  figmaFileUrl?: string;
  designSource?: DesignSource;
  screenshotsDir?: string;
}> {
  const cfgPath = path.join(cwd, ".agent", "config.json");
  if (!(await pathExists(cfgPath))) return {};
  try {
    const raw = JSON.parse(await readFile(cfgPath, "utf8")) as {
      jira?: { siteUrl?: string; projectKey?: string };
      figma?: { fileUrl?: string };
      designSource?: DesignSource;
      screenshotsDir?: string;
    };
    return {
      jiraSiteUrl: raw.jira?.siteUrl,
      jiraProjectKey: raw.jira?.projectKey,
      figmaFileUrl: raw.figma?.fileUrl,
      designSource: raw.designSource,
      screenshotsDir: raw.screenshotsDir,
    };
  } catch {
    return {};
  }
}

function inferDesignSource(
  url: string,
  explicit?: DesignSource,
  envSource?: string,
): DesignSource {
  if (explicit === "figma" || explicit === "stitch" || explicit === "screenshot") {
    return explicit;
  }
  if (envSource === "stitch" || envSource === "screenshot" || envSource === "figma") {
    return envSource;
  }
  if (/stitch/i.test(url)) return "stitch";
  if (/screenshots?:\/\//i.test(url)) return "screenshot";
  return "figma";
}

function upsertEnvLine(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) return content.replace(re, line);
  const trimmed = content.replace(/\s*$/, "");
  return `${trimmed}${trimmed ? "\n" : ""}${line}\n`;
}

async function writeSecretsToEnv(
  cwd: string,
  values: Record<string, string | undefined>,
): Promise<void> {
  const envPath = path.join(cwd, ".env");
  let existing = (await pathExists(envPath)) ? await readFile(envPath, "utf8") : "";
  if (!existing.trim()) {
    existing = "# rn-agentic-dev — local secrets (DO NOT COMMIT)\n";
  }
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === "") continue;
    existing = upsertEnvLine(existing, key, value);
  }
  await writeText(envPath, existing.endsWith("\n") ? existing : `${existing}\n`);
}

async function writeNonSecretsConfig(
  cwd: string,
  opts: {
    jiraSiteUrl?: string;
    jiraProjectKey?: string;
    figmaFileUrl?: string;
    designSource?: DesignSource;
    screenshotsDir?: string;
  },
): Promise<void> {
  const cfgPath = path.join(cwd, ".agent", "config.json");
  let base: Record<string, unknown> = {
    version: 1,
    workflow: "design-jira-maestro-ci",
    confirm: false,
  };
  if (await pathExists(cfgPath)) {
    try {
      base = JSON.parse(await readFile(cfgPath, "utf8")) as Record<string, unknown>;
    } catch {
      /* keep defaults */
    }
  }
  const jira = {
    ...((base.jira as object) ?? {}),
    ...(opts.jiraSiteUrl ? { siteUrl: opts.jiraSiteUrl } : {}),
    ...(opts.jiraProjectKey ? { projectKey: opts.jiraProjectKey } : {}),
    confirm: false,
  };
  const figma = {
    ...((base.figma as object) ?? {}),
    ...(opts.figmaFileUrl ? { fileUrl: opts.figmaFileUrl } : {}),
  };
  const next = {
    ...base,
    jira,
    figma,
    ...(opts.designSource ? { designSource: opts.designSource } : {}),
    ...(opts.screenshotsDir ? { screenshotsDir: opts.screenshotsDir } : {}),
  };
  await writeText(cfgPath, `${JSON.stringify(next, null, 2)}\n`);
}

function printConnectionChecklist(checks: ConnectionCheck[]): void {
  p.log.step("Connection checklist");
  for (const c of checks) {
    const line = `${c.title}: ${c.detail}`;
    if (c.status === "pass") p.log.success(line);
    else if (c.status === "skip") p.log.info(`[skip] ${line}`);
    else {
      p.log.error(line);
      if (c.fix) p.log.message(`  Fix: ${c.fix}`);
    }
  }
}

export async function connectCommand(
  options: ConnectOptions = {},
  deps: ConnectDeps = {},
): Promise<ConnectionCheck[]> {
  const cwd = options.cwd ?? process.cwd();
  const nonInteractive = Boolean(options.yes);
  const installMcp = deps.installMcp ?? installMcpForTargets;

  p.intro("rn-agentic-dev connect");

  // 1. Detect agents
  const detected = await detectAiTools(cwd);
  let toolIds = options.tools?.length ? options.tools : detected;

  if (!nonInteractive) {
    const answer = await p.multiselect({
      message: "Which agents should get MCP stubs? (merge only — existing servers kept)",
      options: Object.entries(TOOL_LABELS).map(([value, label]) => ({
        value,
        label,
        hint: detected.includes(value) ? "detected" : undefined,
      })),
      initialValues: toolIds.length ? toolIds : ["cursor", "claude"],
      required: true,
    });
    if (cancelIfNeeded(answer)) return [];
    toolIds = answer as string[];
  } else if (!toolIds.length) {
    toolIds = ["cursor", "claude", "copilot", "windsurf"];
  }

  // 2. Design source + credentials
  const existingCfg = await readAgentConfig(cwd);
  const envNow = await loadProjectEnv(cwd);

  let jiraSiteUrl = options.jiraUrl ?? existingCfg.jiraSiteUrl ?? envNow.JIRA_SITE_URL ?? "";
  let jiraProjectKey =
    options.jiraKey ?? existingCfg.jiraProjectKey ?? envNow.JIRA_PROJECT_KEY ?? "";
  let jiraEmail = options.jiraEmail ?? envNow.JIRA_EMAIL ?? "";
  let jiraApiToken = options.jiraApiToken ?? envNow.JIRA_API_TOKEN ?? "";
  let designFileUrl =
    options.figmaUrl ??
    existingCfg.figmaFileUrl ??
    envNow.FIGMA_FILE_URL ??
    envNow.STITCH_FILE_URL ??
    "";
  let figmaAccessToken =
    options.figmaAccessToken ??
    envNow.FIGMA_ACCESS_TOKEN ??
    envNow.FIGMA_TOKEN ??
    envNow.FIGMA_API_KEY ??
    "";
  let figmaMode = options.figmaMode ?? "stdio";
  let geminiApiKey = options.geminiApiKey ?? envNow.GEMINI_API_KEY ?? "";
  let screenshotsDir =
    options.screenshotsDir ??
    existingCfg.screenshotsDir ??
    envNow.SCREENSHOTS_DIR ??
    "docs/design-screenshots";
  let screenshotToRnMcpCwd =
    options.screenshotToRnMcpCwd ??
    envNow.SCREENSHOT_TO_RN_MCP_CWD ??
    path.join(cwd, "vendor-screenshot-to-code", "mcp");
  let screenshotWsUrl =
    options.screenshotToCodeWsUrl ??
    envNow.SCREENSHOT_TO_CODE_WS_URL ??
    "ws://127.0.0.1:7001";
  let screenshotToRnMode: "stdio" | "remote" =
    options.screenshotToRnMode ??
    (envNow.SCREENSHOT_TO_RN_MCP_URL ? "remote" : "stdio");
  let screenshotToRnRemoteUrl =
    options.screenshotToRnRemoteUrl ?? envNow.SCREENSHOT_TO_RN_MCP_URL ?? "";
  let screenshotToRnMcpApiKey =
    options.screenshotToRnMcpApiKey ??
    envNow.SCREENSHOT_TO_RN_MCP_API_KEY ??
    envNow.MCP_API_KEY ??
    "";
  let designSource = inferDesignSource(
    designFileUrl,
    options.designSource ?? existingCfg.designSource,
    envNow.DESIGN_SOURCE,
  );

  if (!nonInteractive) {
    p.log.step("Design source");
    const sourceAnswer = await p.select({
      message: "Connect Figma, Stitch, or Screenshots?",
      options: [
        {
          value: "figma" as const,
          label: "Figma",
          hint: "MCP + access token / OAuth",
        },
        {
          value: "stitch" as const,
          label: "Stitch (Google Stitch)",
          hint: "link + screenshots / Tailwind — no Figma token",
        },
        {
          value: "screenshot" as const,
          label: "Screenshots / recordings",
          hint: "screenshot-to-rn MCP + Gemini — exact UI from images",
        },
      ],
      initialValue: designSource,
    });
    if (cancelIfNeeded(sourceAnswer)) return [];
    designSource = sourceAnswer as DesignSource;

    if (designSource === "figma") {
      p.note(
        [
          `Token (stdio / Framelink): ${FIGMA_TOKEN_URL}`,
          `Remote MCP (OAuth in client): ${FIGMA_REMOTE_MCP_URL}`,
          `Guide: ${FIGMA_MCP_GUIDE_URL}`,
        ].join("\n"),
        "Create Figma access",
      );

      const modeAnswer = await p.select({
        message: "Figma MCP mode",
        options: [
          {
            value: "stdio" as const,
            label: "Token + stdio (figma-developer-mcp)",
            hint: "recommended for CI / headless",
          },
          {
            value: "remote" as const,
            label: "Remote hosted MCP (OAuth)",
            hint: "https://mcp.figma.com/mcp",
          },
        ],
        initialValue: "stdio",
      });
      if (cancelIfNeeded(modeAnswer)) return [];
      figmaMode = modeAnswer as "stdio" | "remote";

      const figmaUrl = await p.text({
        message: "FIGMA_FILE_URL",
        placeholder: "https://www.figma.com/design/…",
        initialValue: designFileUrl,
        validate: (v) => (v?.trim() ? undefined : "Required"),
      });
      if (cancelIfNeeded(figmaUrl)) return [];
      designFileUrl = String(figmaUrl).trim();

      if (figmaMode === "stdio") {
        const tok = await p.password({
          message: "FIGMA_ACCESS_TOKEN",
          validate: (v) => (v?.trim() ? undefined : "Required for stdio mode"),
        });
        if (cancelIfNeeded(tok)) return [];
        figmaAccessToken = String(tok).trim();
      } else {
        p.log.info(
          `After restart, add the Figma remote MCP in your client and complete OAuth (${FIGMA_REMOTE_MCP_URL}).`,
        );
      }
    } else if (designSource === "stitch") {
      p.note(
        [
          "Stitch has no Figma MCP — feature-grill uses screenshots + CSS/Tailwind.",
          "Export HTML + Tailwind later for: npx rn-agentic-dev tokens (figma-to-tokens Step 1B).",
        ].join("\n"),
        "Stitch setup",
      );
      const stitchUrl = await p.text({
        message: "STITCH_FILE_URL (project / share link)",
        placeholder: "https://…stitch…",
        initialValue: designFileUrl,
        validate: (v) => (v?.trim() ? undefined : "Required"),
      });
      if (cancelIfNeeded(stitchUrl)) return [];
      designFileUrl = String(stitchUrl).trim();
      figmaAccessToken = "";
    } else {
      p.note(
        [
          "Screenshots path uses screenshot-to-rn MCP (Phase 2).",
          "Local: run vendor backend + stdio MCP",
          "Hosted (Figma-style): deploy on Render → connect via URL (see docs/deploy-screenshot-mcp-render.md)",
          "feature-grill → screenshot_to_rn / refine_rn_ui → ticket-to-code",
        ].join("\n"),
        "Screenshots setup",
      );
      designFileUrl = "screenshots://local";
      figmaAccessToken = "";
      const shotsDir = await p.text({
        message: "SCREENSHOTS_DIR (folder for design PNGs)",
        placeholder: "docs/design-screenshots",
        initialValue: screenshotsDir,
      });
      if (cancelIfNeeded(shotsDir)) return [];
      screenshotsDir = String(shotsDir).trim() || "docs/design-screenshots";

      const modeAnswer = await p.select({
        message: "screenshot-to-rn MCP mode",
        options: [
          {
            value: "stdio" as const,
            label: "Local stdio (dev)",
            hint: "run_mcp.sh + backend on this machine",
          },
          {
            value: "remote" as const,
            label: "Remote hosted URL (Render)",
            hint: "https://….onrender.com/mcp — like Figma remote",
          },
        ],
        initialValue: screenshotToRnMode,
      });
      if (cancelIfNeeded(modeAnswer)) return [];
      screenshotToRnMode = modeAnswer as "stdio" | "remote";

      if (screenshotToRnMode === "remote") {
        const remoteUrl = await p.text({
          message: "SCREENSHOT_TO_RN_MCP_URL (hosted MCP)",
          placeholder: "https://screenshot-to-rn-mcp.onrender.com/mcp",
          initialValue: screenshotToRnRemoteUrl,
          validate: (v) =>
            v?.trim().startsWith("http") ? undefined : "https://… URL required",
        });
        if (cancelIfNeeded(remoteUrl)) return [];
        screenshotToRnRemoteUrl = String(remoteUrl).trim();

        const mcpTok = await p.password({
          message: "SCREENSHOT_TO_RN_MCP_API_KEY (Bearer — same as Render MCP_API_KEY)",
          validate: (v) =>
            v?.trim() ? undefined : "Required to call the hosted MCP",
        });
        if (cancelIfNeeded(mcpTok)) return [];
        screenshotToRnMcpApiKey = String(mcpTok).trim();
        geminiApiKey = geminiApiKey || "";
      } else {
        const mcpCwd = await p.text({
          message: "SCREENSHOT_TO_RN_MCP_CWD (mcp package path)",
          placeholder: path.join(cwd, "vendor-screenshot-to-code", "mcp"),
          initialValue: screenshotToRnMcpCwd,
        });
        if (cancelIfNeeded(mcpCwd)) return [];
        screenshotToRnMcpCwd = String(mcpCwd).trim() || screenshotToRnMcpCwd;

        const ws = await p.text({
          message: "SCREENSHOT_TO_CODE_WS_URL",
          placeholder: "ws://127.0.0.1:7001",
          initialValue: screenshotWsUrl,
        });
        if (cancelIfNeeded(ws)) return [];
        screenshotWsUrl = String(ws).trim() || "ws://127.0.0.1:7001";

        const gem = await p.password({
          message: "GEMINI_API_KEY (recommended for exact screenshot fidelity)",
          validate: (v) =>
            v?.trim() ? undefined : "Required for local Screenshots path",
        });
        if (cancelIfNeeded(gem)) return [];
        geminiApiKey = String(gem).trim();
      }
    }

    p.log.step("Jira / Atlassian");
    p.note(`API token: ${ATLASSIAN_TOKEN_URL}`, "Create Atlassian API token");

    const jiraUrl = await p.text({
      message: "JIRA_SITE_URL",
      placeholder: "https://your-domain.atlassian.net",
      initialValue: jiraSiteUrl,
      validate: (v) => (v?.trim() ? undefined : "Required"),
    });
    if (cancelIfNeeded(jiraUrl)) return [];
    jiraSiteUrl = String(jiraUrl).trim();

    const jiraKey = await p.text({
      message: "JIRA_PROJECT_KEY",
      placeholder: "KAN",
      initialValue: jiraProjectKey || "KAN",
      validate: (v) => (v?.trim() ? undefined : "Required"),
    });
    if (cancelIfNeeded(jiraKey)) return [];
    jiraProjectKey = String(jiraKey).trim();

    const email = await p.text({
      message: "JIRA_EMAIL",
      placeholder: "you@company.com",
      initialValue: jiraEmail,
      validate: (v) => (v?.trim() ? undefined : "Required"),
    });
    if (cancelIfNeeded(email)) return [];
    jiraEmail = String(email).trim();

    const token = await p.password({
      message: "JIRA_API_TOKEN",
      validate: (v) => (v?.trim() ? undefined : "Required"),
    });
    if (cancelIfNeeded(token)) return [];
    jiraApiToken = String(token).trim();
  } else {
    designSource = inferDesignSource(
      designFileUrl,
      options.designSource ?? designSource,
      envNow.DESIGN_SOURCE,
    );
    if (designSource === "screenshot" && !designFileUrl) {
      designFileUrl = "screenshots://local";
    }
  }

  await ensureEnvGitignore(cwd);
  await writeSecretsToEnv(cwd, {
    DESIGN_SOURCE: designSource,
    JIRA_SITE_URL: jiraSiteUrl,
    JIRA_PROJECT_KEY: jiraProjectKey,
    JIRA_EMAIL: jiraEmail,
    JIRA_API_TOKEN: jiraApiToken,
    ...(designSource === "stitch"
      ? { STITCH_FILE_URL: designFileUrl, FIGMA_FILE_URL: designFileUrl }
      : designSource === "screenshot"
        ? {
            SCREENSHOTS_DIR: screenshotsDir,
            ...(screenshotToRnMode === "remote"
              ? {
                  SCREENSHOT_TO_RN_MCP_URL: screenshotToRnRemoteUrl,
                  SCREENSHOT_TO_RN_MCP_API_KEY:
                    screenshotToRnMcpApiKey || undefined,
                }
              : {
                  SCREENSHOT_TO_CODE_WS_URL: screenshotWsUrl,
                  SCREENSHOT_TO_RN_MCP_CWD: screenshotToRnMcpCwd,
                  GEMINI_API_KEY: geminiApiKey || undefined,
                }),
          }
        : {
            FIGMA_FILE_URL: designFileUrl,
            FIGMA_ACCESS_TOKEN: figmaAccessToken || undefined,
          }),
  });
  await writeNonSecretsConfig(cwd, {
    jiraSiteUrl,
    jiraProjectKey,
    figmaFileUrl: designFileUrl,
    designSource,
    screenshotsDir: designSource === "screenshot" ? screenshotsDir : undefined,
  });
  p.log.success(
    `Wrote .env (gitignored) + .agent/config.json — designSource=${designSource}`,
  );

  // 3. Merge MCP (Figma MCP only when design source is Figma)
  const targets: AgentMcpTarget[] = toolIdsToMcpTargets(toolIds);
  let allowGlobal = Boolean(options.windsurfGlobal);
  if (toolIds.includes("windsurf") && !nonInteractive) {
    const glob = await p.confirm({
      message:
        "Also merge into Windsurf global MCP config (~/.codeium/windsurf/mcp_config.json)?",
      initialValue: false,
    });
    if (cancelIfNeeded(glob)) return [];
    allowGlobal = Boolean(glob);
  }
  if (allowGlobal) targets.push("windsurf-global");

  const includeFigma = designSource === "figma";
  const includeScreenshotToRn = designSource === "screenshot";
  const mcpResults = await installMcp(cwd, targets, {
    figmaMode,
    includeFigma,
    includeScreenshotToRn,
    screenshotToRnMode: includeScreenshotToRn ? screenshotToRnMode : undefined,
    screenshotToRnCwd:
      includeScreenshotToRn && screenshotToRnMode !== "remote"
        ? screenshotToRnMcpCwd
        : undefined,
    screenshotToRnRemoteUrl:
      includeScreenshotToRn && screenshotToRnMode === "remote"
        ? screenshotToRnRemoteUrl
        : undefined,
  });
  for (const r of mcpResults) {
    p.log.success(`MCP merge: ${path.relative(cwd, r.path) || r.path}`);
  }
  if (!includeFigma) {
    p.log.info(
      includeScreenshotToRn
        ? screenshotToRnMode === "remote"
          ? `Skipped Figma MCP; merged remote screenshot-to-rn → ${screenshotToRnRemoteUrl}`
          : "Skipped Figma MCP; merged local screenshot-to-rn MCP stubs."
        : "Skipped Figma MCP stubs (Stitch design source).",
    );
  }

  // 4. Live connection tests
  let checks: ConnectionCheck[] = [];
  if (!options.skipTest) {
    const env = await loadProjectEnv(cwd, {
      ...process.env,
      DESIGN_SOURCE: designSource,
      JIRA_SITE_URL: jiraSiteUrl || process.env.JIRA_SITE_URL,
      JIRA_PROJECT_KEY: jiraProjectKey || process.env.JIRA_PROJECT_KEY,
      JIRA_EMAIL: jiraEmail || process.env.JIRA_EMAIL,
      JIRA_API_TOKEN: jiraApiToken || process.env.JIRA_API_TOKEN,
      FIGMA_FILE_URL: designFileUrl || process.env.FIGMA_FILE_URL,
      STITCH_FILE_URL: designFileUrl || process.env.STITCH_FILE_URL,
      FIGMA_ACCESS_TOKEN: figmaAccessToken || process.env.FIGMA_ACCESS_TOKEN,
      GEMINI_API_KEY: geminiApiKey || process.env.GEMINI_API_KEY,
      SCREENSHOT_TO_CODE_WS_URL: screenshotWsUrl || process.env.SCREENSHOT_TO_CODE_WS_URL,
      SCREENSHOTS_DIR: screenshotsDir || process.env.SCREENSHOTS_DIR,
    });
    checks = await runConnectionTests(
      {
        figmaFileUrl: designFileUrl,
        jiraSiteUrl,
        jiraProjectKey,
        designSource,
      },
      { ...deps.connectionDeps, env },
    );
    printConnectionChecklist(checks);
    if (connectionsHaveFailures(checks)) {
      process.exitCode = 1;
      p.log.warn("Some connections failed — fix the items above, then re-run: rn-agentic-dev doctor --connections");
    }
  }

  p.outro("Restart your agent, then type anything. The kit will guide you.");
  return checks;
}
