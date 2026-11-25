/**
 * MCP server stubs for agent configs.
 * Secrets only via ${ENV_VAR} — never inline tokens.
 *
 * Docs (checked at implementation time):
 * - Figma remote MCP: https://mcp.figma.com/mcp
 *   Guide: https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server
 *   Token/API path (Framelink): https://www.npmjs.com/package/figma-developer-mcp
 * - Atlassian API tokens: https://id.atlassian.com/manage-profile/security/api-tokens
 * - screenshot-to-rn hosted: docs/deploy-screenshot-mcp-render.md
 */

export const FIGMA_TOKEN_URL =
  "https://www.figma.com/developers/api#access-tokens";
export const FIGMA_MCP_GUIDE_URL =
  "https://help.figma.com/hc/en-us/articles/32132100833559-Guide-to-the-Figma-MCP-server";
export const FIGMA_REMOTE_MCP_URL = "https://mcp.figma.com/mcp";
export const ATLASSIAN_TOKEN_URL =
  "https://id.atlassian.com/manage-profile/security/api-tokens";

/** Stdio Figma via Framelink (token in env). */
export function figmaStdioServer(): Record<string, unknown> {
  return {
    command: "npx",
    args: ["-y", "figma-developer-mcp", "--stdio"],
    env: {
      FIGMA_API_KEY: "${FIGMA_ACCESS_TOKEN}",
    },
  };
}

/** Remote hosted Figma MCP (OAuth in client — no token in file). */
export function figmaRemoteServer(): Record<string, unknown> {
  return {
    url: FIGMA_REMOTE_MCP_URL,
  };
}

export function atlassianStdioServer(): Record<string, unknown> {
  return {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-atlassian"],
    env: {
      JIRA_URL: "${JIRA_SITE_URL}",
      JIRA_EMAIL: "${JIRA_EMAIL}",
      JIRA_API_TOKEN: "${JIRA_API_TOKEN}",
    },
  };
}

/**
 * Local screenshot-to-code MCP (React Native / Expo stacks).
 * Requires backend on SCREENSHOT_TO_CODE_WS_URL and `pip install -e` of vendor mcp/.
 * Secrets: GEMINI_API_KEY (preferred) via env — never inline.
 */
export function screenshotToRnServer(opts?: {
  /** Absolute path to vendor-screenshot-to-code/mcp */
  mcpCwd?: string;
  /** Prefer ./run_mcp.sh when mcpCwd is set (sets PYTHONPATH). */
  useRunScript?: boolean;
  python?: string;
}): Record<string, unknown> {
  const useScript = Boolean(opts?.mcpCwd) && opts?.useRunScript !== false;
  if (useScript && opts?.mcpCwd) {
    return {
      command: opts.mcpCwd + "/run_mcp.sh",
      env: {
        SCREENSHOT_TO_CODE_WS_URL: "${SCREENSHOT_TO_CODE_WS_URL}",
        GEMINI_API_KEY: "${GEMINI_API_KEY}",
        OPENAI_API_KEY: "${OPENAI_API_KEY}",
        ANTHROPIC_API_KEY: "${ANTHROPIC_API_KEY}",
      },
    };
  }
  return {
    command: opts?.python ?? "python3",
    args: ["-m", "screenshot_to_rn_mcp"],
    ...(opts?.mcpCwd ? { cwd: opts.mcpCwd } : {}),
    env: {
      SCREENSHOT_TO_CODE_WS_URL: "${SCREENSHOT_TO_CODE_WS_URL}",
      GEMINI_API_KEY: "${GEMINI_API_KEY}",
      OPENAI_API_KEY: "${OPENAI_API_KEY}",
      ANTHROPIC_API_KEY: "${ANTHROPIC_API_KEY}",
    },
  };
}

/**
 * Hosted Streamable HTTP MCP (Render / any HTTPS host) — Figma-style `url` connect.
 * Endpoint must expose `/mcp`; optional Bearer via SCREENSHOT_TO_RN_MCP_API_KEY.
 */
export function screenshotToRnRemoteServer(opts: {
  url: string;
}): Record<string, unknown> {
  const url = opts.url.trim().replace(/\/$/, "");
  const withPath = url.endsWith("/mcp") ? url : `${url}/mcp`;
  return {
    url: withPath,
    headers: {
      Authorization: "Bearer ${SCREENSHOT_TO_RN_MCP_API_KEY}",
    },
  };
}

export function buildKitMcpServers(opts: {
  figmaMode?: "stdio" | "remote";
  /** When false (Stitch design source), only Atlassian MCP is merged. */
  includeFigma?: boolean;
  /** When true, merge screenshot-to-rn MCP (Phase 2). */
  includeScreenshotToRn?: boolean;
  /** stdio (local) vs remote hosted URL */
  screenshotToRnMode?: "stdio" | "remote";
  screenshotToRnCwd?: string;
  /** Public MCP base or full …/mcp URL when mode=remote */
  screenshotToRnRemoteUrl?: string;
}): { mcpServers: Record<string, unknown> } {
  const includeFigma = opts.includeFigma !== false;
  const mcpServers: Record<string, unknown> = {
    atlassian: atlassianStdioServer(),
  };
  if (includeFigma) {
    mcpServers.figma =
      opts.figmaMode === "remote" ? figmaRemoteServer() : figmaStdioServer();
  }
  if (opts.includeScreenshotToRn) {
    if (
      opts.screenshotToRnMode === "remote" &&
      opts.screenshotToRnRemoteUrl?.trim()
    ) {
      mcpServers["screenshot-to-rn"] = screenshotToRnRemoteServer({
        url: opts.screenshotToRnRemoteUrl.trim(),
      });
    } else {
      mcpServers["screenshot-to-rn"] = screenshotToRnServer({
        mcpCwd: opts.screenshotToRnCwd,
      });
    }
  }
  return { mcpServers };
}
