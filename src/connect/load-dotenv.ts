import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathExists } from "../utils/fs.js";

/**
 * Parse a simple KEY=VALUE .env file (no expansion).
 * Does not mutate process.env unless `apply` is true.
 */
export function parseDotEnv(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Load project `.env` into a copy of env (process.env wins over file). */
export async function loadProjectEnv(
  cwd: string,
  base: NodeJS.ProcessEnv = process.env,
): Promise<NodeJS.ProcessEnv> {
  const envPath = path.join(cwd, ".env");
  if (!(await pathExists(envPath))) return { ...base };
  try {
    const parsed = parseDotEnv(await readFile(envPath, "utf8"));
    return { ...parsed, ...base };
  } catch {
    return { ...base };
  }
}
