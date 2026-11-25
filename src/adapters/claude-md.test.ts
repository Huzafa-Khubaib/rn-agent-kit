import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CLAUDE_END, CLAUDE_START, installClaudeMdRouter, mergeClaudeMd } from "./claude-md.js";
import type { Skill } from "./types.js";

const router: Skill = {
  name: "rn-agent-router",
  content:
    '---\ndescription: ALWAYS run first\nglobs: "**/*"\nalwaysApply: true\n---\n\n# Router\n\nDetect intent.\n',
  description: "ALWAYS run first",
  globs: ["**/*"],
  alwaysApply: true,
};

const other: Skill = {
  name: "rn-architecture",
  content: "---\ndescription: Arch\nglobs: \"**/*\"\nalwaysApply: false\n---\n\n# Arch\n",
  description: "Arch",
  globs: ["**/*"],
  alwaysApply: false,
};

describe("claude-md always-on router", () => {
  let tmp: string;

  afterEach(async () => {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it("writes only the router body inside markers", () => {
    const out = mergeClaudeMd("# User notes\n", [router, other]);
    expect(out).toContain("# User notes");
    expect(out).toContain(CLAUDE_START);
    expect(out).toContain(CLAUDE_END);
    expect(out).toContain("Detect intent.");
    expect(out).not.toContain("# Arch");
  });

  it("install is idempotent and preserves user text", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-claude-md-"));
    await writeFile(path.join(tmp, "CLAUDE.md"), "# Keep me\n\n", "utf8");
    await installClaudeMdRouter([router], tmp);
    await installClaudeMdRouter([router], tmp);
    const content = await readFile(path.join(tmp, "CLAUDE.md"), "utf8");
    expect(content).toContain("# Keep me");
    expect(content.split(CLAUDE_START).length - 1).toBe(1);
  });
});
