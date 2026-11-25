import path from "node:path";
import type { Adapter, Skill } from "./types.js";
import { pathExists, readText, writeText } from "../utils/fs.js";
import { skillBody } from "../utils/skills.js";

export const START_MARKER = "<!-- rn-agentic-dev:start -->";
export const END_MARKER = "<!-- rn-agentic-dev:end -->";

function buildBlock(skills: Skill[]): string {
  // alwaysApply skills are sorted first by loadSkills — keep router at the top
  const sections = skills.map((skill) => {
    const title = skill.alwaysApply
      ? `## ${skill.name} (always-on)`
      : `## ${skill.name}`;
    return [title, "", skillBody(skill)].join("\n");
  });

  return [
    START_MARKER,
    "",
    "# rn-agentic-dev skills",
    "",
    "_Managed by `rn-agentic-dev`. Do not edit inside these markers. Always-on skills are listed first._",
    "",
    ...sections.flatMap((s) => [s, ""]),
    END_MARKER,
  ].join("\n");
}

/**
 * Merge our managed block into AGENTS.md without touching user content
 * outside the markers. Idempotent — re-running replaces only our block.
 */
export function mergeAgentsMd(existing: string, skills: Skill[]): string {
  const block = buildBlock(skills);
  const startIdx = existing.indexOf(START_MARKER);
  const endIdx = existing.indexOf(END_MARKER);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existing.slice(0, startIdx).replace(/\s*$/, "\n\n");
    const after = existing.slice(endIdx + END_MARKER.length).replace(/^\s*/, "\n");
    return `${before}${block}${after}`.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  }

  if (startIdx !== -1 || endIdx !== -1) {
    // Partial/corrupt markers — append a fresh block rather than destroy user text
    const trimmed = existing.replace(/\s*$/, "\n\n");
    return `${trimmed}${block}\n`;
  }

  if (!existing.trim()) {
    return `${block}\n`;
  }

  return `${existing.replace(/\s*$/, "\n\n")}${block}\n`;
}

export const agentsMdAdapter: Adapter = {
  name: "agents-md",

  async detect(cwd: string): Promise<boolean> {
    return pathExists(path.join(cwd, "AGENTS.md"));
  },

  async install(skills: Skill[], cwd: string): Promise<void> {
    const dest = path.join(cwd, "AGENTS.md");
    const existing = (await pathExists(dest)) ? await readText(dest) : "";
    const next = mergeAgentsMd(existing, skills);
    await writeText(dest, next);
  },
};

export async function detectAgentsMd(cwd: string): Promise<boolean> {
  return agentsMdAdapter.detect(cwd);
}
