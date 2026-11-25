import { parseFigmaFileKey } from "../tokens/fetch-figma.js";
import type { DesignSource } from "../schema/agent-config.js";

export type ConnectionStatus = "pass" | "fail" | "skip";

export interface ConnectionCheck {
  id: string;
  title: string;
  status: ConnectionStatus;
  detail: string;
  fix?: string;
}

export interface ConnectionTestDeps {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
}

function resolveDesignSource(
  opts: { designSource?: DesignSource },
  env: NodeJS.ProcessEnv,
): DesignSource {
  if (opts.designSource) return opts.designSource;
  if (env.DESIGN_SOURCE === "stitch") return "stitch";
  if (env.DESIGN_SOURCE === "screenshot") return "screenshot";
  return "figma";
}

/**
 * Live (or mocked) design-source + Jira connectivity checks.
 * Never logs secret values.
 */
export async function runConnectionTests(
  opts: {
    figmaFileUrl?: string;
    jiraSiteUrl?: string;
    jiraProjectKey?: string;
    /** Skip live Figma API when design source is Stitch or Screenshots. */
    skipFigma?: boolean;
    designSource?: DesignSource;
  },
  deps: ConnectionTestDeps = {},
): Promise<ConnectionCheck[]> {
  const env = deps.env ?? process.env;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const results: ConnectionCheck[] = [];

  const designSource = resolveDesignSource(opts, env);
  const skipFigma =
    Boolean(opts.skipFigma) ||
    designSource === "stitch" ||
    designSource === "screenshot";

  const figmaToken = env.FIGMA_ACCESS_TOKEN || env.FIGMA_TOKEN || env.FIGMA_API_KEY;
  const figmaUrl = opts.figmaFileUrl || env.FIGMA_FILE_URL || env.STITCH_FILE_URL;

  if (designSource === "screenshot") {
    results.push({
      id: "figma-api",
      title: "Figma API",
      status: "skip",
      detail: "Skipped — design source is Screenshots (use screenshot-to-rn MCP)",
    });
    const gemini = env.GEMINI_API_KEY?.trim();
    if (gemini) {
      results.push({
        id: "gemini-key",
        title: "Gemini API key",
        status: "pass",
        detail: "GEMINI_API_KEY is set (value not shown)",
      });
    } else {
      results.push({
        id: "gemini-key",
        title: "Gemini API key",
        status: "fail",
        detail: "No GEMINI_API_KEY in env",
        fix: "Add GEMINI_API_KEY to .env for screenshot / recording → RN (backend + MCP)",
      });
    }
    const ws = env.SCREENSHOT_TO_CODE_WS_URL?.trim() || "ws://127.0.0.1:7001";
    results.push({
      id: "screenshot-backend",
      title: "Screenshot-to-code backend",
      status: "skip",
      detail: `Configured WS ${ws} — start backend, then MCP tool ping_backend`,
      fix: "cd vendor-screenshot-to-code/backend && poetry run uvicorn main:app --port 7001",
    });
  } else if (skipFigma) {
    results.push({
      id: "figma-api",
      title: "Figma API",
      status: "skip",
      detail: "Skipped — design source is Stitch (use screenshots + Tailwind export)",
    });
  } else if (!figmaToken) {
    results.push({
      id: "figma-api",
      title: "Figma API",
      status: "fail",
      detail: "No FIGMA_ACCESS_TOKEN / FIGMA_TOKEN in env",
      fix: "Create a token at https://www.figma.com/developers/api#access-tokens and put it in .env as FIGMA_ACCESS_TOKEN=",
    });
  } else if (!figmaUrl) {
    results.push({
      id: "figma-api",
      title: "Figma API",
      status: "fail",
      detail: "Token present but no FIGMA_FILE_URL / figma.fileUrl",
      fix: "Set FIGMA_FILE_URL in .env or figma.fileUrl in .agent/config.json",
    });
  } else {
    try {
      const key = parseFigmaFileKey(figmaUrl);
      const res = await fetchImpl(`https://api.figma.com/v1/files/${key}?depth=1`, {
        headers: { "X-Figma-Token": figmaToken },
      });
      if (res.ok) {
        results.push({
          id: "figma-api",
          title: "Figma API",
          status: "pass",
          detail: `Fetched file ${key}`,
        });
      } else {
        results.push({
          id: "figma-api",
          title: "Figma API",
          status: "fail",
          detail: `HTTP ${res.status}`,
          fix:
            res.status === 403 || res.status === 401
              ? "Token invalid or missing file access — regenerate at https://www.figma.com/developers/api#access-tokens"
              : `Check FIGMA_FILE_URL and token (status ${res.status})`,
        });
      }
    } catch (e) {
      results.push({
        id: "figma-api",
        title: "Figma API",
        status: "fail",
        detail: e instanceof Error ? e.message : String(e),
        fix: "Use a valid https://www.figma.com/design/... URL and network access",
      });
    }
  }

  const site = opts.jiraSiteUrl || env.JIRA_SITE_URL;
  const email = env.JIRA_EMAIL;
  const token = env.JIRA_API_TOKEN;
  const projectKey = opts.jiraProjectKey || env.JIRA_PROJECT_KEY;

  if (!site || !email || !token) {
    results.push({
      id: "jira-api",
      title: "Jira API",
      status: "fail",
      detail: "Missing JIRA_SITE_URL and/or JIRA_EMAIL and/or JIRA_API_TOKEN",
      fix: "Create an API token at https://id.atlassian.com/manage-profile/security/api-tokens and set all three in .env",
    });
  } else if (!projectKey) {
    results.push({
      id: "jira-api",
      title: "Jira API",
      status: "fail",
      detail: "Credentials present but no JIRA_PROJECT_KEY / jira.projectKey",
      fix: "Set JIRA_PROJECT_KEY in .env (e.g. KAN)",
    });
  } else {
    try {
      const auth = Buffer.from(`${email}:${token}`).toString("base64");
      const base = site.replace(/\/$/, "");
      const res = await fetchImpl(
        `${base}/rest/api/3/project/${encodeURIComponent(projectKey)}`,
        {
          headers: {
            Authorization: `Basic ${auth}`,
            Accept: "application/json",
          },
        },
      );
      if (res.ok) {
        results.push({
          id: "jira-api",
          title: "Jira API",
          status: "pass",
          detail: `Project ${projectKey} reachable`,
        });
      } else {
        results.push({
          id: "jira-api",
          title: "Jira API",
          status: "fail",
          detail: `HTTP ${res.status}`,
          fix:
            res.status === 401 || res.status === 403
              ? "Check email + API token at https://id.atlassian.com/manage-profile/security/api-tokens"
              : res.status === 404
                ? `Project key "${projectKey}" not found — verify JIRA_PROJECT_KEY`
                : `Jira returned ${res.status} — check site URL (https://your-domain.atlassian.net)`,
        });
      }
    } catch (e) {
      results.push({
        id: "jira-api",
        title: "Jira API",
        status: "fail",
        detail: e instanceof Error ? e.message : String(e),
        fix: "Check JIRA_SITE_URL and network access",
      });
    }
  }

  return results;
}

export function connectionsHaveFailures(checks: ConnectionCheck[]): boolean {
  return checks.some((c) => c.status === "fail");
}
