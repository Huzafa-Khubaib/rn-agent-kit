import path from "node:path";
import type { Adapter, Skill } from "./types.js";
import { ensureDir, pathExists, writeText } from "../utils/fs.js";
import { skillBody } from "../utils/skills.js";

function toWindsurfRule(skill: Skill): string {
  // Windsurf Cascade: trigger always_on keeps the router in every chat
  const front = skill.alwaysApply
    ? ["---", "trigger: always_on", "---", ""].join("\n")
    : "";
  return [
    front,
    `# ${skill.name}`,
    "",
    skill.description,
    "",
    skillBody(skill),
    "",
  ].join("\n");
}

export const windsurfAdapter: Adapter = {
  name: "windsurf",

  async detect(cwd: string): Promise<boolean> {
    return pathExists(path.join(cwd, ".windsurf"));
  },

  async install(skills: Skill[], cwd: string): Promise<void> {
    const root = path.join(cwd, ".windsurf", "rules");
    await ensureDir(root);

    for (const skill of skills) {
      const dest = path.join(root, `${skill.name}.md`);
      await writeText(dest, toWindsurfRule(skill));
    }
  },
};

export async function detectWindsurfProject(cwd: string): Promise<boolean> {
  return windsurfAdapter.detect(cwd);
}
