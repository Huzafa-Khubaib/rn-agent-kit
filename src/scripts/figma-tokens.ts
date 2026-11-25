/**
 * figma-tokens — deterministic design-token pipeline.
 *
 *   build     design/source-snapshot.json -> design/tokens.json + src/shared/theme/tokens.ts + design/tokens-report.md
 *   generate  design/tokens.json          -> src/shared/theme/tokens.ts
 *   check     CI gate: fail if generated files are stale
 *   fetch     (optional) Figma REST API -> design/source-snapshot.json  (needs FIGMA_TOKEN)
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { fetchFigmaSnapshot } from "../tokens/fetch-figma";
import { diffIsEmpty } from "../tokens/diff";
import { DEFAULT_PATHS, runBuild, runCheck, runGenerate, type Paths } from "../tokens/pipeline";

const HELP = `Usage: figma-tokens <build|generate|check|fetch> [options]

  --snapshot <file>  default ${DEFAULT_PATHS.snapshot}
  --tokens <file>    default ${DEFAULT_PATHS.tokens}
  --theme <file>     default ${DEFAULT_PATHS.theme}
  --report <file>    default ${DEFAULT_PATHS.report}
  --strict           build: exit 1 if the report contains errors
  --url <figma-url>  fetch: Figma file URL (token from FIGMA_TOKEN)
`;

export async function runCli(argv: string[], cwd = process.cwd()): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      snapshot: { type: "string" },
      tokens: { type: "string" },
      theme: { type: "string" },
      report: { type: "string" },
      url: { type: "string" },
      strict: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const paths: Paths = {
    snapshot: values.snapshot ?? DEFAULT_PATHS.snapshot,
    tokens: values.tokens ?? DEFAULT_PATHS.tokens,
    theme: values.theme ?? DEFAULT_PATHS.theme,
    report: values.report ?? DEFAULT_PATHS.report,
  };
  const cmd = positionals[0];
  if (!cmd || values.help) {
    console.log(HELP);
    return cmd ? 0 : 1;
  }

  try {
    if (cmd === "build") {
      const r = await runBuild(cwd, paths);
      const errors = r.issues.filter((i) => i.severity === "error").length;
      const warnings = r.issues.filter((i) => i.severity === "warning").length;
      console.log(
        r.diff.initial
          ? `✔ Created ${r.diff.added.length} tokens.`
          : diffIsEmpty(r.diff)
            ? "✔ No token changes."
            : `✔ Tokens updated: +${r.diff.added.length} −${r.diff.removed.length} ~${r.diff.changed.length}`,
      );
      console.log(
        `  wrote: ${paths.tokens}${r.written.tokens ? "" : " (unchanged)"}, ${paths.theme}${r.written.theme ? "" : " (unchanged)"}, ${paths.report}`,
      );
      if (r.written.provider)
        console.log("  created ThemeProvider.tsx (not overwritten on later runs)");
      for (const w of r.warnings) console.warn(`  ! ${w}`);
      console.log(`  report: ${errors} error(s), ${warnings} warning(s) → see ${paths.report}`);
      return values.strict && errors > 0 ? 1 : 0;
    }
    if (cmd === "generate") {
      const r = await runGenerate(cwd, paths);
      console.log(r.changed ? `✔ Regenerated ${paths.theme}` : "✔ Already up to date.");
      for (const w of r.warnings) console.warn(`  ! ${w}`);
      return 0;
    }
    if (cmd === "check") {
      const r = await runCheck(cwd, paths);
      if (r.ok) console.log("✔ Design tokens are up to date.");
      else for (const p of r.problems) console.error(`✖ ${p}`);
      return r.ok ? 0 : 1;
    }
    if (cmd === "fetch") {
      const token = process.env.FIGMA_TOKEN;
      if (!values.url) throw new Error("--url <figma-file-url> is required");
      if (!token)
        throw new Error(
          "FIGMA_TOKEN is not set. Create a personal access token in Figma (scopes: file_content:read, file_variables:read).",
        );
      const { snapshot, notes } = await fetchFigmaSnapshot(values.url, token);
      const file = resolve(cwd, paths.snapshot);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
      console.log(`✔ Wrote ${paths.snapshot}`);
      for (const n of notes) console.warn(`  ! ${n}`);
      return 0;
    }
    console.error(`Unknown command "${cmd}".\n${HELP}`);
    return 1;
  } catch (e) {
    console.error(`✖ ${(e as Error).message}`);
    return 1;
  }
}

// Only auto-run when this file is the Node entrypoint (not when imported by the main CLI bundle).
const entryPath = process.argv[1] ?? "";
if (
  /figma-tokens\.(ts|js|mjs|cjs)$/.test(entryPath) &&
  import.meta.url === pathToFileURL(entryPath).href
) {
  runCli(process.argv.slice(2)).then((code) => process.exit(code));
}
