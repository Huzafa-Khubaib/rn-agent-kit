import { describe, expect, it } from "vitest";
import {
  FigmaUrlSchema,
  parseAgentConfig,
  parseApprovals,
  parseFeaturePlanJson,
} from "./agent-config.js";

describe("schemas", () => {
  it("parses agent config", () => {
    const cfg = parseAgentConfig({
      version: 1,
      jira: { siteUrl: "https://acme.atlassian.net", projectKey: "APP" },
      figma: { fileUrl: "https://www.figma.com/design/AbC/App" },
    });
    expect(cfg.jira?.projectKey).toBe("APP");
  });

  it("rejects bad figma url", () => {
    expect(FigmaUrlSchema.safeParse("https://example.com").success).toBe(false);
    expect(FigmaUrlSchema.safeParse("https://www.figma.com/design/AbC/App").success).toBe(true);
  });

  it("parses approvals + feature plan", () => {
    const a = parseApprovals({
      version: 1,
      approvals: [
        {
          slug: "login",
          planPath: "docs/features/login/plan.md",
          specPath: "docs/features/login/spec.md",
          approvedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    expect(a.approvals[0]?.slug).toBe("login");

    const plan = parseFeaturePlanJson({
      version: 1,
      slug: "login",
      title: "Login",
      tickets: [{ id: "e1", title: "Epic", type: "epic", body: "body" }],
    });
    expect(plan.tickets).toHaveLength(1);
  });

  it("fails invalid plan", () => {
    expect(() => parseFeaturePlanJson({ version: 1, slug: "x", title: "t", tickets: [] })).toThrow();
  });
});
