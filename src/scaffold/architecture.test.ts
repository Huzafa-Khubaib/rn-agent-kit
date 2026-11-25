import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyArchitectureScaffold } from "./architecture.js";
import { pathExists } from "../utils/fs.js";

describe("applyArchitectureScaffold", () => {
  let tmp: string;

  afterEach(async () => {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it("creates feature folders and tooling configs without overwriting", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-arch-"));
    await writeFile(
      path.join(tmp, "package.json"),
      JSON.stringify({ name: "app", scripts: { start: "expo start" } }),
      "utf8",
    );
    await writeFile(
      path.join(tmp, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { strict: true } }),
      "utf8",
    );
    await writeFile(path.join(tmp, ".prettierrc"), '{ "semi": false }\n', "utf8");

    const result = await applyArchitectureScaffold(tmp);
    expect(result.dirsCreated.length).toBeGreaterThan(0);
    expect(await pathExists(path.join(tmp, "src/features/example/hooks"))).toBe(true);
    expect(await pathExists(path.join(tmp, "eslint.config.js"))).toBe(true);
    expect(await pathExists(path.join(tmp, ".husky/pre-commit"))).toBe(true);

    // do not overwrite user prettier
    expect(await readFile(path.join(tmp, ".prettierrc"), "utf8")).toContain('"semi": false');

    const tsconfig = JSON.parse(await readFile(path.join(tmp, "tsconfig.json"), "utf8")) as {
      compilerOptions: { paths: Record<string, string[]> };
    };
    expect(tsconfig.compilerOptions.paths["@/*"]).toEqual(["./src/*"]);

    const pkg = JSON.parse(await readFile(path.join(tmp, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.start).toBe("expo start");
    expect(pkg.scripts.lint).toBe("eslint .");
  });
});
