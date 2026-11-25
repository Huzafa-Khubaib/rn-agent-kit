import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildRouterHookCommand,
  installClaudeRouterHook,
  mergeClaudeRouterHook,
} from "./claude-hooks.js";

describe("claude UserPromptSubmit hook", () => {
  let tmp: string;

  afterEach(async () => {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  });

  it("merges without wiping existing hooks", () => {
    const existing = JSON.stringify(
      {
        hooks: {
          PreToolUse: [{ hooks: [{ type: "command", command: "echo keep" }] }],
          UserPromptSubmit: [
            { hooks: [{ type: "command", command: "echo user-hook" }] },
          ],
        },
      },
      null,
      2,
    );
    const { json } = mergeClaudeRouterHook(existing);
    const parsed = JSON.parse(json) as {
      hooks: {
        PreToolUse: unknown[];
        UserPromptSubmit: Array<{ hooks: Array<{ command: string }> }>;
      };
    };
    expect(parsed.hooks.PreToolUse).toHaveLength(1);
    const cmds = parsed.hooks.UserPromptSubmit.flatMap((e) =>
      e.hooks.map((h) => h.command),
    );
    expect(cmds.some((c) => c.includes("echo user-hook"))).toBe(true);
    expect(cmds.some((c) => c.includes("rn-agentic-dev-router"))).toBe(true);
  });

  it("is idempotent", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-claude-hook-"));
    await mkdir(path.join(tmp, ".claude"), { recursive: true });
    const a = await installClaudeRouterHook(tmp);
    const b = await installClaudeRouterHook(tmp);
    expect(a.written).toBe(true);
    expect(b.written).toBe(false);
    const raw = await readFile(path.join(tmp, ".claude/settings.json"), "utf8");
    expect(raw.split("rn-agentic-dev-router").length - 1).toBe(1);
    expect(buildRouterHookCommand()).toContain("UserPromptSubmit");
  });

  it("preserves unrelated settings keys", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "rn-claude-hook-"));
    await mkdir(path.join(tmp, ".claude"), { recursive: true });
    await writeFile(
      path.join(tmp, ".claude/settings.json"),
      JSON.stringify({ permissions: { allow: ["Bash"] } }, null, 2),
      "utf8",
    );
    await installClaudeRouterHook(tmp);
    const parsed = JSON.parse(
      await readFile(path.join(tmp, ".claude/settings.json"), "utf8"),
    ) as { permissions: unknown; hooks: unknown };
    expect(parsed.permissions).toEqual({ allow: ["Bash"] });
    expect(parsed.hooks).toBeDefined();
  });
});
