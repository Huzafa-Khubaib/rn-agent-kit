import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { verifyCommand } from "./verify.js";

describe("verifyCommand", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-verify-"));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("fails when coverage slug missing and not skipped", async () => {
    const code = await verifyCommand({
      cwd: tmp,
      skipTsc: true,
      skipEslint: true,
      skipTokens: true,
      skipJest: true,
    });
    expect(code).toBe(1);
  });

  it("passes with skips and covered slug", async () => {
    const feat = path.join(tmp, "docs", "features", "x");
    await mkdir(feat, { recursive: true });
    await writeFile(
      path.join(feat, "spec.md"),
      `## Acceptance criteria\n- AC-1 [Login]: a\n## Open items\n(none)\n`,
      "utf8",
    );
    await mkdir(path.join(tmp, "maestro"), { recursive: true });
    await writeFile(path.join(tmp, "maestro", "f.yaml"), "# AC-1\n", "utf8");

    const code = await verifyCommand({
      cwd: tmp,
      slug: "x",
      skipTsc: true,
      skipEslint: true,
      skipTokens: true,
      skipJest: true,
    });
    expect(code).toBe(0);
  });
});
