import type { Adapter } from "./types.js";
import { agentsMdAdapter } from "./agents-md.js";
import { claudeAdapter } from "./claude.js";
import { copilotAdapter } from "./copilot.js";
import { cursorAdapter } from "./cursor.js";
import { windsurfAdapter } from "./windsurf.js";

export type { Adapter, Skill } from "./types.js";

export const adapters: Adapter[] = [
  claudeAdapter,
  cursorAdapter,
  agentsMdAdapter,
  copilotAdapter,
  windsurfAdapter,
];

/** Map user-facing tool ids / aliases → adapter name. */
export const TOOL_ALIASES: Record<string, string> = {
  claude: "claude",
  "claude-code": "claude",
  cursor: "cursor",
  "agents-md": "agents-md",
  agents: "agents-md",
  codex: "agents-md",
  gemini: "agents-md",
  copilot: "copilot",
  "github-copilot": "copilot",
  windsurf: "windsurf",
};

export function resolveToolName(input: string): string | undefined {
  return TOOL_ALIASES[input.trim().toLowerCase()];
}

export function getAdapter(name: string): Adapter | undefined {
  const resolved = resolveToolName(name) ?? name;
  return adapters.find((a) => a.name === resolved);
}

export { agentsMdAdapter, claudeAdapter, copilotAdapter, cursorAdapter, windsurfAdapter };
