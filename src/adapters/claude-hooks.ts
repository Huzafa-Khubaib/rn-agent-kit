import path from "node:path";
import { ensureDir, pathExists, readText, writeText } from "../utils/fs.js";

const HOOK_MARKER = "rn-agentic-dev-router";

/** Tiny UserPromptSubmit injector — keeps CLAUDE.md as primary always-on path. */
export function buildRouterHookCommand(): string {
  // Prints structured JSON so Claude Code injects additionalContext (official hooks API).
  // Docs: https://code.claude.com/docs/en/hooks
  const payload = JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext:
        "[rn-agentic-dev] Follow the always-on router in CLAUDE.md / .claude/skills/rn-agent-router before choosing a workflow.",
    },
  });
  // Single-quoted node -e; marker string is searchable for idempotent merge/remove
  return `node -e "process.stdout.write(${JSON.stringify(payload)})" # ${HOOK_MARKER}`;
}

type ClaudeSettings = {
  hooks?: {
    UserPromptSubmit?: Array<{
      matcher?: string;
      hooks?: Array<{ type?: string; command?: string; [k: string]: unknown }>;
      [k: string]: unknown;
    }>;
    [event: string]: unknown;
  };
  [k: string]: unknown;
};

function isOurHookCommand(command: string | undefined): boolean {
  return Boolean(command && command.includes(HOOK_MARKER));
}

/**
 * Merge (never wipe) a UserPromptSubmit hook into `.claude/settings.json`.
 * Idempotent — replaces our previous entry only.
 */
export function mergeClaudeRouterHook(existingRaw: string | null): {
  json: string;
  changed: boolean;
} {
  let settings: ClaudeSettings = {};
  if (existingRaw?.trim()) {
    try {
      settings = JSON.parse(existingRaw) as ClaudeSettings;
    } catch {
      settings = {};
    }
  }

  const hooks = { ...(settings.hooks ?? {}) };
  const submit = Array.isArray(hooks.UserPromptSubmit)
    ? [...hooks.UserPromptSubmit]
    : [];

  const command = buildRouterHookCommand();
  const ours = {
    hooks: [{ type: "command", command }],
  };

  const withoutOurs = submit.filter((entry) => {
    const cmds = entry.hooks ?? [];
    return !cmds.some((h) => isOurHookCommand(h.command));
  });

  const alreadySame = submit.some((entry) =>
    (entry.hooks ?? []).some((h) => h.command === command),
  );

  if (alreadySame && withoutOurs.length === submit.length - 1) {
    return {
      json: `${JSON.stringify(settings, null, 2)}\n`,
      changed: false,
    };
  }

  if (alreadySame) {
    const normalized = existingRaw?.endsWith("\n") ? existingRaw : `${existingRaw ?? ""}\n`;
    return { json: normalized || `${JSON.stringify(settings, null, 2)}\n`, changed: false };
  }

  hooks.UserPromptSubmit = [...withoutOurs, ours];
  const next: ClaudeSettings = { ...settings, hooks };
  return { json: `${JSON.stringify(next, null, 2)}\n`, changed: true };
}

/** Install optional UserPromptSubmit router hook (opt-in via --claude-hook). */
export async function installClaudeRouterHook(cwd: string): Promise<{ path: string; written: boolean }> {
  const dest = path.join(cwd, ".claude", "settings.json");
  await ensureDir(path.dirname(dest));
  const existing = (await pathExists(dest)) ? await readText(dest) : null;
  const { json, changed } = mergeClaudeRouterHook(existing);
  if (changed) await writeText(dest, json);
  return { path: dest, written: changed };
}
