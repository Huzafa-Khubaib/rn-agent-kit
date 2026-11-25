import path from "node:path";
import type { Skill } from "./types.js";
import { pathExists, readText, writeText } from "../utils/fs.js";
import { skillBody } from "../utils/skills.js";

export const CLAUDE_START = "<!-- rn-agentic-dev:start -->";
export const CLAUDE_END = "<!-- rn-agentic-dev:end -->";

/** Tiny always-on block for Claude Code (router only — keep context small). */
function buildClaudeBlock(skills: Skill[]): string {
  const router = skills.find((s) => s.name === "rn-agent-router" || s.alwaysApply);
  const body = router
    ? skillBody(router)
    : "Run rn-agentic-dev workflows: feature-grill → plan-review → jira-sync → ticket-to-code. Bug → bug-triage.";

  // Keep CLAUDE.md tiny: router skill only (full skills live under .claude/skills/)
  return [
    CLAUDE_START,
    "",
    "# rn-agentic-dev (always-on)",
    "",
    "_Managed by `rn-agentic-dev`. Full skills: `.claude/skills/`. Do not edit inside markers._",
    "",
    body,
    "",
    CLAUDE_END,
  ].join("\n");
}

export function mergeClaudeMd(existing: string, skills: Skill[]): string {
  const block = buildClaudeBlock(skills);
  const startIdx = existing.indexOf(CLAUDE_START);
  const endIdx = existing.indexOf(CLAUDE_END);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existing.slice(0, startIdx).replace(/\s*$/, "\n\n");
    const after = existing.slice(endIdx + CLAUDE_END.length).replace(/^\s*/, "\n");
    return `${before}${block}${after}`.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  }

  if (!existing.trim()) return `${block}\n`;
  return `${existing.replace(/\s*$/, "\n\n")}${block}\n`;
}

/** Write/merge CLAUDE.md always-on router section. */
export async function installClaudeMdRouter(skills: Skill[], cwd: string): Promise<void> {
  const dest = path.join(cwd, "CLAUDE.md");
  const existing = (await pathExists(dest)) ? await readText(dest) : "";
  await writeText(dest, mergeClaudeMd(existing, skills));
}
