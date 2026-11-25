import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cursorAdapter } from "./cursor.js";
import type { Skill } from "./types.js";

const sampleSkills: Skill[] = [
  {
    name: "rn-architecture",
    content:
      '---\ndescription: Architecture guidance\nglobs: "**/*.{ts,tsx}"\nalwaysApply: false\n---\n\n# Architecture\n\nUse feature folders.\n',
    description: "Architecture guidance",
    globs: ["**/*.{ts,tsx}"],
    alwaysApply: false,
  },
];

describe("cursorAdapter", () => {
  let tmp: string;

  afterEach(async () => {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it("detects Cursor projects", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-agentic-dev-cursor-"));
    expect(await cursorAdapter.detect(tmp)).toBe(false);
    await cursorAdapter.install(sampleSkills, tmp);
    expect(await cursorAdapter.detect(tmp)).toBe(true);
  });

  it("writes .cursor/rules/<name>.mdc with frontmatter", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-agentic-dev-cursor-"));
    await cursorAdapter.install(sampleSkills, tmp);

    const dest = path.join(tmp, ".cursor", "rules", "rn-architecture.mdc");
    const content = await readFile(dest, "utf8");

    expect(content).toContain("---");
    expect(content).toContain("description: Architecture guidance");
    expect(content).toContain("globs: **/*.{ts,tsx}");
    expect(content).toContain("alwaysApply: false");
    expect(content).toContain("# Architecture");
    expect(content).toContain("Use feature folders.");
    expect(content).not.toMatch(/^---\n[\s\S]*?---\n[\s\S]*?---/); // single frontmatter block
  });

  it("is idempotent", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-agentic-dev-cursor-"));
    await cursorAdapter.install(sampleSkills, tmp);
    const first = await readFile(path.join(tmp, ".cursor", "rules", "rn-architecture.mdc"), "utf8");
    await cursorAdapter.install(sampleSkills, tmp);
    const second = await readFile(
      path.join(tmp, ".cursor", "rules", "rn-architecture.mdc"),
      "utf8",
    );
    expect(second).toBe(first);
  });
});
