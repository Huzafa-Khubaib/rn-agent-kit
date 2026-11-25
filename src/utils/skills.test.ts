import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadSkills, skillBody } from "./skills.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../skills");

describe("loadSkills", () => {
  it("parses folded description and globs from real skills", async () => {
    const skills = await loadSkills(root);
    const arch = skills.find((s) => s.name === "rn-architecture");
    expect(arch).toBeDefined();
    expect(arch!.description).toMatch(/Use when/i);
    expect(arch!.description).not.toMatch(/^>-/);
    expect(arch!.globs.length).toBeGreaterThan(0);
    expect(arch!.alwaysApply).toBe(false);
    expect(skillBody(arch!)).toMatch(/feature-based/i);
    expect(skillBody(arch!)).toContain("Common mistakes");
  });

  it("loads core + workflow skills", async () => {
    const skills = await loadSkills(root);
    const names = skills.map((s) => s.name);
    for (const name of [
      "rn-architecture",
      "rn-typescript-react",
      "expo-cli",
      "rn-native-android-ios",
      "rn-sdk-integrations",
      "feature-grill",
      "plan-review",
      "prd-to-jira",
      "ticket-to-code",
      "rn-agent-router",
      "bug-triage",
    ]) {
      expect(names).toContain(name);
    }
  });

  it("sorts alwaysApply router first", async () => {
    const skills = await loadSkills(root);
    expect(skills[0]?.name).toBe("rn-agent-router");
    expect(skills[0]?.alwaysApply).toBe(true);
  });

  it("feature-grill documents screen-by-screen element interview", async () => {
    const skills = await loadSkills(root);
    const grill = skills.find((s) => s.name === "feature-grill");
    expect(grill).toBeDefined();
    const body = skillBody(grill!);
    expect(body).toMatch(/Element by element/i);
    expect(body).toMatch(/ONE question/i);
    expect(body).toMatch(/Confirm this screen/i);
    expect(body).toMatch(/AC-n \[<Screen name>\]/i);
    expect(body).toMatch(/Never write.*Jira tickets/i);
  });

  it("feature-grill documents screenshot CSS fallback and library approval", async () => {
    const skills = await loadSkills(root);
    const grill = skills.find((s) => s.name === "feature-grill");
    expect(grill).toBeDefined();
    const body = skillBody(grill!);
    expect(body).toMatch(/rate limit/i);
    expect(body).toMatch(/TBD when MCP recovers|TBD on re-sync/i);
    expect(body).toMatch(/Need from Figma Inspect/i);
    expect(body).toMatch(/Third-party libraries/i);
    expect(body).toMatch(/recommend one/i);
  });

  it("feature-grill treats Figma and Stitch as equal design sources", async () => {
    const skills = await loadSkills(root);
    const grill = skills.find((s) => s.name === "feature-grill");
    expect(grill).toBeDefined();
    const body = skillBody(grill!);
    expect(body).toMatch(/Design source for this feature/i);
    expect(body).toMatch(/Path A — Figma/);
    expect(body).toMatch(/Path B — Stitch/);
    expect(body).toMatch(/Stitch — screenshot/i);
    expect(body).toMatch(/Do \*\*not\*\* mix Figma|do not mix Figma/i);
  });
});
