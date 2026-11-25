import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  coverageCommand,
  parseAcceptanceCriteriaIds,
  parseAcRefsFromFlow,
  runCoverage,
} from "./coverage.js";

describe("coverage", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-cov-"));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("parses AC ids from spec", () => {
    const ids = parseAcceptanceCriteriaIds(`
## Acceptance criteria
- AC-1 [Login]: Login works
- AC-2 [Login]: Shows error
## Other
AC-99 mentioned
`);
    expect(ids).toEqual(["AC-1", "AC-2"]);
  });

  it("parses AC refs from maestro yaml", () => {
    expect(parseAcRefsFromFlow("# AC-3\n- tapOn: { id: x }\n")).toContain("AC-3");
  });

  it("fails when an AC has no flow", async () => {
    const feat = path.join(tmp, "docs", "features", "login");
    await mkdir(feat, { recursive: true });
    await writeFile(
      path.join(feat, "spec.md"),
      `# Login\n## Acceptance criteria\n- AC-1 [Login]: ok\n- AC-2 [Login]: err\n## Open items\n(none)\n`,
      "utf8",
    );
    await mkdir(path.join(tmp, "maestro", "flows", "login"), { recursive: true });
    await writeFile(
      path.join(tmp, "maestro", "flows", "login", "happy.yaml"),
      "# AC-1\n- launchApp\n",
      "utf8",
    );

    const result = await runCoverage({ cwd: tmp, slug: "login" });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["AC-2"]);
    expect(result.acceptanceCriteria[0]?.screen).toBe("Login");
    expect(await coverageCommand({ cwd: tmp, slug: "login" })).toBe(1);
  });

  it("fails when ACs lack screen tags", async () => {
    const feat = path.join(tmp, "docs", "features", "login");
    await mkdir(feat, { recursive: true });
    await writeFile(
      path.join(feat, "spec.md"),
      `## Acceptance criteria\n- AC-1: untagged\n## Open items\n(none)\n`,
      "utf8",
    );
    await mkdir(path.join(tmp, "maestro"), { recursive: true });
    await writeFile(path.join(tmp, "maestro", "a.yaml"), "# AC-1\n", "utf8");
    const result = await runCoverage({ cwd: tmp, slug: "login" });
    expect(result.untagged).toEqual(["AC-1"]);
    expect(result.ok).toBe(false);
  });

  it("passes when all ACs are screen-tagged and covered", async () => {
    const feat = path.join(tmp, "docs", "features", "login");
    await mkdir(feat, { recursive: true });
    await writeFile(
      path.join(feat, "spec.md"),
      `## Acceptance criteria\n- AC-1 [Login]: a\n- AC-2 [Login]: b\n## Open items\n(none)\n`,
      "utf8",
    );
    await mkdir(path.join(tmp, "maestro"), { recursive: true });
    await writeFile(path.join(tmp, "maestro", "a.yaml"), "# AC-1\n# AC-2\n", "utf8");
    expect((await runCoverage({ cwd: tmp, slug: "login" })).ok).toBe(true);
    expect(await coverageCommand({ cwd: tmp, slug: "login" })).toBe(0);
  });
});
