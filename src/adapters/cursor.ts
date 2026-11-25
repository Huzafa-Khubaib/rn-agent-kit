import path from "node:path";
import type { Adapter, Skill } from "./types.js";
import { ensureDir, pathExists, writeText } from "../utils/fs.js";
import { skillBody } from "../utils/skills.js";

function toMdc(skill: Skill): string {
  const globs =
    skill.globs.length === 1 ? skill.globs[0] : `[${skill.globs.map((g) => `"${g}"`).join(", ")}]`;

  return [
    "---",
    `description: ${skill.description}`,
    `globs: ${globs}`,
    `alwaysApply: ${skill.alwaysApply}`,
    "---",
    "",
    skillBody(skill),
    "",
  ].join("\n");
}

export const cursorAdapter: Adapter = {
  name: "cursor",

  async detect(cwd: string): Promise<boolean> {
    return (
      (await pathExists(path.join(cwd, ".cursor"))) ||
      (await pathExists(path.join(cwd, ".cursorrules")))
    );
  },

  async install(skills: Skill[], cwd: string): Promise<void> {
    const root = path.join(cwd, ".cursor", "rules");
    await ensureDir(root);

    for (const skill of skills) {
      const dest = path.join(root, `${skill.name}.mdc`);
      await writeText(dest, toMdc(skill));
    }
  },
};

export async function detectCursorProject(cwd: string): Promise<boolean> {
  return cursorAdapter.detect(cwd);
}
