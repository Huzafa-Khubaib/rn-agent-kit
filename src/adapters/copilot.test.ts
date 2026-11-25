import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { COPILOT_END, COPILOT_START, copilotAdapter } from "./copilot.js";
import type { Skill } from "./types.js";

const skills: Skill[] = [
  {
    name: "expo-cli",
    content: '---\ndescription: Expo\nglobs: "**/*"\nalwaysApply: false\n---\n\n# Expo\n',
    description: "Expo",
    globs: ["**/*"],
    alwaysApply: false,
  },
];

describe("copilotAdapter", () => {
  let tmp: string;

  afterEach(async () => {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it("writes marker-managed .github/copilot-instructions.md", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-copilot-"));
    await mkdir(path.join(tmp, ".github"), { recursive: true });
    await writeFile(
      path.join(tmp, ".github", "copilot-instructions.md"),
      "# User notes\n\nKeep me.\n",
      "utf8",
    );

    await copilotAdapter.install(skills, tmp);
    const content = await readFile(path.join(tmp, ".github", "copilot-instructions.md"), "utf8");
    expect(content).toContain("Keep me.");
    expect(content).toContain(COPILOT_START);
    expect(content).toContain(COPILOT_END);
    expect(content).toContain("## expo-cli");

    await copilotAdapter.install(skills, tmp);
    const again = await readFile(path.join(tmp, ".github", "copilot-instructions.md"), "utf8");
    expect(again.split(COPILOT_START).length - 1).toBe(1);
  });
});
