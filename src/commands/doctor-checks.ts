import { readFile } from "node:fs/promises";
import path from "node:path";
import { execa } from "execa";
import { pathExists } from "../utils/fs.js";

export type CheckStatus = "pass" | "fail" | "warn" | "skip";

export interface DoctorCheckResult {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
}

export interface DoctorCheckDeps {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  which?: (cmd: string) => Promise<string | null>;
  exec?: (file: string, args: string[]) => Promise<{ exitCode: number; stdout: string }>;
}

async function defaultWhich(cmd: string): Promise<string | null> {
  try {
    const r = await execa(process.platform === "win32" ? "where" : "which", [cmd]);
    const line = r.stdout.trim().split(/\r?\n/)[0];
    return line || null;
  } catch {
    return null;
  }
}

async function defaultExec(
  file: string,
  args: string[],
): Promise<{ exitCode: number; stdout: string }> {
  try {
    const r = await execa(file, args, { reject: false });
    return { exitCode: r.exitCode ?? 1, stdout: (r.stdout || r.stderr || "").trim() };
  } catch (e) {
    return { exitCode: 1, stdout: e instanceof Error ? e.message : String(e) };
  }
}

function nodeMajor(version: string): number {
  const m = version.replace(/^v/, "").match(/^(\d+)/);
  return m ? Number(m[1]) : 0;
}

async function readJsonSafe(file: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as unknown;
  } catch {
    return null;
  }
}

/** Core environment / tooling / MCP / config checks (no adapter installs). */
export async function runDoctorChecks(
  cwd: string,
  deps: DoctorCheckDeps = {},
): Promise<DoctorCheckResult[]> {
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  const which = deps.which ?? defaultWhich;
  const exec = deps.exec ?? defaultExec;
  const results: DoctorCheckResult[] = [];

  // Node
  const major = nodeMajor(process.versions.node);
  results.push(
    major >= 18
      ? {
          id: "node",
          title: "Node.js >= 18",
          status: "pass",
          detail: `v${process.versions.node}`,
        }
      : {
          id: "node",
          title: "Node.js >= 18",
          status: "fail",
          detail: `Found v${process.versions.node}`,
          fix: "Install Node 18+ (https://nodejs.org) or use nvm/fnm.",
        },
  );

  // git
  const gitPath = await which("git");
  if (gitPath) {
    const g = await exec("git", ["--version"]);
    results.push({
      id: "git",
      title: "git",
      status: "pass",
      detail: g.stdout || gitPath,
    });
  } else {
    results.push({
      id: "git",
      title: "git",
      status: "fail",
      detail: "git not found on PATH",
      fix: "Install Git and ensure it is on PATH (https://git-scm.com).",
    });
  }

  // Java (helpful for Android builds)
  const javaPath = await which("java");
  if (javaPath) {
    const j = await exec("java", ["-version"]);
    results.push({
      id: "java",
      title: "Java",
      status: "pass",
      detail: (j.stdout.split("\n")[0] || javaPath).slice(0, 120),
    });
  } else {
    results.push({
      id: "java",
      title: "Java",
      status: "warn",
      detail: "java not found (needed for Android Gradle builds)",
      fix: "Install Temurin JDK 17+ and ensure `java` is on PATH.",
    });
  }

  // Android SDK
  const androidHome = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
  if (androidHome && (await pathExists(androidHome))) {
    results.push({
      id: "android-sdk",
      title: "Android SDK (ANDROID_HOME)",
      status: "pass",
      detail: androidHome,
    });
  } else {
    results.push({
      id: "android-sdk",
      title: "Android SDK (ANDROID_HOME)",
      status: "warn",
      detail: androidHome
        ? `ANDROID_HOME set but missing: ${androidHome}`
        : "ANDROID_HOME / ANDROID_SDK_ROOT not set",
      fix: "Install Android Studio SDK and export ANDROID_HOME (and platform-tools on PATH).",
    });
  }

  // Xcode (macOS only)
  if (platform === "darwin") {
    const xcode = await which("xcodebuild");
    if (xcode) {
      const x = await exec("xcodebuild", ["-version"]);
      results.push({
        id: "xcode",
        title: "Xcode",
        status: "pass",
        detail: (x.stdout.split("\n")[0] || xcode).slice(0, 120),
      });
    } else {
      results.push({
        id: "xcode",
        title: "Xcode",
        status: "warn",
        detail: "xcodebuild not found",
        fix: "Install Xcode from the App Store and run `xcode-select --install` / `sudo xcode-select -s /Applications/Xcode.app`.",
      });
    }
  } else {
    results.push({
      id: "xcode",
      title: "Xcode",
      status: "skip",
      detail: `Skipped on ${platform}`,
    });
  }

  // Maestro
  const maestro = await which("maestro");
  if (maestro) {
    const m = await exec("maestro", ["--version"]);
    results.push({
      id: "maestro",
      title: "Maestro",
      status: "pass",
      detail: m.stdout || maestro,
    });
  } else {
    results.push({
      id: "maestro",
      title: "Maestro",
      status: "warn",
      detail: "maestro not found on PATH",
      fix: 'Install with: curl -fsSL "https://get.maestro.mobile.dev" | bash  then add ~/.maestro/bin to PATH.',
    });
  }

  // MCP config files
  const mcpPaths = [path.join(cwd, ".mcp.json"), path.join(cwd, ".cursor", "mcp.json")];
  let mcpRaw: unknown = null;
  let mcpFile: string | null = null;
  for (const pth of mcpPaths) {
    if (await pathExists(pth)) {
      mcpRaw = await readJsonSafe(pth);
      mcpFile = pth;
      break;
    }
  }

  if (!mcpFile || !mcpRaw || typeof mcpRaw !== "object") {
    results.push({
      id: "mcp-config",
      title: "MCP config (.mcp.json / .cursor/mcp.json)",
      status: "warn",
      detail: "No MCP config found in project",
      fix: "Run `rn-agentic-dev init --sdlc` or add Figma + Atlassian servers to .mcp.json / .cursor/mcp.json.",
    });
  } else {
    const servers =
      (mcpRaw as { mcpServers?: Record<string, unknown> }).mcpServers ??
      (mcpRaw as { servers?: Record<string, unknown> }).servers ??
      {};
    const names = Object.keys(servers).map((k) => k.toLowerCase());
    const hasFigma = names.some((n) => n.includes("figma"));
    const hasAtlassian = names.some(
      (n) => n.includes("atlassian") || n.includes("jira") || n.includes("mcp-atlassian"),
    );
    if (hasFigma && hasAtlassian) {
      results.push({
        id: "mcp-config",
        title: "MCP config (Figma + Atlassian)",
        status: "pass",
        detail: `Found in ${path.relative(cwd, mcpFile) || mcpFile}: ${Object.keys(servers).join(", ")}`,
      });
    } else {
      results.push({
        id: "mcp-config",
        title: "MCP config (Figma + Atlassian)",
        status: "warn",
        detail: `Partial MCP config in ${path.relative(cwd, mcpFile)} (figma=${hasFigma}, atlassian=${hasAtlassian})`,
        fix: "Ensure both Figma and Atlassian/Jira MCP server entries exist (see templates from init --sdlc).",
      });
    }
  }

  // Env tokens (never print values)
  const figmaToken = Boolean(env.FIGMA_TOKEN || env.FIGMA_ACCESS_TOKEN || env.FIGMA_API_KEY);
  results.push(
    figmaToken
      ? {
          id: "figma-token",
          title: "Figma token in env",
          status: "pass",
          detail: "FIGMA_TOKEN / FIGMA_ACCESS_TOKEN / FIGMA_API_KEY is set",
        }
      : {
          id: "figma-token",
          title: "Figma token in env",
          status: "warn",
          detail: "No Figma token env var set",
          fix: "Export FIGMA_TOKEN (or FIGMA_ACCESS_TOKEN) for tokens fetch / Figma MCP. Never commit it.",
        },
  );

  const jiraOk = Boolean(
    (env.JIRA_SITE_URL || env.JIRA_URL) &&
    (env.JIRA_EMAIL || env.ATLASSIAN_EMAIL) &&
    (env.JIRA_API_TOKEN || env.ATLASSIAN_API_TOKEN),
  );
  results.push(
    jiraOk
      ? {
          id: "jira-env",
          title: "Jira / Atlassian env",
          status: "pass",
          detail: "JIRA_SITE_URL + JIRA_EMAIL + JIRA_API_TOKEN present",
        }
      : {
          id: "jira-env",
          title: "Jira / Atlassian env",
          status: "warn",
          detail: "Missing one of JIRA_SITE_URL / JIRA_EMAIL / JIRA_API_TOKEN",
          fix: "Set Jira Cloud site URL, email, and API token for Atlassian MCP and CI comments.",
        },
  );

  // .agent/config.json
  const agentConfigPath = path.join(cwd, ".agent", "config.json");
  if (!(await pathExists(agentConfigPath))) {
    results.push({
      id: "agent-config",
      title: ".agent/config.json",
      status: "warn",
      detail: "Not found",
      fix: "Run `rn-agentic-dev init --sdlc` or `rn-agentic-dev intake` to create .agent/config.json (no secrets).",
    });
  } else {
    const cfg = await readJsonSafe(agentConfigPath);
    if (!cfg || typeof cfg !== "object") {
      results.push({
        id: "agent-config",
        title: ".agent/config.json",
        status: "fail",
        detail: "Invalid JSON",
        fix: "Fix JSON syntax or regenerate via init --sdlc / intake.",
      });
    } else {
      const c = cfg as {
        jira?: { siteUrl?: string; projectKey?: string };
        figma?: { fileUrl?: string };
      };
      const missing: string[] = [];
      if (!c.jira?.siteUrl) missing.push("jira.siteUrl");
      if (!c.jira?.projectKey) missing.push("jira.projectKey");
      if (!c.figma?.fileUrl) missing.push("figma.fileUrl");
      if (missing.length) {
        results.push({
          id: "agent-config",
          title: ".agent/config.json",
          status: "warn",
          detail: `Missing fields: ${missing.join(", ")}`,
          fix: "Fill jira.siteUrl, jira.projectKey, and figma.fileUrl (still no secrets in this file).",
        });
      } else {
        results.push({
          id: "agent-config",
          title: ".agent/config.json",
          status: "pass",
          detail: `project ${c.jira!.projectKey}`,
        });
      }
    }
  }

  // Workflow artifacts for feature-grill → plan-review → jira-sync
  const gitignorePath = path.join(cwd, ".gitignore");
  if (await pathExists(gitignorePath)) {
    const gi = await readFile(gitignorePath, "utf8");
    const ignoresEnv = /(^|\/)\.env(\.|$)/m.test(gi) || gi.split(/\r?\n/).some((l) => l.trim() === ".env");
    results.push(
      ignoresEnv
        ? {
            id: "gitignore-env",
            title: ".gitignore includes .env",
            status: "pass",
            detail: ".env is ignored",
          }
        : {
            id: "gitignore-env",
            title: ".gitignore includes .env",
            status: "warn",
            detail: ".env not listed in .gitignore",
            fix: "Add `.env` (and `.env.local`) to .gitignore — never commit secrets.",
          },
    );
  } else {
    results.push({
      id: "gitignore-env",
      title: ".gitignore includes .env",
      status: "warn",
      detail: "No .gitignore",
      fix: "Create .gitignore with `.env` entries (init --sdlc also ensures this).",
    });
  }

  const approvalsPath = path.join(cwd, ".agent", "approvals.json");
  results.push(
    (await pathExists(approvalsPath))
      ? {
          id: "approvals",
          title: ".agent/approvals.json",
          status: "pass",
          detail: "Present (plan-review gate)",
        }
      : {
          id: "approvals",
          title: ".agent/approvals.json",
          status: "warn",
          detail: "Not found yet — required before jira-sync",
          fix: "Run plan-review and reply `approve` to record an approval.",
        },
  );

  const featuresDir = path.join(cwd, "docs", "features");
  results.push(
    (await pathExists(featuresDir))
      ? {
          id: "docs-features",
          title: "docs/features/",
          status: "pass",
          detail: "Feature docs folder exists",
        }
      : {
          id: "docs-features",
          title: "docs/features/",
          status: "warn",
          detail: "No docs/features yet",
          fix: "Start with feature-grill to create docs/features/<slug>/spec.md",
        },
  );

  return results;
}

export function doctorHasFailures(results: DoctorCheckResult[]): boolean {
  return results.some((r) => r.status === "fail");
}
