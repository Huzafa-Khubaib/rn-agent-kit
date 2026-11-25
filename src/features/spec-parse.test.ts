import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  hasBlockingOpenItems,
  parseAcceptanceCriteriaIds,
  parseScreenTaggedAcceptanceCriteria,
} from "./spec-parse.js";

const fixtureSpec = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../tests/fixtures/feature-grill/spec.md",
);

describe("spec-parse", () => {
  it("parses screen-tagged ACs", () => {
    const acs = parseScreenTaggedAcceptanceCriteria(`
## Acceptance criteria
- AC-1 [Login]: Email visible
- AC-2 (Home): List loads
- AC-3: Missing screen tag
`);
    expect(acs).toEqual([
      { id: "AC-1", screen: "Login", text: "Email visible" },
      { id: "AC-2", screen: "Home", text: "List loads" },
      { id: "AC-3", screen: null, text: "Missing screen tag" },
    ]);
    expect(
      parseAcceptanceCriteriaIds(`
## Acceptance criteria
- AC-1 [Login]: Email visible
- AC-2 (Home): List loads
`),
    ).toEqual(["AC-1", "AC-2"]);
  });

  it("detects blocking open items", () => {
    expect(hasBlockingOpenItems("## Open items\n(none)\n")).toBe(false);
    expect(hasBlockingOpenItems("## Open items\n- none\n")).toBe(false);
    expect(hasBlockingOpenItems("## Open items\n- Clarify offline copy\n")).toBe(true);
    expect(hasBlockingOpenItems("# No section")).toBe(false);
  });

  it("loads feature-grill fixture spec", async () => {
    const raw = await readFile(fixtureSpec, "utf8");
    const acs = parseScreenTaggedAcceptanceCriteria(raw);
    expect(acs.length).toBeGreaterThanOrEqual(2);
    expect(acs.every((a) => a.screen)).toBe(true);
    expect(hasBlockingOpenItems(raw)).toBe(false);
    expect(raw).toMatch(/## Screen:/);
    expect(raw).toMatch(/### Elements/);
  });
});
