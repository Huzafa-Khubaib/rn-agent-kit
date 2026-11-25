import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@clack/prompts", () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  note: vi.fn(),
  select: vi.fn(),
  text: vi.fn(),
  confirm: vi.fn(),
  multiselect: vi.fn(),
  isCancel: vi.fn(() => false),
  spinner: vi.fn(() => ({ start: vi.fn(), stop: vi.fn(), message: vi.fn() })),
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
    error: vi.fn(),
    step: vi.fn(),
  },
}));

import { initCommand } from "../src/commands/init.js";

const fixturesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("fixture init (existing apps)", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  for (const name of ["empty-expo", "expo-router", "rn-cli"] as const) {
    it(`init --yes existing on ${name} installs skills`, async () => {
      const tmp = await mkdtemp(path.join(os.tmpdir(), `rn-fix-${name}-`));
      dirs.push(tmp);
      await cp(path.join(fixturesRoot, name), tmp, { recursive: true });

      await initCommand({
        cwd: tmp,
        yes: true,
        type: "existing",
        tools: ["agents-md"],
      });

      const agents = await readFile(path.join(tmp, "AGENTS.md"), "utf8");
      expect(agents).toContain("rn-agentic-dev:start");
      expect(agents).toMatch(/feature-grill/);
      expect(agents).toMatch(/plan-review/);
    });
  }
});
