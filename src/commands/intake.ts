import * as p from "@clack/prompts";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { AgentConfigSchema, FigmaUrlSchema, parseAgentConfig } from "../schema/agent-config.js";
import { pathExists, writeText } from "../utils/fs.js";

export interface IntakeOptions {
  cwd?: string;
  figmaUrl?: string;
  prdPath?: string;
  yes?: boolean;
}

function cancelIfNeeded(value: unknown): value is symbol {
  if (p.isCancel(value)) {
    p.cancel("Cancelled.");
    process.exitCode = 1;
    return true;
  }
  return false;
}

async function readExistingConfig(cwd: string): Promise<Record<string, unknown>> {
  const file = path.join(cwd, ".agent", "config.json");
  if (!(await pathExists(file))) return { version: 1 };
  try {
    return JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  } catch {
    return { version: 1 };
  }
}

/** Interactively (or via flags) capture Figma URL + PRD path into .agent/config.json (no secrets). */
export async function intakeCommand(options: IntakeOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  p.intro("rn-agentic-dev intake");

  let figmaUrl = options.figmaUrl;
  let prdPath = options.prdPath;

  if (!figmaUrl && !options.yes) {
    const ans = await p.text({
      message: "Figma or Stitch file URL",
      placeholder: "https://www.figma.com/design/…",
      validate: (v) => {
        const r = FigmaUrlSchema.safeParse(v);
        return r.success ? undefined : r.error.issues[0]?.message ?? "Invalid URL";
      },
    });
    if (cancelIfNeeded(ans)) return;
    figmaUrl = String(ans);
  }

  if (!prdPath && !options.yes) {
    const ans = await p.text({
      message: "PRD path (relative to project)",
      placeholder: "docs/prd.md",
      initialValue: "docs/prd.md",
    });
    if (cancelIfNeeded(ans)) return;
    prdPath = String(ans);
  }

  if (!figmaUrl || !prdPath) {
    p.cancel("Need --figma-url and --prd-path (or run interactively without --yes).");
    process.exitCode = 1;
    return;
  }

  const urlParsed = FigmaUrlSchema.safeParse(figmaUrl);
  if (!urlParsed.success) {
    p.cancel(urlParsed.error.issues[0]?.message ?? "Invalid Figma/Stitch URL");
    process.exitCode = 1;
    return;
  }

  const absPrd = path.resolve(cwd, prdPath);
  if (!(await pathExists(absPrd))) {
    p.log.warn(`PRD file not found yet: ${prdPath} — saving path anyway.`);
  } else {
    p.log.success(`PRD found: ${prdPath}`);
  }

  // Lightweight access check: URL shape only (live Figma needs FIGMA_TOKEN — doctor/tokens).
  p.log.info("Figma URL shape OK. For live access set FIGMA_TOKEN / FIGMA_ACCESS_TOKEN.");

  const existing = await readExistingConfig(cwd);
  const next = {
    ...existing,
    version: 1,
    figma: {
      ...((existing.figma as object) ?? {}),
      fileUrl: urlParsed.data,
    },
    prdPath,
  };

  const validated = AgentConfigSchema.safeParse(next);
  if (!validated.success) {
    p.cancel(`Invalid config: ${validated.error.message}`);
    process.exitCode = 1;
    return;
  }

  const outPath = path.join(cwd, ".agent", "config.json");
  await writeText(outPath, `${JSON.stringify(validated.data, null, 2)}\n`);
  p.log.success(`Wrote ${path.relative(cwd, outPath)} (non-secrets only)`);
  p.outro("Next: feature-grill → plan-review → jira-sync");
}

export const IntakeCliSchema = z.object({
  figmaUrl: z.string().optional(),
  prdPath: z.string().optional(),
  yes: z.boolean().optional(),
  cwd: z.string().optional(),
});

export async function mergeIntakeIntoConfig(
  cwd: string,
  patch: { figmaUrl?: string; prdPath?: string },
): Promise<ReturnType<typeof parseAgentConfig>> {
  const existing = await readExistingConfig(cwd);
  const next = {
    ...existing,
    version: 1,
    ...(patch.figmaUrl
      ? { figma: { ...((existing.figma as object) ?? {}), fileUrl: patch.figmaUrl } }
      : {}),
    ...(patch.prdPath ? { prdPath: patch.prdPath } : {}),
  };
  return parseAgentConfig(next);
}
