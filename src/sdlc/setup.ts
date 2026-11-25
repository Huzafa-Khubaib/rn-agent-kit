import { cp } from "node:fs/promises";
import path from "node:path";
import { buildKitMcpServers } from "../connect/mcp-servers.js";
import type { DesignSource } from "../schema/agent-config.js";
import { ensureDir, pathExists, writeText } from "../utils/fs.js";
import { ensureEnvGitignore } from "../utils/gitignore.js";
import { writeMergedMcpJson } from "../utils/mcp-merge.js";
import { getTemplatesRoot } from "../utils/templates.js";

export type SdlcDesignSource = DesignSource;

export interface SdlcInputs {
  jiraSiteUrl: string;
  jiraProjectKey: string;
  /** Figma/Stitch URL, or unused placeholder when designSource=screenshot. */
  figmaFileUrl: string;
  githubRepo: string;
  /** Figma, Stitch, or Screenshots — equal options. Defaults to figma. */
  designSource?: SdlcDesignSource;
  /** Local screenshots folder when designSource=screenshot. */
  screenshotsDir?: string;
  /** Absolute path to screenshot-to-rn MCP package (vendor-screenshot-to-code/mcp). */
  screenshotToRnMcpCwd?: string;
  /** Secrets — written only to .env (never to .agent/config.json or .env.example). */
  jiraEmail?: string;
  jiraApiToken?: string;
  figmaAccessToken?: string;
  geminiApiKey?: string;
  /** When true, do not write files — return planned paths only. */
  dryRun?: boolean;
}

export interface SdlcSetupResult {
  filesWritten: string[];
}

function resolveDesignSource(inputs: SdlcInputs): SdlcDesignSource {
  if (inputs.designSource === "stitch") return "stitch";
  if (inputs.designSource === "screenshot") return "screenshot";
  return "figma";
}

function buildAgentConfig(inputs: SdlcInputs): string {
  const designSource = resolveDesignSource(inputs);
  return `${JSON.stringify(
    {
      version: 1,
      workflow: "design-jira-maestro-ci",
      designSource,
      /** When true, prd-to-jira pauses for plan approval before creating issues. */
      confirm: false,
      jira: {
        siteUrl: inputs.jiraSiteUrl,
        projectKey: inputs.jiraProjectKey,
        confirm: false,
      },
      figma: {
        fileUrl:
          designSource === "screenshot"
            ? inputs.figmaFileUrl || "screenshots://local"
            : inputs.figmaFileUrl,
      },
      ...(designSource === "screenshot" && inputs.screenshotsDir
        ? { screenshotsDir: inputs.screenshotsDir }
        : {}),
      github: {
        repo: inputs.githubRepo,
      },
    },
    null,
    2,
  )}\n`;
}

function buildEnvExample(inputs: SdlcInputs): string {
  const designSource = resolveDesignSource(inputs);
  let designBlock: string;
  if (designSource === "stitch") {
    designBlock = `DESIGN_SOURCE=stitch
STITCH_FILE_URL=${inputs.figmaFileUrl}
FIGMA_FILE_URL=${inputs.figmaFileUrl}
`;
  } else if (designSource === "screenshot") {
    designBlock = `DESIGN_SOURCE=screenshot
SCREENSHOTS_DIR=${inputs.screenshotsDir ?? "docs/design-screenshots"}
SCREENSHOT_TO_CODE_WS_URL=ws://127.0.0.1:7001
SCREENSHOT_TO_RN_MCP_CWD=${inputs.screenshotToRnMcpCwd ?? ""}
GEMINI_API_KEY=
`;
  } else {
    designBlock = `DESIGN_SOURCE=figma
FIGMA_FILE_URL=${inputs.figmaFileUrl}
FIGMA_ACCESS_TOKEN=
`;
  }
  // Placeholders only — never put real tokens/email in .env.example
  return `# rn-agentic-dev SDLC — copy values into .env (gitignored). Never commit secrets.
JIRA_SITE_URL=${inputs.jiraSiteUrl}
JIRA_PROJECT_KEY=${inputs.jiraProjectKey}
JIRA_EMAIL=
JIRA_API_TOKEN=

${designBlock}
GITHUB_REPO=${inputs.githubRepo}
GITHUB_TOKEN=
`;
}

/** Local .env with values collected at init (gitignored). */
function buildEnvFile(inputs: SdlcInputs): string {
  const designSource = resolveDesignSource(inputs);
  let designBlock: string;
  if (designSource === "stitch") {
    designBlock = `DESIGN_SOURCE=stitch
STITCH_FILE_URL=${inputs.figmaFileUrl}
FIGMA_FILE_URL=${inputs.figmaFileUrl}
`;
  } else if (designSource === "screenshot") {
    designBlock = `DESIGN_SOURCE=screenshot
SCREENSHOTS_DIR=${inputs.screenshotsDir ?? "docs/design-screenshots"}
SCREENSHOT_TO_CODE_WS_URL=ws://127.0.0.1:7001
SCREENSHOT_TO_RN_MCP_CWD=${inputs.screenshotToRnMcpCwd ?? ""}
GEMINI_API_KEY=${inputs.geminiApiKey ?? ""}
`;
  } else {
    designBlock = `DESIGN_SOURCE=figma
FIGMA_FILE_URL=${inputs.figmaFileUrl}
FIGMA_ACCESS_TOKEN=${inputs.figmaAccessToken ?? ""}
`;
  }
  return `# rn-agentic-dev — local secrets (DO NOT COMMIT)
JIRA_SITE_URL=${inputs.jiraSiteUrl}
JIRA_PROJECT_KEY=${inputs.jiraProjectKey}
JIRA_EMAIL=${inputs.jiraEmail ?? ""}
JIRA_API_TOKEN=${inputs.jiraApiToken ?? ""}

${designBlock}
GITHUB_REPO=${inputs.githubRepo}
GITHUB_TOKEN=
`;
}

/** Write SDLC config, MCP stubs, GitHub workflows, and Maestro flows (no secrets). */
export async function setupSdlcWorkflow(
  projectDir: string,
  inputs: SdlcInputs,
): Promise<SdlcSetupResult> {
  const filesWritten: string[] = [];
  const templates = getTemplatesRoot();
  const dryRun = Boolean(inputs.dryRun);

  const agentConfig = path.join(projectDir, ".agent", "config.json");
  if (!dryRun) await writeText(agentConfig, buildAgentConfig(inputs));
  filesWritten.push(".agent/config.json");

  const envExample = path.join(projectDir, ".env.example");
  if (!dryRun) await writeText(envExample, buildEnvExample(inputs));
  filesWritten.push(".env.example");

  // Always ensure .gitignore before writing .env
  if (!dryRun) {
    const gi = await ensureEnvGitignore(projectDir);
    if (gi.updated) filesWritten.push(".gitignore");
  }

  const hasAnySecret = Boolean(
    inputs.jiraEmail ||
      inputs.jiraApiToken ||
      inputs.figmaAccessToken ||
      inputs.geminiApiKey,
  );
  if (!dryRun && (hasAnySecret || inputs.jiraSiteUrl || inputs.figmaFileUrl)) {
    await writeText(path.join(projectDir, ".env"), buildEnvFile(inputs));
    filesWritten.push(".env");
  }

  const designSource = resolveDesignSource(inputs);
  const screenshotMcpCwd =
    inputs.screenshotToRnMcpCwd ||
    path.join(projectDir, "vendor-screenshot-to-code", "mcp");
  const mcpIncoming = buildKitMcpServers({
    figmaMode: "stdio",
    includeFigma: designSource === "figma",
    includeScreenshotToRn: designSource === "screenshot",
    screenshotToRnCwd: designSource === "screenshot" ? screenshotMcpCwd : undefined,
  });
  if (!dryRun) {
    await writeMergedMcpJson(path.join(projectDir, ".mcp.json"), mcpIncoming);
    await writeMergedMcpJson(path.join(projectDir, ".cursor", "mcp.json"), mcpIncoming);
    await writeMergedMcpJson(path.join(projectDir, ".vscode", "mcp.json"), mcpIncoming);
    await writeMergedMcpJson(path.join(projectDir, ".windsurf", "mcp.json"), mcpIncoming);
  }
  filesWritten.push(".mcp.json", ".cursor/mcp.json", ".vscode/mcp.json", ".windsurf/mcp.json");

  const workflowsSrc = path.join(templates, "workflows");
  const workflowsDest = path.join(projectDir, ".github", "workflows");
  if (await pathExists(workflowsSrc)) {
    if (!dryRun) {
      await ensureDir(workflowsDest);
      await cp(workflowsSrc, workflowsDest, { recursive: true });
    }
    filesWritten.push(".github/workflows/");
  }

  const maestroSrc = path.join(templates, "maestro");
  const maestroDest = path.join(projectDir, "maestro");
  if (await pathExists(maestroSrc)) {
    if (!dryRun) {
      await ensureDir(maestroDest);
      await cp(maestroSrc, maestroDest, { recursive: true });
    }
    filesWritten.push("maestro/");
  }

  return { filesWritten };
}
