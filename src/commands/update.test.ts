import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  note: vi.fn(),
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
    error: vi.fn(),
    step: vi.fn(),
  },
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn(), message: vi.fn() })),
  isCancel: vi.fn(() => false),
}));

import { updateCommand } from "./update.js";
import { START_MARKER, END_MARKER } from "../adapters/agents-md.js";
import type { Skill } from "../adapters/types.js";
import * as skillsMod from "../utils/skills.js";

const sampleSkills: Skill[] = [
  {
    name: "rn-architecture",
    content:
      '---\ndescription: Architecture\nglobs: "**/*"\nalwaysApply: false\n---\n\n# Architecture v2\n',
    description: "Architecture",
    globs: ["**/*"],
    alwaysApply: false,
  },
];

describe("updateCommand", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-update-"));
    process.exitCode = undefined;
    vi.spyOn(skillsMod, "loadSkills").mockResolvedValue(sampleSkills);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("refreshes skills and preserves user content outside AGENTS.md markers", async () => {
    await writeFile(
      path.join(tmp, "AGENTS.md"),
      [
        "# User intro",
        "",
        "Keep me forever.",
        "",
        START_MARKER,
        "",
        "old block",
        "",
        END_MARKER,
        "",
        "## User appendix",
        "",
        "Also keep.",
        "",
      ].join("\n"),
      "utf8",
    );

    await updateCommand({ cwd: tmp, adapters: ["agents-md"] });

    const content = await readFile(path.join(tmp, "AGENTS.md"), "utf8");
    expect(content).toContain("Keep me forever.");
    expect(content).toContain("## User appendix");
    expect(content).toContain("Also keep.");
    expect(content).toContain("Architecture v2");
    expect(content).not.toContain("old block");
    expect(content.split(START_MARKER).length - 1).toBe(1);
  });

  it("exits when nothing installed and --yes not set", async () => {
    await updateCommand({ cwd: tmp });
    expect(process.exitCode).toBe(1);
  });
});
