import { diffIsEmpty, type TokenDiff } from "./diff";
import { flatten } from "./tree";
import type { DtcgGroup, Issue } from "./types";

const ICON = { error: "🔴", warning: "🟡", info: "🔵" } as const;
const LIMIT = 40;

function list(items: string[]): string {
  const shown = items.slice(0, LIMIT).map((i) => `- \`${i}\``);
  if (items.length > LIMIT) shown.push(`- … and ${items.length - LIMIT} more`);
  return shown.join("\n");
}

export function renderReport(input: {
  source: string;
  fileUrl?: string;
  tree: DtcgGroup;
  issues: Issue[];
  diff: TokenDiff;
}): string {
  const flat = flatten(input.tree);
  const byType = new Map<string, number>();
  for (const t of flat) byType.set(t.type, (byType.get(t.type) ?? 0) + 1);
  const count = (s: Issue["severity"]) => input.issues.filter((i) => i.severity === s).length;
  const out: string[] = ["# Design tokens report", ""];
  out.push(`Source: **${input.source}**${input.fileUrl ? ` — ${input.fileUrl}` : ""}`, "");

  out.push("## Summary", "", "| Type | Tokens |", "| --- | ---: |");
  for (const [type, n] of [...byType.entries()].sort()) out.push(`| ${type} | ${n} |`);
  out.push(`| **total** | **${flat.length}** |`, "");
  out.push(
    `Issues: ${count("error")} error(s), ${count("warning")} warning(s), ${count("info")} info.`,
    "",
  );

  out.push("## Changes since last run", "");
  if (input.diff.initial)
    out.push(`Initial generation: ${input.diff.added.length} tokens created.`, "");
  else if (diffIsEmpty(input.diff)) out.push("No changes.", "");
  else {
    if (input.diff.added.length)
      out.push(`### Added (${input.diff.added.length})`, "", list(input.diff.added), "");
    if (input.diff.removed.length)
      out.push(
        `### Removed (${input.diff.removed.length})`,
        "",
        list(input.diff.removed),
        "",
        "> Removed tokens may break components that still use them — `tsc` will flag them.",
        "",
      );
    if (input.diff.changed.length) {
      out.push(`### Changed (${input.diff.changed.length})`, "");
      for (const c of input.diff.changed.slice(0, LIMIT))
        out.push(`- \`${c.path}\`: ${c.before} → ${c.after}`);
      if (input.diff.changed.length > LIMIT)
        out.push(`- … and ${input.diff.changed.length - LIMIT} more`);
      out.push("");
    }
  }

  out.push("## Needs attention in the design file", "");
  if (!input.issues.length) out.push("✅ Nothing to fix.", "");
  for (const sev of ["error", "warning", "info"] as const) {
    const items = input.issues.filter((i) => i.severity === sev);
    if (!items.length) continue;
    out.push(`### ${ICON[sev]} ${sev[0].toUpperCase()}${sev.slice(1)}s (${items.length})`, "");
    for (const i of items) {
      out.push(`- ${i.token ? `\`${i.token}\` — ` : ""}${i.message}`);
      out.push(`  - **Fix:** ${i.fix}`);
    }
    out.push("");
  }
  return `${out.join("\n").trimEnd()}\n`;
}
