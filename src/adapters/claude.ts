import path from "node:path";
import type { Adapter, Skill } from "./types.js";
import { ensureDir, pathExists, writeText } from "../utils/fs.js";
import { installClaudeMdRouter } from "./claude-md.js";

export const claudeAdapter: Adapter = {
  name: "claude",

  async detect(cwd: string): Promise<boolean> {
    return (
      (await pathExists(path.join(cwd, ".claude"))) ||
      (await pathExists(path.join(cwd, "CLAUDE.md")))
    );
  },

  async install(skills: Skill[], cwd: string): Promise<void> {
    const root = path.join(cwd, ".claude", "skills");
    await ensureDir(root);

    for (const skill of skills) {
      const dest = path.join(root, skill.name, "SKILL.md");
      await writeText(dest, skill.content.endsWith("\n") ? skill.content : `${skill.content}\n`);
    }

    // Always-on router in CLAUDE.md (managed markers) — tiny context
    await installClaudeMdRouter(skills, cwd);
  },
};

export async function detectClaudeProject(cwd: string): Promise<boolean> {
  return claudeAdapter.detect(cwd);
}
