import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { doctorCommand } from "./commands/doctor.js";
import { connectCommand } from "./commands/connect.js";
import { updateCommand } from "./commands/update.js";
import { intakeCommand } from "./commands/intake.js";
import { jiraSyncCommand } from "./commands/jira-sync.js";
import { coverageCommand } from "./commands/coverage.js";
import { verifyCommand } from "./commands/verify.js";
import { runCli as runTokensCli } from "./scripts/figma-tokens.js";
import { runValidateJiraTickets } from "./scripts/validate-jira-tickets.js";

function readPackageVersion(): string {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const program = new Command();

program
  .name("rn-agentic-dev")
  .description(
    "Install React Native agent skills into Claude, Cursor, Windsurf, Copilot, and AGENTS.md",
  )
  .version(readPackageVersion());

program
  .command("init")
  .description("Scaffold or detect a RN project and install agent skills")
  .option("-y, --yes", "Non-interactive defaults (no prompts)")
  .option("--type <kind>", "new | existing")
  .option("--stack <stack>", "expo | cli")
  .option("--name <name>", "Project name when --type new")
  .option("-t, --tools <list>", "Comma-separated tools: claude,cursor,agents-md,copilot,windsurf")
  .option("-a, --adapters <list>", "Alias of --tools (claude,cursor,agents-md,copilot,windsurf)")
  .option("--sdlc", "Install Figma|Stitch|Screenshots → Jira → Maestro → CI workflow")
  .option("--design-source <source>", "figma | stitch | screenshot (with --sdlc)")
  .option("--jira-url <url>", "JIRA_SITE_URL (with --sdlc)")
  .option("--jira-key <key>", "JIRA_PROJECT_KEY (with --sdlc)")
  .option("--jira-email <email>", "JIRA_EMAIL — prefer interactive; written to .env only")
  .option("--figma-url <url>", "FIGMA_FILE_URL or STITCH_FILE_URL (with --sdlc)")
  .option("--github-repo <repo>", "GitHub owner/name (with --sdlc)")
  .option(
    "--claude-hook",
    "Also install Claude Code UserPromptSubmit hook (opt-in; CLAUDE.md is default always-on)",
  )
  .option("--cwd <path>", "Working directory", process.cwd())
  .action(
    async (opts: {
      yes?: boolean;
      type?: string;
      stack?: string;
      name?: string;
      tools?: string;
      adapters?: string;
      sdlc?: boolean;
      designSource?: string;
      jiraUrl?: string;
      jiraKey?: string;
      jiraEmail?: string;
      figmaUrl?: string;
      githubRepo?: string;
      claudeHook?: boolean;
      cwd: string;
    }) => {
      const type = opts.type === "new" || opts.type === "existing" ? opts.type : undefined;
      const stack = opts.stack === "expo" || opts.stack === "cli" ? opts.stack : undefined;
      const split = (v?: string) =>
        v
          ?.split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      const designSource =
        opts.designSource === "stitch" ||
        opts.designSource === "figma" ||
        opts.designSource === "screenshot"
          ? opts.designSource
          : undefined;

      // Tokens from env for --yes only (never required as CLI flags — avoids shell history).
      const jiraApiToken = process.env.JIRA_API_TOKEN;
      const figmaAccessToken = process.env.FIGMA_ACCESS_TOKEN ?? process.env.FIGMA_TOKEN;

      await initCommand({
        cwd: opts.cwd,
        yes: opts.yes,
        type,
        stack,
        name: opts.name,
        tools: split(opts.tools) ?? split(opts.adapters),
        sdlc: opts.sdlc,
        designSource,
        jiraUrl: opts.jiraUrl,
        jiraKey: opts.jiraKey,
        jiraEmail: opts.jiraEmail ?? process.env.JIRA_EMAIL,
        jiraApiToken,
        figmaUrl: opts.figmaUrl,
        figmaAccessToken,
        geminiApiKey: process.env.GEMINI_API_KEY,
        githubRepo: opts.githubRepo,
        claudeHook: opts.claudeHook,
      });
    },
  );

program
  .command("doctor")
  .description(
    "Check Node, git, Android/Xcode, Maestro, MCP, env tokens, .agent/config.json (+ adapters)",
  )
  .option("--cwd <path>", "Target project directory", process.cwd())
  .option("--skip-adapters", "Only run environment checks")
  .option("--connections", "Also run live Figma + Jira API connection tests")
  .action(async (opts: { cwd: string; skipAdapters?: boolean; connections?: boolean }) => {
    await doctorCommand({
      cwd: opts.cwd,
      skipAdapters: opts.skipAdapters,
      connections: opts.connections,
    });
  });

program
  .command("connect")
  .description(
    "Guided setup: Figma | Stitch | Screenshots + Jira → merge MCP → live connection tests",
  )
  .option("-y, --yes", "Non-interactive (use flags + env; skip prompts)")
  .option("--skip-test", "Skip live API tests")
  .option("--design-source <source>", "figma | stitch | screenshot")
  .option("--figma-mode <mode>", "stdio | remote (Figma only)", "stdio")
  .option(
    "--screenshot-mcp-mode <mode>",
    "stdio | remote (Screenshots design source)",
    "stdio",
  )
  .option("--screenshot-mcp-url <url>", "Hosted MCP URL (https://….onrender.com/mcp)")
  .option("--windsurf-global", "Also merge Windsurf global MCP config (ask in interactive)")
  .option("-t, --tools <list>", "Comma-separated: claude,cursor,agents-md,copilot,windsurf")
  .option("--jira-url <url>", "JIRA_SITE_URL")
  .option("--jira-key <key>", "JIRA_PROJECT_KEY")
  .option("--jira-email <email>", "JIRA_EMAIL")
  .option("--figma-url <url>", "FIGMA_FILE_URL or STITCH_FILE_URL")
  .option("--cwd <path>", "Working directory", process.cwd())
  .action(
    async (opts: {
      yes?: boolean;
      skipTest?: boolean;
      designSource?: string;
      figmaMode?: string;
      screenshotMcpMode?: string;
      screenshotMcpUrl?: string;
      windsurfGlobal?: boolean;
      tools?: string;
      jiraUrl?: string;
      jiraKey?: string;
      jiraEmail?: string;
      figmaUrl?: string;
      cwd: string;
    }) => {
      const figmaMode =
        opts.figmaMode === "remote" || opts.figmaMode === "stdio" ? opts.figmaMode : "stdio";
      const designSource =
        opts.designSource === "stitch" ||
        opts.designSource === "figma" ||
        opts.designSource === "screenshot"
          ? opts.designSource
          : undefined;
      const screenshotToRnMode =
        opts.screenshotMcpMode === "remote" || opts.screenshotMcpMode === "stdio"
          ? opts.screenshotMcpMode
          : process.env.SCREENSHOT_TO_RN_MCP_URL
            ? "remote"
            : "stdio";
      await connectCommand({
        cwd: opts.cwd,
        yes: opts.yes,
        skipTest: opts.skipTest,
        designSource,
        figmaMode,
        windsurfGlobal: opts.windsurfGlobal,
        tools: opts.tools
          ?.split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        jiraUrl: opts.jiraUrl,
        jiraKey: opts.jiraKey,
        jiraEmail: opts.jiraEmail ?? process.env.JIRA_EMAIL,
        jiraApiToken: process.env.JIRA_API_TOKEN,
        figmaUrl: opts.figmaUrl,
        figmaAccessToken: process.env.FIGMA_ACCESS_TOKEN ?? process.env.FIGMA_TOKEN,
        geminiApiKey: process.env.GEMINI_API_KEY,
        screenshotsDir: process.env.SCREENSHOTS_DIR,
        screenshotToRnMcpCwd: process.env.SCREENSHOT_TO_RN_MCP_CWD,
        screenshotToCodeWsUrl: process.env.SCREENSHOT_TO_CODE_WS_URL,
        screenshotToRnMode,
        screenshotToRnRemoteUrl:
          opts.screenshotMcpUrl ?? process.env.SCREENSHOT_TO_RN_MCP_URL,
        screenshotToRnMcpApiKey:
          process.env.SCREENSHOT_TO_RN_MCP_API_KEY ?? process.env.MCP_API_KEY,
      });
    },
  );

program
  .command("update")
  .description("Refresh installed skills without touching user content outside markers")
  .option("-y, --yes", "If nothing installed yet, update all adapters")
  .option(
    "-a, --adapters <list>",
    "Comma-separated adapters (claude,cursor,agents-md,copilot,windsurf)",
  )
  .option(
    "--claude-hook",
    "Also install/refresh Claude Code UserPromptSubmit hook (opt-in)",
  )
  .option("--cwd <path>", "Target project directory", process.cwd())
  .action(async (opts: { adapters?: string; cwd: string; yes?: boolean; claudeHook?: boolean }) => {
    await updateCommand({
      cwd: opts.cwd,
      yes: opts.yes,
      claudeHook: opts.claudeHook,
      adapters: opts.adapters
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  });

program
  .command("tokens")
  .description("Design token pipeline: build | generate | check | fetch")
  .allowUnknownOption()
  .helpOption(false)
  .argument("[args...]", "Passed through to figma-tokens")
  .action(async () => {
    const idx = process.argv.findIndex((a) => a === "tokens");
    const args = idx >= 0 ? process.argv.slice(idx + 1) : [];
    const code = await runTokensCli(args);
    process.exitCode = code;
  });

program
  .command("jira-validate")
  .description("Validate prd-to-jira ticket markdown (Figma link, AC, testIDs)")
  .option("--dir <path>", "Folder of <KEY>.md dumps", ".agent/jira-tickets")
  .option("--map <path>", "Also validate inline bodies on jira-map.json")
  .option("--live", "Fetch live Jira issues (needs JIRA_* env)")
  .option("--key <keys>", "Comma-separated issue keys for --live")
  .option("--cwd <path>", "Working directory", process.cwd())
  .action(async (opts: { dir?: string; map?: string; live?: boolean; key?: string; cwd: string }) => {
    const args = ["--dir", opts.dir ?? ".agent/jira-tickets"];
    if (opts.map) args.push("--map", opts.map);
    if (opts.live) args.push("--live");
    if (opts.key) args.push("--key", opts.key);
    const code = await runValidateJiraTickets(args, opts.cwd);
    process.exitCode = code;
  });

program
  .command("intake")
  .description("Capture Figma/Stitch URL + PRD path into .agent/config.json (no secrets)")
  .option("--figma-url <url>", "Figma or Stitch file URL")
  .option("--prd-path <path>", "PRD file path relative to project")
  .option("-y, --yes", "Non-interactive (requires --figma-url and --prd-path)")
  .option("--cwd <path>", "Working directory", process.cwd())
  .action(async (opts: { figmaUrl?: string; prdPath?: string; yes?: boolean; cwd: string }) => {
    await intakeCommand({
      cwd: opts.cwd,
      figmaUrl: opts.figmaUrl,
      prdPath: opts.prdPath,
      yes: opts.yes,
    });
  });

program
  .command("jira-sync")
  .description("Create/update Jira tickets from an approved feature plan (idempotent)")
  .requiredOption("--slug <slug>", "Feature slug under docs/features/<slug>")
  .option("--dry-run", "Preview only — do not call Jira")
  .option("-y, --yes", "Skip confirmation prompt")
  .option("--cwd <path>", "Working directory", process.cwd())
  .action(async (opts: { slug: string; dryRun?: boolean; yes?: boolean; cwd: string }) => {
    process.exitCode = await jiraSyncCommand({
      cwd: opts.cwd,
      slug: opts.slug,
      dryRun: opts.dryRun,
      yes: opts.yes,
    });
  });

program
  .command("coverage")
  .description("Fail if any AC-n in spec.md lacks a Maestro flow reference (# AC-n)")
  .option("--slug <slug>", "Feature slug (docs/features/<slug>/spec.md)")
  .option("--spec <path>", "Explicit spec.md path")
  .option("--maestro-dir <path>", "Maestro root", "maestro")
  .option("--cwd <path>", "Working directory", process.cwd())
  .action(async (opts: { slug?: string; spec?: string; maestroDir?: string; cwd: string }) => {
    process.exitCode = await coverageCommand({
      cwd: opts.cwd,
      slug: opts.slug,
      specPath: opts.spec,
      maestroDir: opts.maestroDir,
    });
  });

program
  .command("verify")
  .description("Run tsc, eslint, tokens check, jest, and AC coverage — exit 1 on failure")
  .option("--slug <slug>", "Feature slug for coverage (required unless --skip-coverage)")
  .option("--skip-coverage", "Skip AC↔Maestro coverage")
  .option("--skip-tokens", "Skip tokens check")
  .option("--skip-jest", "Skip jest")
  .option("--skip-eslint", "Skip eslint")
  .option("--skip-tsc", "Skip tsc")
  .option("--cwd <path>", "Working directory", process.cwd())
  .action(
    async (opts: {
      slug?: string;
      skipCoverage?: boolean;
      skipTokens?: boolean;
      skipJest?: boolean;
      skipEslint?: boolean;
      skipTsc?: boolean;
      cwd: string;
    }) => {
      process.exitCode = await verifyCommand({
        cwd: opts.cwd,
        slug: opts.slug,
        skipCoverage: opts.skipCoverage,
        skipTokens: opts.skipTokens,
        skipJest: opts.skipJest,
        skipEslint: opts.skipEslint,
        skipTsc: opts.skipTsc,
      });
    },
  );

await program.parseAsync(process.argv);
