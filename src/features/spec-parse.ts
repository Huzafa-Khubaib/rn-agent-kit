/**
 * Parse feature-grill spec.md: screen-tagged ACs and Open items.
 *
 * AC line examples:
 *   - AC-1 [Login]: Email field is visible
 *   - AC-2 (Home): Pull to refresh works
 */

export interface ScreenTaggedAc {
  id: string;
  screen: string | null;
  text: string;
}

/** Extract AC-n entries, preferring screen tags from the Acceptance criteria section. */
export function parseScreenTaggedAcceptanceCriteria(specMarkdown: string): ScreenTaggedAc[] {
  const section =
    specMarkdown.match(/##\s*Acceptance criteria\b([\s\S]*?)(?=\n##\s|\n#$|$)/i)?.[1] ??
    specMarkdown;

  const byId = new Map<string, ScreenTaggedAc>();
  const lineRe =
    /^\s*[-*]\s*AC-(\d+)\s*(?:\[([^\]]+)\]|\(([^)]+)\))?\s*:?\s*(.*)$/gim;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(section))) {
    const id = `AC-${m[1]}`;
    const screen = (m[2] ?? m[3] ?? "").trim() || null;
    const text = (m[4] ?? "").trim();
    const prev = byId.get(id);
    // Prefer entries that include a screen tag
    if (!prev || (!prev.screen && screen)) {
      byId.set(id, { id, screen, text });
    }
  }

  // Fallback: bare AC-n mentions in the section if no list lines matched
  if (byId.size === 0) {
    const bare = /\bAC-(\d+)\b/gi;
    let b: RegExpExecArray | null;
    while ((b = bare.exec(section))) {
      const id = `AC-${b[1]}`;
      if (!byId.has(id)) byId.set(id, { id, screen: null, text: "" });
    }
  }

  return [...byId.values()].sort((a, b) => Number(a.id.slice(3)) - Number(b.id.slice(3)));
}

/** True when ## Open items has real unresolved bullets. */
export function hasBlockingOpenItems(specMarkdown: string): boolean {
  const section = specMarkdown.match(/##\s*Open items\b([\s\S]*?)(?=\n##\s|\n#$|$)/i)?.[1];
  if (section === undefined) {
    // No section → treat as empty (older specs)
    return false;
  }
  const lines = section
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const emptyMarkers = /^(?:\(none\)|none|-+\s*\(none\)|n\/?a\.?)$/i;
  for (const line of lines) {
    if (emptyMarkers.test(line)) continue;
    if (/^[-*]\s+/.test(line)) {
      const body = line.replace(/^[-*]\s+/, "").trim();
      if (!body || emptyMarkers.test(body)) continue;
      return true;
    }
  }
  return false;
}

/** Ids only (compatible with older coverage helpers). */
export function parseAcceptanceCriteriaIds(specMarkdown: string): string[] {
  return parseScreenTaggedAcceptanceCriteria(specMarkdown).map((a) => a.id);
}
