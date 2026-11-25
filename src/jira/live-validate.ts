import { validateTicketMarkdown, type TicketValidationIssue } from "./validate.js";
import { createJiraClient, jiraCredentialsFromEnv, type JiraClient } from "./client.js";

function adfToPlain(description: unknown): string {
  if (typeof description === "string") return description;
  if (!description || typeof description !== "object") return "";
  const walk = (node: unknown): string => {
    if (!node || typeof node !== "object") return "";
    const n = node as { type?: string; text?: string; content?: unknown[] };
    if (n.type === "text" && n.text) return n.text;
    if (Array.isArray(n.content)) return n.content.map(walk).join(n.type === "paragraph" ? "\n" : "");
    return "";
  };
  return walk(description);
}

export async function validateLiveIssues(
  keys: string[],
  opts: {
    env?: NodeJS.ProcessEnv;
    client?: JiraClient;
    siteUrl?: string;
  } = {},
): Promise<{ ok: boolean; issues: TicketValidationIssue[]; checked: number }> {
  const env = opts.env ?? process.env;
  let client = opts.client;
  if (!client) {
    const creds = jiraCredentialsFromEnv(env);
    if (!creds) {
      throw new Error("Live validate needs JIRA_SITE_URL, JIRA_EMAIL, JIRA_API_TOKEN");
    }
    client = createJiraClient({
      siteUrl: opts.siteUrl ?? creds.siteUrl,
      email: creds.email,
      apiToken: creds.apiToken,
    });
  }

  const issues: TicketValidationIssue[] = [];
  for (const key of keys) {
    const issue = await client.getIssue(key);
    const body = [
      issue.fields?.summary ?? "",
      adfToPlain(issue.fields?.description),
    ].join("\n\n");
    issues.push(...validateTicketMarkdown(`live:${key}`, body));
  }
  return { ok: issues.length === 0, issues, checked: keys.length };
}
