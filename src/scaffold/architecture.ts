import { cp, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { ensureDir, pathExists, readText, writeText } from "../utils/fs.js";
import { getTemplatesRoot } from "../utils/templates.js";

const FEATURE_DIRS = [
  "src/features/example/components",
  "src/features/example/hooks",
  "src/features/example/services",
  "src/features/example/store",
  "src/features/example/types",
  "src/shared/components",
  "src/shared/hooks",
  "src/shared/lib",
  "src/shared/theme",
  "src/shared/types",
  "src/config",
];

async function copyIfMissing(from: string, to: string): Promise<boolean> {
  if (await pathExists(to)) return false;
  await ensureDir(path.dirname(to));
  await cp(from, to, { recursive: true });
  return true;
}

async function mergeTsconfigPaths(projectDir: string): Promise<void> {
  const tsconfigPath = path.join(projectDir, "tsconfig.json");
  if (!(await pathExists(tsconfigPath))) {
    const template = path.join(getTemplatesRoot(), "scaffold", "tsconfig.json");
    if (await pathExists(template)) {
      await cp(template, tsconfigPath);
    }
    return;
  }

  try {
    const raw = await readText(tsconfigPath);
    const json = JSON.parse(raw) as {
      compilerOptions?: Record<string, unknown>;
    };
    json.compilerOptions ??= {};
    const existing = (json.compilerOptions.paths as Record<string, string[]> | undefined) ?? {};
    json.compilerOptions.baseUrl = json.compilerOptions.baseUrl ?? ".";
    json.compilerOptions.paths = {
      ...existing,
      "@/*": ["./src/*"],
      "@/features/*": ["./src/features/*"],
      "@/shared/*": ["./src/shared/*"],
    };
    await writeText(tsconfigPath, `${JSON.stringify(json, null, 2)}\n`);
  } catch {
    // leave existing tsconfig alone if unparsable
  }
}

async function mergePackageScripts(projectDir: string): Promise<void> {
  const pkgPath = path.join(projectDir, "package.json");
  if (!(await pathExists(pkgPath))) return;

  try {
    const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    pkg.scripts = {
      ...pkg.scripts,
      lint: pkg.scripts?.lint ?? "eslint .",
      format: pkg.scripts?.format ?? "prettier --write .",
      test: pkg.scripts?.test ?? "jest",
      prepare: pkg.scripts?.prepare ?? "husky",
    };
    await writeText(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  } catch {
    // ignore
  }
}

async function copyScaffoldConfigs(projectDir: string): Promise<string[]> {
  const written: string[] = [];
  const scaffoldRoot = path.join(getTemplatesRoot(), "scaffold");
  if (!(await pathExists(scaffoldRoot))) return written;

  const files = [
    "eslint.config.js",
    ".prettierrc",
    ".prettierignore",
    "jest.config.cjs",
    "commitlint.config.cjs",
  ];

  for (const file of files) {
    const from = path.join(scaffoldRoot, file);
    const to = path.join(projectDir, file);
    if (await pathExists(from)) {
      const did = await copyIfMissing(from, to);
      if (did) written.push(file);
    }
  }

  const huskySrc = path.join(scaffoldRoot, ".husky");
  if (await pathExists(huskySrc)) {
    const entries = await readdir(huskySrc);
    for (const entry of entries) {
      const from = path.join(huskySrc, entry);
      const info = await stat(from);
      if (!info.isFile()) continue;
      const to = path.join(projectDir, ".husky", entry);
      const did = await copyIfMissing(from, to);
      if (did) written.push(`.husky/${entry}`);
    }
  }

  return written;
}

export interface ApplyArchitectureResult {
  dirsCreated: string[];
  configsWritten: string[];
}

/** Apply feature-based architecture folders + tooling configs from templates/. */
export async function applyArchitectureScaffold(
  projectDir: string,
): Promise<ApplyArchitectureResult> {
  const dirsCreated: string[] = [];

  for (const rel of FEATURE_DIRS) {
    const dir = path.join(projectDir, rel);
    if (!(await pathExists(dir))) {
      await ensureDir(dir);
      await writeText(path.join(dir, ".gitkeep"), "");
      dirsCreated.push(rel);
    }
  }

  const exampleIndex = path.join(projectDir, "src/features/example/index.ts");
  if (!(await pathExists(exampleIndex))) {
    await writeText(
      exampleIndex,
      `/** Public API for the example feature — replace with real exports. */\nexport {};\n`,
    );
  }

  const configsWritten = await copyScaffoldConfigs(projectDir);
  await mergeTsconfigPaths(projectDir);
  await mergePackageScripts(projectDir);

  return { dirsCreated, configsWritten };
}
