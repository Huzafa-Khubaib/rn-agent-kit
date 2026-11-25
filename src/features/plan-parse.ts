import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  type FeaturePlanJson,
  parseApprovals,
  parseFeaturePlanJson,
} from "../schema/agent-config.js";
import { pathExists } from "../utils/fs.js";

/**
 * Prefer machine-readable plan JSON next to plan.md.
 * Fallback: minimal parse of a JSON fenced block inside plan.md.
 */
export async function loadFeaturePlan(
  cwd: string,
  slug: string,
): Promise<{ plan: FeaturePlanJson; planPath: string; specPath: string }> {
  const dir = path.join(cwd, "docs", "features", slug);
  const specPath = path.join(dir, "spec.md");
  const planMd = path.join(dir, "plan.md");
  const planJsonPath = path.join(dir, "plan.json");

  if (!(await pathExists(planMd)) && !(await pathExists(planJsonPath))) {
    throw new Error(
      `Missing plan for slug "${slug}". Expected ${path.relative(cwd, planMd)} (and plan-review approval).`,
    );
  }
  if (!(await pathExists(specPath))) {
    throw new Error(`Missing spec.md for slug "${slug}" at ${path.relative(cwd, specPath)}`);
  }

  if (await pathExists(planJsonPath)) {
    const raw = JSON.parse(await readFile(planJsonPath, "utf8")) as unknown;
    const plan = parseFeaturePlanJson(raw);
    return { plan, planPath: planJsonPath, specPath };
  }

  const md = await readFile(planMd, "utf8");
  const fence = md.match(/```json\s*([\s\S]*?)```/i);
  if (!fence?.[1]) {
    throw new Error(
      `plan.md for "${slug}" has no \`\`\`json feature plan block. Add docs/features/${slug}/plan.json or a JSON fence (see FeaturePlanJson schema).`,
    );
  }
  const plan = parseFeaturePlanJson(JSON.parse(fence[1]!));
  if (plan.slug !== slug) {
    throw new Error(`plan.slug "${plan.slug}" does not match --slug "${slug}"`);
  }
  return { plan, planPath: planMd, specPath };
}

export async function assertSlugApproved(cwd: string, slug: string): Promise<void> {
  const file = path.join(cwd, ".agent", "approvals.json");
  if (!(await pathExists(file))) {
    throw new Error(
      `No .agent/approvals.json — run plan-review and reply "approve" before jira-sync.`,
    );
  }
  const raw = JSON.parse(await readFile(file, "utf8")) as unknown;
  const approvals = parseApprovals(raw);
  const hit = approvals.approvals.find((a) => a.slug === slug);
  if (!hit) {
    throw new Error(
      `Slug "${slug}" is not approved in .agent/approvals.json. Run plan-review and reply "approve".`,
    );
  }
}
