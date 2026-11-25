import * as p from "@clack/prompts";
import path from "node:path";
import { adapters } from "../adapters/index.js";
import { detectClaudeProject } from "../adapters/claude.js";
import { CLAUDE_START, CLAUDE_END } from "../adapters/claude-md.js";
import { detectCursorProject } from "../adapters/cursor.js";
import { detectAgentsMd, START_MARKER, END_MARKER } from "../adapters/agents-md.js";
import { detectCopilotProject, COPILOT_START, COPILOT_END } from "../adapters/copilot.js";
import { detectWindsurfProject } from "../adapters/windsurf.js";
import { loadSkills } from "../utils/skills.js";
import { pathExists, readText } from "../utils/fs.js";
import { loadProjectEnv } from "../connect/load-dotenv.js";
import {
  connectionsHaveFailures,
  runConnectionTests,
  type ConnectionTestDeps,
} from "../connect/test-connections.js";
import {
  doctorHasFailures,
  runDoctorChecks,
  type DoctorCheckDeps,
  type DoctorCheckResult,
} from "./doctor-checks.js";

export interface DoctorOptions {
  cwd?: string;
  /** When true, adapter skill presence is treated as informational only (still printed). */
  skipAdapters?: boolean;
  /** Live Figma + Jira API checks (uses .env + .agent/config.json). */
  connections?: boolean;
}

async function checkClaude(cwd: string, skillNames: string[]): Promise<string[]> {
  const issues: string[] = [];
  if (!(await detectClaudeProject(cwd))) {
    issues.push("No .claude/ or CLAUDE.md detected");
    return issues;
  }
  for (const name of skillNames) {
    const dest = path.join(cwd, ".claude", "skills", name, "SKILL.md");
    if (!(await pathExists(dest))) issues.push(`Missing Claude skill: ${name}`);
  }
  const claudeMd = path.join(cwd, "CLAUDE.md");
  if (await pathExists(claudeMd)) {
    const content = await readText(claudeMd);
    if (!content.includes(CLAUDE_START) || !content.includes(CLAUDE_END)) {
      issues.push("CLAUDE.md missing rn-agentic-dev always-on router markers");
    }
  } else if (skillNames.includes("rn-agent-router")) {
    issues.push("Missing CLAUDE.md always-on router (run update -a claude)");
  }
  return issues;
}

async function checkCursor(cwd: string, skillNames: string[]): Promise<string[]> {
  const issues: string[] = [];
  if (!(await detectCursorProject(cwd))) {
    issues.push("No .cursor/ or .cursorrules detected");
    return issues;
  }
  for (const name of skillNames) {
    const dest = path.join(cwd, ".cursor", "rules", `${name}.mdc`);
    if (!(await pathExists(dest))) issues.push(`Missing Cursor rule: ${name}.mdc`);
  }
  return issues;
}

async function checkAgentsMd(cwd: string): Promise<string[]> {
  const issues: string[] = [];
  if (!(await detectAgentsMd(cwd))) {
    issues.push("AGENTS.md not found");
    return issues;
  }
  const content = await readText(path.join(cwd, "AGENTS.md"));
  if (!content.includes(START_MARKER) || !content.includes(END_MARKER)) {
    issues.push("AGENTS.md missing rn-agentic-dev markers");
  }
  return issues;
}

async function checkCopilot(cwd: string): Promise<string[]> {
  const issues: string[] = [];
  if (!(await detectCopilotProject(cwd))) {
    issues.push("No .github/ (Copilot) detected");
    return issues;
  }
  const dest = path.join(cwd, ".github", "copilot-instructions.md");
  if (!(await pathExists(dest))) {
    issues.push("Missing .github/copilot-instructions.md");
    return issues;
  }
  const content = await readText(dest);
  if (!content.includes(COPILOT_START) || !content.includes(COPILOT_END)) {
    issues.push("copilot-instructions.md missing rn-agentic-dev markers");
  }
  return issues;
}

async function checkWindsurf(cwd: string, skillNames: string[]): Promise<string[]> {
  const issues: string[] = [];
  if (!(await detectWindsurfProject(cwd))) {
    issues.push("No .windsurf/ detected");
    return issues;
  }
  for (const name of skillNames) {
    const dest = path.join(cwd, ".windsurf", "rules", `${name}.md`);
    if (!(await pathExists(dest))) issues.push(`Missing Windsurf rule: ${name}.md`);
  }
  return issues;
}

function printCheck(check: DoctorCheckResult): void {
  const line = `${check.title}: ${check.detail}`;
  if (check.status === "pass") p.log.success(line);
  else if (check.status === "skip") p.log.info(`[skip] ${line}`);
  else if (check.status === "warn") {
    p.log.warn(line);
    if (check.fix) p.log.message(`  Fix: ${check.fix}`);
  } else {
    p.log.error(line);
    if (check.fix) p.log.message(`  Fix: ${check.fix}`);
  }
}

export async function doctorCommand(
  options: DoctorOptions = {},
  deps: DoctorCheckDeps & { connectionDeps?: ConnectionTestDeps } = {},
): Promise<DoctorCheckResult[]> {
  const cwd = options.cwd ?? process.cwd();
  p.intro("rn-agentic-dev doctor");

  const envChecks = await runDoctorChecks(cwd, deps);
  p.log.step("Environment & tooling");
  for (const c of envChecks) printCheck(c);

  const skills = await loadSkills();
  const skillNames = skills.map((s) => s.name);
  p.log.info(`Packaged skills: ${skillNames.length}`);

  if (!options.skipAdapters) {
    p.log.step("Installed adapters (informational)");
    const adapterChecks: { name: string; issues: string[] }[] = [
      { name: "claude", issues: await checkClaude(cwd, skillNames) },
      { name: "cursor", issues: await checkCursor(cwd, skillNames) },
      { name: "agents-md", issues: await checkAgentsMd(cwd) },
      { name: "copilot", issues: await checkCopilot(cwd) },
      { name: "windsurf", issues: await checkWindsurf(cwd, skillNames) },
    ];

    for (const check of adapterChecks) {
      if (check.issues.length === 0) {
        p.log.success(`${check.name}: ok`);
      } else {
        p.log.warn(`${check.name}:`);
        for (const issue of check.issues) p.log.message(`  – ${issue}`);
        p.log.message(`  Fix: rn-agentic-dev update -a ${check.name}   or   rn-agentic-dev init`);
      }
    }

    p.note(adapters.map((a) => a.name).join(", "), "Available adapters");
  }

  let connectionFailed = false;
  if (options.connections) {
    p.log.step("Live connections (design source + Jira)");
    const env = await loadProjectEnv(cwd, deps.env ?? process.env);
    let figmaFileUrl = env.FIGMA_FILE_URL || env.STITCH_FILE_URL;
    let jiraSiteUrl = env.JIRA_SITE_URL;
    let jiraProjectKey = env.JIRA_PROJECT_KEY;
    let designSource: "figma" | "stitch" | "screenshot" | undefined =
      env.DESIGN_SOURCE === "stitch"
        ? "stitch"
        : env.DESIGN_SOURCE === "screenshot"
          ? "screenshot"
          : env.DESIGN_SOURCE === "figma"
            ? "figma"
            : undefined;
    const cfgPath = path.join(cwd, ".agent", "config.json");
    if (await pathExists(cfgPath)) {
      try {
        const cfg = JSON.parse(await readText(cfgPath)) as {
          figma?: { fileUrl?: string };
          jira?: { siteUrl?: string; projectKey?: string };
          designSource?: "figma" | "stitch" | "screenshot";
        };
        figmaFileUrl = figmaFileUrl || cfg.figma?.fileUrl;
        jiraSiteUrl = jiraSiteUrl || cfg.jira?.siteUrl;
        jiraProjectKey = jiraProjectKey || cfg.jira?.projectKey;
        designSource = designSource ?? cfg.designSource;
      } catch {
        /* ignore */
      }
    }
    const checks = await runConnectionTests(
      { figmaFileUrl, jiraSiteUrl, jiraProjectKey, designSource },
      { ...deps.connectionDeps, env },
    );
    for (const c of checks) {
      printCheck({
        id: c.id,
        title: c.title,
        status: c.status === "skip" ? "skip" : c.status === "pass" ? "pass" : "fail",
        detail: c.detail,
        fix: c.fix,
      });
    }
    connectionFailed = connectionsHaveFailures(checks);
  }

  const failed = doctorHasFailures(envChecks) || connectionFailed;
  const warned = envChecks.some((c) => c.status === "warn");
  if (failed) {
    p.outro("Doctor found failures — fix the items above, then re-run.");
    process.exitCode = 1;
  } else if (warned) {
    p.outro("Doctor passed with warnings — optional tooling may be missing.");
  } else {
    p.outro("All environment checks passed.");
  }

  return envChecks;
}
