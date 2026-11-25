import { z } from "zod";

/** Equal design sources for feature-grill / connect / SDLC. */
export const DesignSourceSchema = z.enum(["figma", "stitch", "screenshot"]);
export type DesignSource = z.infer<typeof DesignSourceSchema>;

export const AgentConfigSchema = z
  .object({
    version: z.number().int().positive().default(1),
    workflow: z.string().optional(),
    confirm: z.boolean().optional(),
    jira: z
      .object({
        siteUrl: z.string().url().optional(),
        projectKey: z.string().min(1).optional(),
        confirm: z.boolean().optional(),
      })
      .optional(),
    figma: z
      .object({
        fileUrl: z.string().optional(),
      })
      .optional(),
    /** Equal design sources for feature-grill / connect. */
    designSource: DesignSourceSchema.optional(),
    /** Local folder of screen PNGs when designSource=screenshot. */
    screenshotsDir: z.string().optional(),
    github: z
      .object({
        repo: z.string().optional(),
      })
      .optional(),
    prdPath: z.string().optional(),
  })
  .passthrough();

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export const ApprovalEntrySchema = z.object({
  slug: z.string().min(1),
  planPath: z.string().min(1),
  specPath: z.string().min(1),
  approvedAt: z.string().min(1),
  approvedBy: z.string().default("user"),
  phrase: z.string().default("approve"),
});

export const ApprovalsFileSchema = z.object({
  version: z.literal(1).default(1),
  approvals: z.array(ApprovalEntrySchema).default([]),
});

export type ApprovalsFile = z.infer<typeof ApprovalsFileSchema>;

export const PlanTicketSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(["epic", "story", "subtask"]).default("story"),
  summary: z.string().optional(),
  body: z.string().min(1),
  parentId: z.string().optional(),
  figmaUrl: z.string().optional(),
  figmaNodeId: z.string().optional(),
  acIds: z.array(z.string()).optional(),
});

export const FeaturePlanJsonSchema = z.object({
  version: z.literal(1).default(1),
  slug: z.string().min(1),
  projectKey: z.string().min(1).optional(),
  title: z.string().min(1),
  tickets: z.array(PlanTicketSchema).min(1),
});

export type FeaturePlanJson = z.infer<typeof FeaturePlanJsonSchema>;

export const FigmaUrlSchema = z
  .string()
  .url()
  .refine(
    (u) => /figma\.com\/(file|design|make|proto)/i.test(u) || /stitch/i.test(u),
    "Expected a Figma or Stitch URL",
  );

export function parseDesignSource(raw: unknown): DesignSource | undefined {
  const r = DesignSourceSchema.safeParse(raw);
  return r.success ? r.data : undefined;
}

export function parseAgentConfig(raw: unknown): AgentConfig {
  return AgentConfigSchema.parse(raw);
}

export function parseApprovals(raw: unknown): ApprovalsFile {
  return ApprovalsFileSchema.parse(raw);
}

export function parseFeaturePlanJson(raw: unknown): FeaturePlanJson {
  return FeaturePlanJsonSchema.parse(raw);
}
