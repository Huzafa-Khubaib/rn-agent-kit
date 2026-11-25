import path from "node:path";
import type { Adapter, Skill } from "./types.js";
import { pathExists, readText, writeText } from "../utils/fs.js";
import { skillBody } from "../utils/skills.js";

export const COPILOT_START = "<!-- rn-agentic-dev:start -->";
export const COPILOT_END = "<!-- rn-agentic-dev:end -->";

function buildBlock(skills: Skill[]): string {
  const sections = skills.map((skill) => {
    const title = skill.alwaysApply
      ? `## ${skill.name} (always-on)`
      : `## ${skill.name}`;
    return [title, "", skillBody(skill)].join("\n");
  });
  return [
    COPILOT_START,
    "",
    "# rn-agentic-dev skills (GitHub Copilot)",
    "",
    "_Managed by `rn-agentic-dev`. Do not edit inside these markers. Always-on skills are listed first._",
    "",
    ...sections.flatMap((s) => [s, ""]),
    COPILOT_END,
  ].join("\n");
}

export function mergeCopilotInstructions(existing: string, skills: Skill[]): string {
  const block = buildBlock(skills);
  const startIdx = existing.indexOf(COPILOT_START);
  const endIdx = existing.indexOf(COPILOT_END);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existing.slice(0, startIdx).replace(/\s*$/, "\n\n");
    const after = existing.slice(endIdx + COPILOT_END.length).replace(/^\s*/, "\n");
    return `${before}${block}${after}`.replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  }

  if (!existing.trim()) return `${block}\n`;
  return `${existing.replace(/\s*$/, "\n\n")}${block}\n`;
}

export const copilotAdapter: Adapter = {
  name: "copilot",

  async detect(cwd: string): Promise<boolean> {
    return (
      (await pathExists(path.join(cwd, ".github", "copilot-instructions.md"))) ||
      (await pathExists(path.join(cwd, ".github")))
    );
  },

  async install(skills: Skill[], cwd: string): Promise<void> {
    const dest = path.join(cwd, ".github", "copilot-instructions.md");
    const existing = (await pathExists(dest)) ? await readText(dest) : "";
    await writeText(dest, mergeCopilotInstructions(existing, skills));
  },
};

export async function detectCopilotProject(cwd: string): Promise<boolean> {
  return copilotAdapter.detect(cwd);
}
