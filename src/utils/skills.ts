import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Skill } from "../adapters/types.js";
import { pathExists } from "./fs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Resolve the packaged skills directory (works from src tests and bundled dist). */
export function getSkillsRoot(): string {
  // vitest (src/utils) -> ../../skills ; bundled dist/cli.js -> ../skills
  const candidates = [
    path.resolve(__dirname, "../../skills"),
    path.resolve(__dirname, "../skills"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0]!;
}

function parseFrontmatter(raw: string): {
  body: string;
  description: string;
  globs: string[];
  alwaysApply: boolean;
} {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return {
      body: raw.trim(),
      description: "rn-agentic-dev skill",
      globs: ["**/*.{ts,tsx,js,jsx}"],
      alwaysApply: false,
    };
  }

  const yaml = match[1] ?? "";
  const body = (match[2] ?? "").trim();
  const description = parseDescription(yaml);
  const globsLine = yaml.match(/^globs:\s*(.+)$/m)?.[1]?.trim();
  let globs: string[] = ["**/*.{ts,tsx,js,jsx}"];
  if (globsLine) {
    if (globsLine.startsWith("[") && globsLine.endsWith("]")) {
      globs = globsLine
        .slice(1, -1)
        .split(",")
        .map((g) => g.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else {
      globs = [globsLine.replace(/^["']|["']$/g, "")];
    }
  }
  const alwaysApply = /^alwaysApply:\s*true\s*$/m.test(yaml);

  return { body, description, globs, alwaysApply };
}

/** Supports `description: text`, quoted strings, and folded `>-` / `>` blocks. */
function parseDescription(yaml: string): string {
  const folded = yaml.match(/^description:\s*[>|]-?\r?\n((?:[ \t]+.+\r?\n?)+)/m);
  if (folded?.[1]) {
    return folded[1]
      .split(/\r?\n/)
      .map((line) => line.replace(/^[ \t]+/, "").trim())
      .filter(Boolean)
      .join(" ")
      .trim();
  }

  const single =
    yaml
      .match(/^description:\s*(.+)$/m)?.[1]
      ?.trim()
      .replace(/^["']|["']$/g, "") ?? "rn-agentic-dev skill";
  return single === ">" || single === ">-" || single === "|" || single === "|-"
    ? "rn-agentic-dev skill"
    : single;
}

export async function loadSkills(skillsRoot = getSkillsRoot()): Promise<Skill[]> {
  if (!(await pathExists(skillsRoot))) {
    return [];
  }

  const entries = await readdir(skillsRoot, { withFileTypes: true });
  const skills: Skill[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(skillsRoot, entry.name, "SKILL.md");
    if (!(await pathExists(skillPath))) continue;
    const raw = await readFile(skillPath, "utf8");
    const parsed = parseFrontmatter(raw);
    skills.push({
      name: entry.name,
      content: raw,
      description: parsed.description,
      globs: parsed.globs,
      alwaysApply: parsed.alwaysApply,
    });
  }

  // alwaysApply skills (e.g. rn-agent-router) first so adapters place them at the top
  return skills.sort((a, b) => {
    if (a.alwaysApply !== b.alwaysApply) return a.alwaysApply ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/** Body content without YAML frontmatter (for adapters that wrap their own). */
export function skillBody(skill: Skill): string {
  const match = skill.content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
  return (match?.[1] ?? skill.content).trim();
}
