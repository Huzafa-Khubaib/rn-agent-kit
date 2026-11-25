/**
 * Validate Jira ticket markdown bodies produced by prd-to-jira.
 * Fails if any ticket is missing a Figma link, Acceptance Criteria, or testIDs.
 */

export interface TicketValidationIssue {
  file: string;
  code: "missing-figma-link" | "missing-acceptance-criteria" | "missing-test-ids";
  message: string;
}

export interface TicketValidationResult {
  ok: boolean;
  checked: number;
  issues: TicketValidationIssue[];
}

const FIGMA_LINK_RE = /https?:\/\/(?:www\.)?figma\.com\/\S+/i;
const NEEDS_FIGMA_RE = /\bNEEDS_FIGMA\b/;
const AC_HEADING_RE = /#{1,3}\s*Acceptance Criteria\b/i;
const GHERKIN_RE = /\b(Given|When|Then)\b/;
const TEST_IDS_HEADING_RE = /#{1,3}\s*testIDs?\b/i;
/** Bullet or inline-code id after a testIDs heading, within the following section. */
const TEST_ID_ITEM_RE = /^\s*[-*]\s+`?[A-Za-z][A-Za-z0-9_-{}.]*`?/m;

export function validateTicketMarkdown(file: string, body: string): TicketValidationIssue[] {
  const issues: TicketValidationIssue[] = [];
  const text = body ?? "";

  if (!FIGMA_LINK_RE.test(text) && !NEEDS_FIGMA_RE.test(text)) {
    issues.push({
      file,
      code: "missing-figma-link",
      message: "Missing Figma deep link (figma.com URL) or explicit NEEDS_FIGMA marker.",
    });
  }

  const hasAcHeading = AC_HEADING_RE.test(text);
  const hasGherkin = GHERKIN_RE.test(text);
  if (!hasAcHeading && !hasGherkin) {
    issues.push({
      file,
      code: "missing-acceptance-criteria",
      message:
        'Missing Acceptance Criteria — add a "## Acceptance Criteria" section and/or Gherkin Given/When/Then.',
    });
  }

  const testIdsIdx = text.search(TEST_IDS_HEADING_RE);
  if (testIdsIdx === -1) {
    issues.push({
      file,
      code: "missing-test-ids",
      message: 'Missing "## testIDs" section with at least one listed id.',
    });
  } else {
    const after = text.slice(testIdsIdx);
    const nextHeading = after.slice(1).search(/\n#{1,3}\s+/);
    const section = nextHeading === -1 ? after : after.slice(0, nextHeading + 1);
    if (!TEST_ID_ITEM_RE.test(section)) {
      issues.push({
        file,
        code: "missing-test-ids",
        message: 'The "## testIDs" section has no bullet list items.',
      });
    }
  }

  return issues;
}

export function validateTickets(
  tickets: Array<{ file: string; body: string }>,
): TicketValidationResult {
  const issues: TicketValidationIssue[] = [];
  for (const t of tickets) {
    issues.push(...validateTicketMarkdown(t.file, t.body));
  }
  return { ok: issues.length === 0, checked: tickets.length, issues };
}

/** Minimal shape we care about from .agent/jira-map.json for path hints. */
export interface JiraMapFile {
  epic?: { key?: string; description?: string; body?: string };
  stories?: Record<
    string,
    {
      key?: string;
      body?: string;
      description?: string;
      figmaUrl?: string;
      subtasks?: Record<string, { key?: string; body?: string; description?: string }>;
    }
  >;
}

/**
 * When ticket markdown lives inline on the map (optional `body` / `description`),
 * validate those. Prefer dumping to `.agent/jira-tickets/<KEY>.md` for CI.
 */
export function ticketsFromMap(map: JiraMapFile): Array<{ file: string; body: string }> {
  const out: Array<{ file: string; body: string }> = [];
  if (map.epic?.key && (map.epic.body || map.epic.description)) {
    out.push({
      file: `map:epic:${map.epic.key}`,
      body: map.epic.body ?? map.epic.description ?? "",
    });
  }
  for (const [slug, story] of Object.entries(map.stories ?? {})) {
    const body = story.body ?? story.description;
    if (story.key && body) {
      // Ensure figmaUrl alone can satisfy the Figma check when body omitted the link
      const enriched =
        story.figmaUrl && !FIGMA_LINK_RE.test(body) && !NEEDS_FIGMA_RE.test(body)
          ? `${body}\n\n## Figma\n\n- **Link:** ${story.figmaUrl}\n`
          : body;
      out.push({ file: `map:story:${slug}:${story.key}`, body: enriched });
    }
    for (const [subSlug, sub] of Object.entries(story.subtasks ?? {})) {
      const subBody = sub.body ?? sub.description;
      if (sub.key && subBody) {
        const enriched =
          story.figmaUrl && !FIGMA_LINK_RE.test(subBody) && !NEEDS_FIGMA_RE.test(subBody)
            ? `${subBody}\n\n## Figma\n\n- **Link:** ${story.figmaUrl}\n`
            : subBody;
        out.push({ file: `map:subtask:${slug}/${subSlug}:${sub.key}`, body: enriched });
      }
    }
  }
  return out;
}
