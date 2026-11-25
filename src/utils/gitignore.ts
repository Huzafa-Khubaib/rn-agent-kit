import { readFile } from "node:fs/promises";
import { pathExists, writeText } from "./fs.js";

const ENV_ENTRIES = [".env", ".env.local", ".env.*.local"];

/** Ensure .env patterns exist in .gitignore (merge, never strip user entries). */
export async function ensureEnvGitignore(
  projectDir: string,
  gitignorePath = `${projectDir.replace(/\/$/, "")}/.gitignore`,
): Promise<{ updated: boolean }> {
  const path = gitignorePath;
  let content = "";
  if (await pathExists(path)) {
    content = await readFile(path, "utf8");
  }
  const lines = content.split(/\r?\n/);
  const missing = ENV_ENTRIES.filter(
    (entry) => !lines.some((l) => l.trim() === entry || l.trim() === `/${entry}`),
  );
  if (missing.length === 0) return { updated: false };
  const block = ["", "# rn-agentic-dev — secrets", ...missing, ""].join("\n");
  const next = content.endsWith("\n") || content.length === 0 ? `${content}${block.trimStart()}` : `${content}\n${block.trimStart()}`;
  await writeText(path, next.endsWith("\n") ? next : `${next}\n`);
  return { updated: true };
}
