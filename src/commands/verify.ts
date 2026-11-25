import { execa } from "execa";
import path from "node:path";
import { z } from "zod";
import { coverageCommand } from "./coverage.js";
import { pathExists } from "../utils/fs.js";

export interface VerifyOptions {
  cwd?: string;
  slug?: string;
  skipCoverage?: boolean;
  skipTokens?: boolean;
  skipJest?: boolean;
  skipEslint?: boolean;
  skipTsc?: boolean;
}

const OptsSchema = z.object({
  cwd: z.string().optional(),
  slug: z.string().optional(),
  skipCoverage: z.boolean().optional(),
  skipTokens: z.boolean().optional(),
  skipJest: z.boolean().optional(),
  skipEslint: z.boolean().optional(),
  skipTsc: z.boolean().optional(),
});

interface StepResult {
  id: string;
  ok: boolean;
  detail: string;
}

async function runStep(
  id: string,
  cwd: string,
  file: string,
  args: string[],
): Promise<StepResult> {
  try {
    const r = await execa(file, args, { cwd, reject: false, all: true });
    const ok = (r.exitCode ?? 1) === 0;
    const detail = (r.all || r.stderr || r.stdout || "").trim().slice(0, 500);
    return { id, ok, detail: detail || (ok ? "ok" : `exit ${r.exitCode}`) };
  } catch (e) {
    return { id, ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

/** Run tsc, eslint, tokens check, jest, coverage — non-zero if any fail. */
export async function verifyCommand(options: VerifyOptions = {}): Promise<number> {
  const opts = OptsSchema.parse(options);
  const cwd = opts.cwd ?? process.cwd();
  const steps: StepResult[] = [];

  if (!opts.skipTsc) {
    const tscBin = path.join(cwd, "node_modules", ".bin", "tsc");
    const hasLocal = await pathExists(tscBin);
    steps.push(
      await runStep("tsc", cwd, hasLocal ? tscBin : "npx", hasLocal ? ["--noEmit"] : ["tsc", "--noEmit"]),
    );
  }

  if (!opts.skipEslint) {
    const eslintBin = path.join(cwd, "node_modules", ".bin", "eslint");
    if (await pathExists(eslintBin)) {
      steps.push(await runStep("eslint", cwd, eslintBin, ["."]));
    } else {
      steps.push({
        id: "eslint",
        ok: true,
        detail: "skipped (eslint not installed in project)",
      });
    }
  }

  if (!opts.skipTokens) {
    const tokensJson = path.join(cwd, "design", "tokens.json");
    if (await pathExists(tokensJson)) {
      // Prefer kit CLI if available via npx from this package; otherwise skip with warn.
      steps.push(
        await runStep("tokens-check", cwd, "npx", ["rn-agentic-dev", "tokens", "check"]),
      );
    } else {
      steps.push({
        id: "tokens-check",
        ok: true,
        detail: "skipped (no design/tokens.json)",
      });
    }
  }

  if (!opts.skipJest) {
    const jestBin = path.join(cwd, "node_modules", ".bin", "jest");
    const pkg = path.join(cwd, "package.json");
    let hasTestScript = false;
    if (await pathExists(pkg)) {
      try {
        const raw = JSON.parse(await (await import("node:fs/promises")).readFile(pkg, "utf8")) as {
          scripts?: Record<string, string>;
        };
        hasTestScript = Boolean(raw.scripts?.test);
      } catch {
        /* ignore */
      }
    }
    if (await pathExists(jestBin)) {
      steps.push(await runStep("jest", cwd, jestBin, ["--passWithNoTests"]));
    } else if (hasTestScript) {
      steps.push(await runStep("jest", cwd, "npm", ["test", "--", "--passWithNoTests"]));
    } else {
      steps.push({ id: "jest", ok: true, detail: "skipped (no jest)" });
    }
  }

  if (!opts.skipCoverage) {
    if (!opts.slug) {
      steps.push({
        id: "coverage",
        ok: false,
        detail: "pass --slug <feature> for AC↔Maestro coverage (or --skip-coverage)",
      });
    } else {
      const code = await coverageCommand({ cwd, slug: opts.slug });
      steps.push({
        id: "coverage",
        ok: code === 0,
        detail: code === 0 ? "all ACs covered" : "missing AC coverage",
      });
    }
  }

  console.log("\nrn-agentic-dev verify\n");
  for (const s of steps) {
    console.log(`${s.ok ? "✔" : "✖"} ${s.id}: ${s.detail.split("\n")[0]}`);
  }
  const failed = steps.filter((s) => !s.ok);
  if (failed.length) {
    console.error(`\nverify FAILED (${failed.length} step(s)): ${failed.map((f) => f.id).join(", ")}`);
    return 1;
  }
  console.log("\nverify PASS");
  return 0;
}
