import * as p from "@clack/prompts";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { assertSlugApproved, loadFeaturePlan } from "../features/plan-parse.js";
import {
  createJiraClient,
  jiraCredentialsFromEnv,
  type JiraClient,
} from "../jira/client.js";
import { parseAgentConfig } from "../schema/agent-config.js";
import { pathExists, writeText } from "../utils/fs.js";

export interface JiraSyncOptions {
  cwd?: string;
  slug: string;
  dryRun?: boolean;
  yes?: boolean;
  /** Injected for tests */
  client?: JiraClient;
  env?: NodeJS.ProcessEnv;
}

export interface JiraMapV1 {
  version: 1;
  projectKey: string;
  slug: string;
  epic?: { key: string; summary: string; planTicketId: string };
  stories: Record<
    string,
    {
      key: string;
      summary: string;
      planTicketId: string;
      figmaUrl?: string;
      figmaNodeId?: string;
      body?: string;
      subtasks?: Record<string, { key: string; summary: string; planTicketId: string; body?: string }>;
    }
  >;
}

const SyncOptsSchema = z.object({
  slug: z.string().min(1),
  dryRun: z.boolean().optional(),
  yes: z.boolean().optional(),
  cwd: z.string().optional(),
});

function issueTypeFor(t: "epic" | "story" | "subtask"): string {
  if (t === "epic") return "Epic";
  if (t === "subtask") return "Sub-task";
  return "Story";
}

async function loadMap(cwd: string): Promise<JiraMapV1 | null> {
  const file = path.join(cwd, ".agent", "jira-map.json");
  if (!(await pathExists(file))) return null;
  return JSON.parse(await readFile(file, "utf8")) as JiraMapV1;
}

async function saveMap(cwd: string, map: JiraMapV1): Promise<void> {
  await writeText(path.join(cwd, ".agent", "jira-map.json"), `${JSON.stringify(map, null, 2)}\n`);
}

async function loadProjectKey(cwd: string, planKey?: string, env?: NodeJS.ProcessEnv): Promise<string> {
  const cfgPath = path.join(cwd, ".agent", "config.json");
  if (await pathExists(cfgPath)) {
    const cfg = parseAgentConfig(JSON.parse(await readFile(cfgPath, "utf8")));
    if (cfg.jira?.projectKey) return cfg.jira.projectKey;
  }
  if (planKey) return planKey;
  if (env?.JIRA_PROJECT_KEY) return env.JIRA_PROJECT_KEY;
  throw new Error("Set jira.projectKey in .agent/config.json or JIRA_PROJECT_KEY");
}

async function loadSiteUrl(cwd: string, env: NodeJS.ProcessEnv): Promise<string> {
  if (env.JIRA_SITE_URL) return env.JIRA_SITE_URL;
  const cfgPath = path.join(cwd, ".agent", "config.json");
  if (await pathExists(cfgPath)) {
    const cfg = parseAgentConfig(JSON.parse(await readFile(cfgPath, "utf8")));
    if (cfg.jira?.siteUrl) return cfg.jira.siteUrl;
  }
  throw new Error("Set JIRA_SITE_URL or jira.siteUrl in .agent/config.json");
}

/** Sync approved plan tickets to Jira (idempotent via jira-map.json). */
export async function jiraSyncCommand(options: JiraSyncOptions): Promise<number> {
  const parsed = SyncOptsSchema.parse({
    slug: options.slug,
    dryRun: options.dryRun,
    yes: options.yes,
    cwd: options.cwd,
  });
  const cwd = parsed.cwd ?? process.cwd();
  const env = options.env ?? process.env;

  p.intro(`rn-agentic-dev jira-sync (${parsed.slug})`);

  try {
    await assertSlugApproved(cwd, parsed.slug);
    const { plan } = await loadFeaturePlan(cwd, parsed.slug);
    const projectKey = await loadProjectKey(cwd, plan.projectKey, env);
    const existing = (await loadMap(cwd)) ?? {
      version: 1 as const,
      projectKey,
      slug: parsed.slug,
      stories: {},
    };
    existing.projectKey = projectKey;
    existing.slug = parsed.slug;
    existing.stories = existing.stories ?? {};

    const epicTicket = plan.tickets.find((t) => t.type === "epic") ?? plan.tickets[0]!;
    const stories = plan.tickets.filter((t) => t.type === "story" || (t.type !== "epic" && t.type !== "subtask" && t.id !== epicTicket.id));
    const subtasks = plan.tickets.filter((t) => t.type === "subtask");

    const preview = [
      `Project: ${projectKey}`,
      `Epic: ${epicTicket.title}`,
      `Stories: ${stories.length || (plan.tickets.length > 1 ? plan.tickets.length - 1 : 0)}`,
      `Sub-tasks: ${subtasks.length}`,
      parsed.dryRun ? "Mode: DRY-RUN (no writes)" : "Mode: LIVE",
    ].join("\n");
    p.note(preview, "Preview");

    if (parsed.dryRun) {
      for (const t of plan.tickets) {
        p.log.message(`• [${t.type}] ${t.id}: ${t.title}`);
      }
      p.outro("Dry-run complete — re-run without --dry-run to create/update.");
      return 0;
    }

    if (!parsed.yes) {
      const ok = await p.confirm({ message: "Create/update these Jira issues?" });
      if (p.isCancel(ok) || !ok) {
        p.cancel("Aborted.");
        return 1;
      }
    }

    let client = options.client;
    if (!client) {
      const siteUrl = await loadSiteUrl(cwd, env);
      const creds = jiraCredentialsFromEnv({ ...env, JIRA_SITE_URL: env.JIRA_SITE_URL ?? siteUrl });
      if (!creds) {
        p.cancel("Missing JIRA_EMAIL / JIRA_API_TOKEN in environment.");
        return 1;
      }
      client = createJiraClient({ ...creds, siteUrl: creds.siteUrl || siteUrl });
    }

    // Epic
    const epicMappedId = existing.epic?.planTicketId === epicTicket.id ? existing.epic.key : undefined;
    let epicKey = epicMappedId ?? existing.epic?.key;
    if (epicKey) {
      await client.updateIssue(epicKey, epicTicket.title, epicTicket.body);
      p.log.success(`Updated epic ${epicKey}`);
    } else {
      const created = await client.createIssue({
        projectKey,
        summary: epicTicket.title,
        description: epicTicket.body,
        issueType: issueTypeFor("epic"),
      });
      epicKey = created.key;
      p.log.success(`Created epic ${epicKey}`);
    }
    existing.epic = { key: epicKey, summary: epicTicket.title, planTicketId: epicTicket.id };

    // Stories + subtasks
    const storyTickets =
      stories.length > 0
        ? stories
        : plan.tickets.filter((t) => t.id !== epicTicket.id && t.type !== "subtask");

    for (const story of storyTickets) {
      const prev = Object.values(existing.stories).find((s) => s.planTicketId === story.id);
      let storyKey = prev?.key;
      if (storyKey) {
        await client.updateIssue(storyKey, story.title, story.body);
        p.log.success(`Updated story ${storyKey}`);
      } else {
        const created = await client.createIssue({
          projectKey,
          summary: story.title,
          description: story.body,
          issueType: issueTypeFor("story"),
          parentKey: epicKey,
        });
        storyKey = created.key;
        p.log.success(`Created story ${storyKey}`);
      }
      const slugKey = story.id;
      existing.stories[slugKey] = {
        key: storyKey,
        summary: story.title,
        planTicketId: story.id,
        figmaUrl: story.figmaUrl,
        figmaNodeId: story.figmaNodeId,
        body: story.body,
        subtasks: existing.stories[slugKey]?.subtasks ?? {},
      };

      const childSubs = subtasks.filter(
        (s) => s.parentId === story.id || (!s.parentId && subtasks.length),
      );
      // Only attach subtasks that declare this story as parent; if none declare parent, skip auto-attach
      const scoped = subtasks.filter((s) => s.parentId === story.id);
      for (const sub of scoped.length ? scoped : []) {
        const prevSub = Object.values(existing.stories[slugKey]!.subtasks ?? {}).find(
          (x) => x.planTicketId === sub.id,
        );
        let subKey = prevSub?.key;
        if (subKey) {
          await client.updateIssue(subKey, sub.title, sub.body);
          p.log.success(`Updated sub-task ${subKey}`);
        } else {
          const created = await client.createIssue({
            projectKey,
            summary: sub.title,
            description: sub.body,
            issueType: issueTypeFor("subtask"),
            parentKey: storyKey,
          });
          subKey = created.key;
          p.log.success(`Created sub-task ${subKey}`);
        }
        existing.stories[slugKey]!.subtasks = existing.stories[slugKey]!.subtasks ?? {};
        existing.stories[slugKey]!.subtasks![sub.id] = {
          key: subKey,
          summary: sub.title,
          planTicketId: sub.id,
          body: sub.body,
        };
      }
      void childSubs;
    }

    await saveMap(cwd, existing);
    p.outro(`Done. Map: .agent/jira-map.json · Epic ${epicKey}`);
    return 0;
  } catch (e) {
    p.cancel(e instanceof Error ? e.message : String(e));
    return 1;
  }
}
