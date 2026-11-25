import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { claudeAdapter } from "./claude.js";
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
  {
    name: "expo-cli",
    content:
      '---\ndescription: Expo CLI tips\nglobs: "**/*"\nalwaysApply: false\n---\n\n# Expo\n\nPrefer expo install.\n',
    description: "Expo CLI tips",
    globs: ["**/*"],
    alwaysApply: false,
  },
];

describe("claudeAdapter", () => {
  let tmp: string;

  afterEach(async () => {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it("detects Claude projects", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-agentic-dev-claude-"));
    expect(await claudeAdapter.detect(tmp)).toBe(false);
    await claudeAdapter.install(sampleSkills, tmp);
    expect(await claudeAdapter.detect(tmp)).toBe(true);
  });

  it("copies each skill to .claude/skills/<name>/SKILL.md and writes CLAUDE.md router", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-agentic-dev-claude-"));
    await claudeAdapter.install(sampleSkills, tmp);

    for (const skill of sampleSkills) {
      const dest = path.join(tmp, ".claude", "skills", skill.name, "SKILL.md");
      const content = await readFile(dest, "utf8");
      expect(content).toBe(skill.content);
    }
    const claudeMd = await readFile(path.join(tmp, "CLAUDE.md"), "utf8");
    expect(claudeMd).toContain("<!-- rn-agentic-dev:start -->");
    expect(claudeMd).toContain("rn-agentic-dev (always-on)");
  });

  it("is idempotent", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-agentic-dev-claude-"));
    await claudeAdapter.install(sampleSkills, tmp);
    await claudeAdapter.install(sampleSkills, tmp);

    const dest = path.join(tmp, ".claude", "skills", "rn-architecture", "SKILL.md");
    expect(await readFile(dest, "utf8")).toBe(sampleSkills[0]!.content);
  });
});
