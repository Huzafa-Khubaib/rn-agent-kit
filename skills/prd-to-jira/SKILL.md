---
name: prd-to-jira
description: >-
  Sync an approved feature plan to Jira via `rn-agentic-dev jira-sync` (never
  create tickets by hand / raw MCP create). Requires docs/features/<slug>/plan.md
  plus approval in .agent/approvals.json from plan-review. Use when the user
  says "create Jira tickets", "jira-sync", "sync the plan", or after plan-review
  approval. Tokens via figma-to-tokens if missing.
globs: "**/{.agent/**,docs/features/**,design/**,*.md,prd/**}"
alwaysApply: false
---

# prd-to-jira

Push an **approved** `plan.md` into Jira using the CLI — not ad-hoc MCP ticket creation.

```
feature-grill → plan-review (approve)
      │
      ▼
Require: docs/features/<slug>/plan.md
         .agent/approvals.json entry for <slug>
      │  (1) figma-to-tokens if design/tokens.json missing
      │  (2) preview: rn-agentic-dev jira-sync --slug <slug> --dry-run
      │  (3) create:  rn-agentic-dev jira-sync --slug <slug>
      ▼
.agent/jira-map.json  (idempotent)
      │
      ▼
npx rn-agentic-dev jira-validate …
Suggested: Implement <STORY-KEY>
```

Cite **`rn-agentic-dev jira-sync`**, **figma-to-tokens**, and Jira REST (implemented by the CLI). Atlassian MCP is for **reading** issues later (`ticket-to-code`), not for inventing the tree here.

## Hard rules

1. **Approved plan required.** If `docs/features/<slug>/plan.md` is missing, or `.agent/approvals.json` has no approval for `<slug>`, stop and send the user to **plan-review**.
2. **Never create tickets by hand** (no Atlassian MCP `createIssue` / bulk create). Always call:
   ```bash
   npx rn-agentic-dev jira-sync --slug <slug> [--dry-run]
   ```
3. **Never invent screens or tokens.** Missing `design/tokens.json` → run **figma-to-tokens** / `tokens build` first.
4. **Idempotency** is owned by `jira-sync` + `.agent/jira-map.json`. Do not bypass the map.
5. **No secrets** in tickets or map files.
6. After sync, run `npx rn-agentic-dev jira-validate` (and `--live` when credentials exist).
7. Ticket bodies must still satisfy `templates/jira-ticket.md` (Figma link or `NEEDS_FIGMA`, AC, testIDs, TC-IDs, DoD) — `jira-sync` / plan content must supply these.

## Pre-flight

1. Resolve `<slug>` from the user.
2. Verify files:
   - `docs/features/<slug>/spec.md`
   - `docs/features/<slug>/plan.md`
   - `.agent/approvals.json` contains an approval for this slug
3. Read `.agent/config.json`: `jira.siteUrl`, `jira.projectKey`, `figma.fileUrl`.
4. Ensure env (never print values): `JIRA_SITE_URL` / config site, `JIRA_EMAIL`, `JIRA_API_TOKEN`.
5. If `design/tokens.json` missing → **figma-to-tokens** then continue.

## Step 1 — Dry-run preview

```bash
npx rn-agentic-dev jira-sync --slug <slug> --dry-run
```

Show the preview to the user. If they want edits, update `plan.md` via **plan-review** (re-approve) — do not patch Jira ad-hoc.

## Step 2 — Sync

```bash
npx rn-agentic-dev jira-sync --slug <slug>
```

Confirm `.agent/jira-map.json` updated (epic + stories + subtasks keys).

## Step 3 — Validate

```bash
npx rn-agentic-dev jira-validate --map .agent/jira-map.json
# optional live:
npx rn-agentic-dev jira-validate --live --map .agent/jira-map.json
```

Fix failures before finishing (usually by updating plan content and re-running sync).

## Step 4 — Finish

```text
Epic: <KEY>
Map:  .agent/jira-map.json

Suggested next command:
  Implement <STORY-KEY>
```

Point at **ticket-to-code**.

## Common mistakes

1. Creating issues with Atlassian MCP instead of `jira-sync`.
2. Syncing without plan-review approval.
3. Skipping `--dry-run` preview on first sync.
4. Ignoring validator failures.
5. Putting API tokens in ticket descriptions.

## Done checklist

- [ ] Approval present for slug
- [ ] Tokens present / linked
- [ ] `jira-sync --dry-run` shown
- [ ] `jira-sync` succeeded
- [ ] `jira-validate` passes
- [ ] User saw Implement &lt;KEY&gt;
