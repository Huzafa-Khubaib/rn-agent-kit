import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Resolve packaged templates/ (src tests → ../../templates, dist → ../templates). */
export function getTemplatesRoot(): string {
  const candidates = [
    path.resolve(__dirname, "../../templates"),
    path.resolve(__dirname, "../templates"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0]!;
}
