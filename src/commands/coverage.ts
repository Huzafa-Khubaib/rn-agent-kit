import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  parseScreenTaggedAcceptanceCriteria,
  type ScreenTaggedAc,
} from "../features/spec-parse.js";
import { pathExists } from "../utils/fs.js";

export interface CoverageOptions {
  cwd?: string;
  slug?: string;
  specPath?: string;
  maestroDir?: string;
  /** When true (default), warn if any AC lacks a screen tag. */
  requireScreenTags?: boolean;
}

export interface CoverageResult {
  ok: boolean;
  acIds: string[];
  covered: string[];
  missing: string[];
  flowsScanned: number;
  /** Parsed ACs including screen tags from feature-grill specs. */
  acceptanceCriteria: ScreenTaggedAc[];
  /** ACs that have no [Screen] / (Screen) tag. */
  untagged: string[];
}

const OptsSchema = z.object({
  cwd: z.string().optional(),
  slug: z.string().optional(),
  specPath: z.string().optional(),
  maestroDir: z.string().optional(),
  requireScreenTags: z.boolean().optional(),
});

export { parseAcceptanceCriteriaIds } from "../features/spec-parse.js";

/** Find AC references in Maestro YAML via comments/tags: `# AC-3` or `AC-3` in tags. */
export function parseAcRefsFromFlow(yaml: string): string[] {
  const ids = new Set<string>();
  const re = /#\s*AC-(\d+)\b|\bAC-(\d+)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(yaml))) {
    ids.add(`AC-${m[1] ?? m[2]}`);
  }
  return [...ids];
}

async function walkYamlFiles(dir: string): Promise<string[]> {
  if (!(await pathExists(dir))) return [];
  const out: string[] = [];
  const entries = await readdir(dir);
  for (const name of entries) {
    const full = path.join(dir, name);
    const st = await stat(full);
    if (st.isDirectory()) {
      out.push(...(await walkYamlFiles(full)));
    } else if (/\.ya?ml$/i.test(name)) {
      out.push(full);
    }
  }
  return out;
}

export async function runCoverage(options: CoverageOptions = {}): Promise<CoverageResult> {
  const opts = OptsSchema.parse(options);
  const cwd = opts.cwd ?? process.cwd();
  let specPath = opts.specPath;
  if (!specPath && opts.slug) {
    specPath = path.join(cwd, "docs", "features", opts.slug, "spec.md");
  }
  if (!specPath) {
    throw new Error("Pass --slug <feature> or --spec <path>");
  }
  const absSpec = path.resolve(cwd, specPath);
  if (!(await pathExists(absSpec))) {
    throw new Error(`Spec not found: ${specPath}`);
  }
  const spec = await readFile(absSpec, "utf8");
  const acceptanceCriteria = parseScreenTaggedAcceptanceCriteria(spec);
  const acIds = acceptanceCriteria.map((a) => a.id);
  if (acIds.length === 0) {
    throw new Error(`No AC-n ids found in ${specPath}`);
  }

  const untagged = acceptanceCriteria.filter((a) => !a.screen).map((a) => a.id);
  const requireScreenTags = opts.requireScreenTags !== false;

  const maestroDir = path.resolve(cwd, opts.maestroDir ?? "maestro");
  const files = await walkYamlFiles(maestroDir);
  const coveredSet = new Set<string>();
  for (const file of files) {
    const body = await readFile(file, "utf8");
    for (const id of parseAcRefsFromFlow(body)) coveredSet.add(id);
  }

  const covered = acIds.filter((id) => coveredSet.has(id));
  const missing = acIds.filter((id) => !coveredSet.has(id));
  const ok = missing.length === 0 && !(requireScreenTags && untagged.length > 0);

  return {
    ok,
    acIds,
    covered,
    missing,
    flowsScanned: files.length,
    acceptanceCriteria,
    untagged,
  };
}

/** CLI entry: exit 1 if any AC lacks a Maestro flow reference (or required screen tag). */
export async function coverageCommand(options: CoverageOptions = {}): Promise<number> {
  try {
    const result = await runCoverage(options);
    const tagged = result.acceptanceCriteria.filter((a) => a.screen).length;
    console.log(
      `coverage: ${result.covered.length}/${result.acIds.length} ACs in Maestro · ${tagged}/${result.acIds.length} screen-tagged · ${result.flowsScanned} flow file(s)`,
    );
    for (const ac of result.acceptanceCriteria) {
      const screen = ac.screen ? `[${ac.screen}]` : "[untagged]";
      const status = result.covered.includes(ac.id) ? "✔" : "✖";
      console.log(`  ${status} ${ac.id} ${screen}`);
    }
    if (result.untagged.length) {
      console.error(
        `✖ Untagged ACs (need AC-n [Screen]: …): ${result.untagged.join(", ")}`,
      );
    }
    if (result.missing.length) {
      console.error(`✖ Missing Maestro coverage for: ${result.missing.join(", ")}`);
      console.error("Add `# AC-n` comments (or AC-n tags) inside maestro/**/*.yaml flows.");
    }
    if (result.ok) {
      console.log("✔ All acceptance criteria are screen-tagged and covered by Maestro.");
      return 0;
    }
    return 1;
  } catch (e) {
    console.error(`✖ ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}
