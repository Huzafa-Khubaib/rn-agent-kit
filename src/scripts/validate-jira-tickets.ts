/**
 * CLI: validate prd-to-jira ticket markdown.
 *
 *   npx tsx src/scripts/validate-jira-tickets.ts
 *   npx tsx src/scripts/validate-jira-tickets.ts --dir .agent/jira-tickets
 *   npx tsx src/scripts/validate-jira-tickets.ts --map .agent/jira-map.json
 *   npx tsx src/scripts/validate-jira-tickets.ts --live --key APP-123
 */
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { validateLiveIssues } from "../jira/live-validate.js";
import { ticketsFromMap, validateTickets, type JiraMapFile } from "../jira/validate.js";

const HELP = `Usage: validate-jira-tickets [--dir <path>] [--map <jira-map.json>] [--live] [--key KEY]

  --dir   Folder of <KEY>.md ticket dumps (default: .agent/jira-tickets)
  --map   Also validate inline body/description fields on .agent/jira-map.json
  --live  Fetch issue(s) from Jira REST (needs JIRA_* env)
  --key   Issue key for --live (repeatable via comma list)
  -h      Show help

Exits 1 if any ticket is missing a Figma link, Acceptance Criteria, or testIDs.
`;

export async function runValidateJiraTickets(argv: string[], cwd = process.cwd()): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      dir: { type: "string" },
      map: { type: "string" },
      live: { type: "boolean", default: false },
      key: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    console.log(HELP);
    return 0;
  }

  if (values.live) {
    const keys = (values.key ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (keys.length === 0 && values.map) {
      try {
        const map = JSON.parse(await readFile(resolve(cwd, values.map), "utf8")) as JiraMapFile & {
          epic?: { key?: string };
          stories?: Record<string, { key?: string; subtasks?: Record<string, { key?: string }> }>;
        };
        if (map.epic?.key) keys.push(map.epic.key);
        for (const s of Object.values(map.stories ?? {})) {
          if (s.key) keys.push(s.key);
          for (const sub of Object.values(s.subtasks ?? {})) {
            if (sub.key) keys.push(sub.key);
          }
        }
      } catch (e) {
        console.error(`✖ Cannot read map for --live: ${(e as Error).message}`);
        return 1;
      }
    }
    if (keys.length === 0) {
      console.error("✖ --live requires --key APP-123 or --map with keys");
      return 1;
    }
    try {
      const result = await validateLiveIssues(keys);
      console.log(`Checked ${result.checked} live ticket(s).`);
      if (result.ok) {
        console.log("✔ Live tickets include Figma link, Acceptance Criteria, and testIDs.");
        return 0;
      }
      for (const issue of result.issues) {
        console.error(`✖ [${issue.code}] ${issue.file}: ${issue.message}`);
      }
      return 1;
    } catch (e) {
      console.error(`✖ ${e instanceof Error ? e.message : String(e)}`);
      return 1;
    }
  }

  const tickets: Array<{ file: string; body: string }> = [];
  const dir = resolve(cwd, values.dir ?? ".agent/jira-tickets");

  try {
    const entries = await readdir(dir);
    for (const name of entries) {
      if (!name.endsWith(".md")) continue;
      const file = join(dir, name);
      tickets.push({ file, body: await readFile(file, "utf8") });
    }
  } catch {
    // dir optional when --map provides bodies
  }

  if (values.map) {
    const mapPath = resolve(cwd, values.map);
    try {
      const map = JSON.parse(await readFile(mapPath, "utf8")) as JiraMapFile;
      tickets.push(...ticketsFromMap(map));
    } catch (e) {
      console.error(`✖ Cannot read map ${values.map}: ${(e as Error).message}`);
      return 1;
    }
  }

  if (tickets.length === 0) {
    console.error(
      `✖ No tickets found. Dump issue descriptions to ${values.dir ?? ".agent/jira-tickets"}/*.md or pass --map with inline bodies.`,
    );
    return 1;
  }

  const result = validateTickets(tickets);
  console.log(`Checked ${result.checked} ticket(s).`);
  if (result.ok) {
    console.log("✔ All tickets include Figma link, Acceptance Criteria, and testIDs.");
    return 0;
  }

  for (const issue of result.issues) {
    console.error(`✖ [${issue.code}] ${issue.file}: ${issue.message}`);
  }
  console.error(
    `\n${result.issues.length} issue(s). Fix tickets (see templates/jira-ticket.md) and re-run.`,
  );
  return 1;
}

const entryPath = process.argv[1] ?? "";
if (
  /validate-jira-tickets\.(ts|js|mjs|cjs)$/.test(entryPath) &&
  import.meta.url === pathToFileURL(entryPath).href
) {
  runValidateJiraTickets(process.argv.slice(2)).then((code) => process.exit(code));
}
