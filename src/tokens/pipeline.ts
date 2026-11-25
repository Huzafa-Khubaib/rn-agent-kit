import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { diffTokens, type TokenDiff } from "./diff";
import { generateFromTokensJson, THEME_PROVIDER_TSX } from "./generate-theme";
import { normalizeSnapshot } from "./normalize";
import { renderReport } from "./report";
import { parseSnapshot, type DesignSnapshot } from "./snapshot";
import { serializeTree } from "./tree";
import type { DtcgGroup, Issue } from "./types";

export interface Paths {
  snapshot: string;
  tokens: string;
  theme: string;
  report: string;
}

export const DEFAULT_PATHS: Paths = {
  snapshot: "design/source-snapshot.json",
  tokens: "design/tokens.json",
  theme: "src/shared/theme/tokens.ts",
  report: "design/tokens-report.md",
};

export interface BuildArtifacts {
  tokensJson: string;
  tokensTs: string;
  report: string;
  diff: TokenDiff;
  issues: Issue[];
  warnings: string[];
}

/** Pure: snapshot (+ previous tokens.json text) -> every output file's content. No IO, no clocks. */
export function buildArtifacts(
  snapshot: DesignSnapshot,
  previousTokensJson: string | null,
): BuildArtifacts {
  const { tree, issues } = normalizeSnapshot(snapshot);
  const tokensJson = serializeTree(tree);
  const { ts, warnings } = generateFromTokensJson(tokensJson);
  const prev = previousTokensJson ? (JSON.parse(previousTokensJson) as DtcgGroup) : null;
  const diff = diffTokens(prev, JSON.parse(tokensJson) as DtcgGroup);
  const report = renderReport({
    source: snapshot.source,
    fileUrl: snapshot.fileUrl,
    tree,
    issues,
    diff,
  });
  return { tokensJson, tokensTs: ts, report, diff, issues, warnings };
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

export async function writeIfChanged(path: string, content: string): Promise<boolean> {
  if ((await readOptional(path)) === content) return false;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  return true;
}

const abs = (cwd: string, p: string) => resolve(cwd, p);

export async function runBuild(cwd: string, paths: Paths) {
  const raw = await readOptional(abs(cwd, paths.snapshot));
  if (raw === null)
    throw new Error(
      `Snapshot not found: ${paths.snapshot}. Ask the agent to create it (see the figma-to-tokens skill) or run "fetch".`,
    );
  const snapshot = parseSnapshot(JSON.parse(raw));
  const previous = await readOptional(abs(cwd, paths.tokens));
  const out = buildArtifacts(snapshot, previous); // throws before any file is written
  const written = {
    tokens: await writeIfChanged(abs(cwd, paths.tokens), out.tokensJson),
    theme: await writeIfChanged(abs(cwd, paths.theme), out.tokensTs),
    report: await writeIfChanged(abs(cwd, paths.report), out.report),
    provider: false,
  };
  const providerPath = resolve(dirname(abs(cwd, paths.theme)), "ThemeProvider.tsx");
  if ((await readOptional(providerPath)) === null)
    written.provider = await writeIfChanged(providerPath, THEME_PROVIDER_TSX);
  return { ...out, written };
}

/** tokens.json -> tokens.ts only (use after editing tokens.json by hand). */
export async function runGenerate(cwd: string, paths: Paths) {
  const text = await readOptional(abs(cwd, paths.tokens));
  if (text === null) throw new Error(`${paths.tokens} not found. Run "build" first.`);
  const { ts, warnings } = generateFromTokensJson(text);
  const changed = await writeIfChanged(abs(cwd, paths.theme), ts);
  return { changed, warnings };
}

/** CI gate: generated files must match their sources. */
export async function runCheck(
  cwd: string,
  paths: Paths,
): Promise<{ ok: boolean; problems: string[] }> {
  const problems: string[] = [];
  const tokensText = await readOptional(abs(cwd, paths.tokens));
  if (tokensText === null) return { ok: false, problems: [`${paths.tokens} is missing.`] };

  const theme = await readOptional(abs(cwd, paths.theme));
  const expectedTs = generateFromTokensJson(tokensText).ts;
  if (theme === null) problems.push(`${paths.theme} is missing. Run: tokens generate`);
  else if (theme !== expectedTs)
    problems.push(`${paths.theme} is out of date with ${paths.tokens}. Run: tokens generate`);

  const snap = await readOptional(abs(cwd, paths.snapshot));
  if (snap !== null) {
    const expectedJson = buildArtifacts(parseSnapshot(JSON.parse(snap)), null).tokensJson;
    if (expectedJson !== tokensText)
      problems.push(`${paths.tokens} does not match ${paths.snapshot}. Run: tokens build`);
  }
  return { ok: problems.length === 0, problems };
}
