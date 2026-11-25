import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { windsurfAdapter } from "./windsurf.js";
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
    name: "rn-agent-router",
    content:
      '---\ndescription: ALWAYS run first\nglobs: "**/*"\nalwaysApply: true\n---\n\n# Router\n\nGuide the user.\n',
    description: "ALWAYS run first",
    globs: ["**/*"],
    alwaysApply: true,
  },
];

describe("windsurfAdapter", () => {
  let tmp: string;

  afterEach(async () => {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it("detects Windsurf projects", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-agentic-dev-windsurf-"));
    expect(await windsurfAdapter.detect(tmp)).toBe(false);
    await windsurfAdapter.install(sampleSkills, tmp);
    expect(await windsurfAdapter.detect(tmp)).toBe(true);
  });

  it("writes .windsurf/rules/<name>.md with always_on for router", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-agentic-dev-windsurf-"));
    await windsurfAdapter.install(sampleSkills, tmp);

    const dest = path.join(tmp, ".windsurf", "rules", "rn-architecture.md");
    const content = await readFile(dest, "utf8");
    expect(content).toContain("# rn-architecture");
    expect(content).toContain("Architecture guidance");
    expect(content).toContain("Use feature folders.");
    expect(content).not.toContain("trigger: always_on");

    const router = await readFile(
      path.join(tmp, ".windsurf", "rules", "rn-agent-router.md"),
      "utf8",
    );
    expect(router).toContain("trigger: always_on");
    expect(router).toContain("Guide the user.");
  });

  it("is idempotent", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-agentic-dev-windsurf-"));
    await windsurfAdapter.install(sampleSkills, tmp);
    const first = await readFile(
      path.join(tmp, ".windsurf", "rules", "rn-architecture.md"),
      "utf8",
    );
    await windsurfAdapter.install(sampleSkills, tmp);
    const second = await readFile(
      path.join(tmp, ".windsurf", "rules", "rn-architecture.md"),
      "utf8",
    );
    expect(second).toBe(first);
  });
});
