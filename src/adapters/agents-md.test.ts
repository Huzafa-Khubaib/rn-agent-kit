import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentsMdAdapter, END_MARKER, mergeAgentsMd, START_MARKER } from "./agents-md.js";
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
    name: "maestro-e2e",
    content:
      '---\ndescription: Maestro e2e\nglobs: ".maestro/**"\nalwaysApply: false\n---\n\n# Maestro\n\nWrite YAML flows.\n',
    description: "Maestro e2e",
    globs: [".maestro/**"],
    alwaysApply: false,
  },
];

describe("agentsMdAdapter", () => {
  let tmp: string;

  afterEach(async () => {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it("detects existing AGENTS.md", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-agentic-dev-agents-"));
    expect(await agentsMdAdapter.detect(tmp)).toBe(false);
    await writeFile(path.join(tmp, "AGENTS.md"), "# Hello\n", "utf8");
    expect(await agentsMdAdapter.detect(tmp)).toBe(true);
  });

  it("creates AGENTS.md with markers when missing", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-agentic-dev-agents-"));
    await agentsMdAdapter.install(sampleSkills, tmp);

    const content = await readFile(path.join(tmp, "AGENTS.md"), "utf8");
    expect(content).toContain(START_MARKER);
    expect(content).toContain(END_MARKER);
    expect(content).toContain("## rn-architecture");
    expect(content).toContain("Use feature folders.");
    expect(content).toContain("## maestro-e2e");
  });

  it("preserves user content outside markers on merge", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-agentic-dev-agents-"));
    const existing = [
      "# My Project Agents",
      "",
      "User intro that must stay.",
      "",
      START_MARKER,
      "",
      "old managed content",
      "",
      END_MARKER,
      "",
      "## User appendix",
      "",
      "Keep this too.",
      "",
    ].join("\n");

    await writeFile(path.join(tmp, "AGENTS.md"), existing, "utf8");
    await agentsMdAdapter.install(sampleSkills, tmp);

    const content = await readFile(path.join(tmp, "AGENTS.md"), "utf8");
    expect(content).toContain("User intro that must stay.");
    expect(content).toContain("## User appendix");
    expect(content).toContain("Keep this too.");
    expect(content).not.toContain("old managed content");
    expect(content).toContain("## rn-architecture");
    expect(content.indexOf("User intro")).toBeLessThan(content.indexOf(START_MARKER));
    expect(content.indexOf(END_MARKER)).toBeLessThan(content.indexOf("## User appendix"));
  });

  it("is idempotent — second install does not duplicate the block", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-agentic-dev-agents-"));
    await agentsMdAdapter.install(sampleSkills, tmp);
    await agentsMdAdapter.install(sampleSkills, tmp);

    const content = await readFile(path.join(tmp, "AGENTS.md"), "utf8");
    const starts = content.split(START_MARKER).length - 1;
    const ends = content.split(END_MARKER).length - 1;
    expect(starts).toBe(1);
    expect(ends).toBe(1);
  });

  it("mergeAgentsMd appends when no markers exist", () => {
    const result = mergeAgentsMd("# Existing\n\nNotes.\n", sampleSkills);
    expect(result).toContain("# Existing");
    expect(result).toContain("Notes.");
    expect(result).toContain(START_MARKER);
  });
});
