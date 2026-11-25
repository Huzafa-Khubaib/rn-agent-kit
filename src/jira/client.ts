/**
 * Minimal Jira Cloud REST client. Secrets only from env / injected options — never logged.
 */

export interface JiraClientOptions {
  siteUrl: string;
  email: string;
  apiToken: string;
  fetchImpl?: typeof fetch;
}

export interface JiraCreateIssueInput {
  projectKey: string;
  summary: string;
  description: string;
  issueType: string;
  parentKey?: string;
}

export interface JiraIssue {
  key: string;
  fields?: {
    summary?: string;
    description?: unknown;
  };
}

function authHeader(email: string, apiToken: string): string {
  return `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;
}

function asAdfDoc(text: string): Record<string, unknown> {
  // Jira Cloud often expects ADF; plain string fallback via wiki-style paragraph nodes.
  const paragraphs = text.split(/\n/).map((line) => ({
    type: "paragraph",
    content: line ? [{ type: "text", text: line }] : [],
  }));
  return {
    type: "doc",
    version: 1,
    content: paragraphs.length ? paragraphs : [{ type: "paragraph", content: [] }],
  };
}

export function createJiraClient(opts: JiraClientOptions) {
  const base = opts.siteUrl.replace(/\/$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const headers = {
    Authorization: authHeader(opts.email, opts.apiToken),
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Jira ${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    async getIssue(key: string): Promise<JiraIssue> {
      return request<JiraIssue>("GET", `/rest/api/3/issue/${encodeURIComponent(key)}`);
    },

    async createIssue(input: JiraCreateIssueInput): Promise<{ key: string }> {
      const fields: Record<string, unknown> = {
        project: { key: input.projectKey },
        summary: input.summary,
        description: asAdfDoc(input.description),
        issuetype: { name: input.issueType },
      };
      if (input.parentKey) {
        fields.parent = { key: input.parentKey };
      }
      return request<{ key: string }>("POST", "/rest/api/3/issue", { fields });
    },

    async updateIssue(key: string, summary: string, description: string): Promise<void> {
      await request("PUT", `/rest/api/3/issue/${encodeURIComponent(key)}`, {
        fields: {
          summary,
          description: asAdfDoc(description),
        },
      });
    },

    async addComment(key: string, body: string): Promise<void> {
      await request("POST", `/rest/api/3/issue/${encodeURIComponent(key)}/comment`, {
        body: asAdfDoc(body),
      });
    },
  };
}

export type JiraClient = ReturnType<typeof createJiraClient>;

export function jiraCredentialsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): { siteUrl: string; email: string; apiToken: string } | null {
  const siteUrl = env.JIRA_SITE_URL?.trim();
  const email = env.JIRA_EMAIL?.trim();
  const apiToken = env.JIRA_API_TOKEN?.trim();
  if (!siteUrl || !email || !apiToken) return null;
  return { siteUrl, email, apiToken };
}
