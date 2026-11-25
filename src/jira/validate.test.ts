import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ticketsFromMap, validateTicketMarkdown, validateTickets } from "./validate.js";
import { runValidateJiraTickets } from "../scripts/validate-jira-tickets.js";

const GOOD = `# Login

## Figma

- **Link:** https://www.figma.com/design/AbC123/App?node-id=12-34

## Acceptance Criteria (Gherkin)

\`\`\`gherkin
Given I am on Login
When I submit valid credentials
Then I see Home
\`\`\`

## testIDs

- \`login-email\`
- \`login-submit\`
`;

describe("validateTicketMarkdown", () => {
  it("accepts a complete ticket", () => {
    expect(validateTicketMarkdown("APP-1.md", GOOD)).toEqual([]);
  });

  it("accepts NEEDS_FIGMA instead of a URL", () => {
    const body = GOOD.replace(
      "https://www.figma.com/design/AbC123/App?node-id=12-34",
      "NEEDS_FIGMA — waiting on design",
    );
    expect(
      validateTicketMarkdown("x.md", body).filter((i) => i.code === "missing-figma-link"),
    ).toEqual([]);
  });

  it("fails without Figma link", () => {
    const body = GOOD.replace(/https:\/\/www\.figma\.com\/\S+/, "");
    expect(validateTicketMarkdown("x.md", body).some((i) => i.code === "missing-figma-link")).toBe(
      true,
    );
  });

  it("fails without AC / Gherkin", () => {
    const body = GOOD.replace(/## Acceptance Criteria[\s\S]*?## testIDs/, "## testIDs");
    expect(
      validateTicketMarkdown("x.md", body).some((i) => i.code === "missing-acceptance-criteria"),
    ).toBe(true);
  });

  it("fails without testIDs list", () => {
    const body = GOOD.replace(/## testIDs[\s\S]*/, "## testIDs\n\n");
    expect(validateTicketMarkdown("x.md", body).some((i) => i.code === "missing-test-ids")).toBe(
      true,
    );
  });
});

describe("ticketsFromMap + CLI", () => {
  let tmp: string;

  afterEach(async () => {
    // temp dirs cleaned by OS; no-op
  });

  it("enriches map story body with figmaUrl", () => {
    const tickets = ticketsFromMap({
      stories: {
        login: {
          key: "APP-1",
          figmaUrl: "https://www.figma.com/design/AbC/App?node-id=1-2",
          body: `## Acceptance Criteria\n\nGiven x When y Then z\n\n## testIDs\n\n- \`a\`\n`,
        },
      },
    });
    expect(validateTickets(tickets).ok).toBe(true);
  });

  it("CLI exits 1 on bad dumps and 0 on good", async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "jira-val-"));
    const dir = path.join(tmp, "tickets");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "BAD.md"), "# Nope\n", "utf8");
    expect(await runValidateJiraTickets(["--dir", dir], tmp)).toBe(1);

    await writeFile(path.join(dir, "BAD.md"), GOOD, "utf8");
    expect(await runValidateJiraTickets(["--dir", dir], tmp)).toBe(0);
  });
});
