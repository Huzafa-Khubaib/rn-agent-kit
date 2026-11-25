import * as p from "@clack/prompts";
import path from "node:path";
import { adapters, getAdapter, resolveToolName, type Adapter } from "../adapters/index.js";
import { installClaudeRouterHook } from "../adapters/claude-hooks.js";
import { loadSkills } from "../utils/skills.js";
import { pathExists, readText } from "../utils/fs.js";
import { START_MARKER } from "../adapters/agents-md.js";
import { COPILOT_START } from "../adapters/copilot.js";

export interface UpdateOptions {
  cwd?: string;
  adapters?: string[];
  yes?: boolean;
  /** Opt-in Claude Code UserPromptSubmit hook (default off). */
  claudeHook?: boolean;
}

/**
 * Detect adapters that already received an rn-agentic-dev install.
 * Update only refreshes skill payloads — never scaffolds, never deletes user files
 * outside marker-managed regions.
 */
export async function detectPreviouslyInstalled(cwd: string): Promise<Adapter[]> {
  const found: Adapter[] = [];

  if (await pathExists(path.join(cwd, ".claude", "skills"))) {
    const a = getAdapter("claude");
    if (a) found.push(a);
  }
  if (await pathExists(path.join(cwd, ".cursor", "rules"))) {
    const a = getAdapter("cursor");
    if (a) found.push(a);
  }
  if (await pathExists(path.join(cwd, "AGENTS.md"))) {
    const content = await readText(path.join(cwd, "AGENTS.md"));
    if (content.includes(START_MARKER)) {
      const a = getAdapter("agents-md");
      if (a) found.push(a);
    }
  }
  if (await pathExists(path.join(cwd, ".github", "copilot-instructions.md"))) {
    const content = await readText(path.join(cwd, ".github", "copilot-instructions.md"));
    if (content.includes(COPILOT_START)) {
      const a = getAdapter("copilot");
      if (a) found.push(a);
    }
  }
  if (await pathExists(path.join(cwd, ".windsurf", "rules"))) {
    const a = getAdapter("windsurf");
    if (a) found.push(a);
  }

  return found;
}

export async function updateCommand(options: UpdateOptions = {}): Promise<Adapter[]> {
  const cwd = options.cwd ?? process.cwd();
  p.intro("rn-agentic-dev update");
  p.log.info(
    "Refreshing installed skills only. User content outside rn-agentic-dev markers is preserved; project source is never modified.",
  );

  const skills = await loadSkills();
  if (skills.length === 0) {
    p.cancel("No skills found in package. Aborting.");
    process.exitCode = 1;
    return [];
  }

  let selected: Adapter[];

  if (options.adapters?.length) {
    const missing: string[] = [];
    selected = [];
    for (const name of options.adapters) {
      const adapter = getAdapter(resolveToolName(name) ?? name);
      if (!adapter) missing.push(name);
      else if (!selected.some((a) => a.name === adapter.name)) selected.push(adapter);
    }
    if (missing.length) {
      p.cancel(`Unknown adapter(s): ${missing.join(", ")}`);
      process.exitCode = 1;
      return [];
    }
  } else {
    selected = await detectPreviouslyInstalled(cwd);
    if (selected.length === 0) {
      if (options.yes) {
        selected = [...adapters];
        p.log.warn("No previous install detected — updating all adapters (--yes).");
      } else {
        p.cancel(
          "No previous install detected. Pass -a claude,cursor,… or run init first. Use --yes to update all adapters.",
        );
        process.exitCode = 1;
        return [];
      }
    } else {
      p.log.info(`Updating: ${selected.map((a) => a.name).join(", ")}`);
    }
  }

  const spinner = p.spinner();
  spinner.start("Updating skills…");

  for (const adapter of selected) {
    await adapter.install(skills, cwd);
  }

  if (options.claudeHook && selected.some((a) => a.name === "claude")) {
    await installClaudeRouterHook(cwd);
  }

  spinner.stop(
    `Skills refreshed (${selected.map((a) => a.name).join(", ")}). Marker-managed files only.`,
  );
  p.outro("Update complete.");
  return selected;
}
