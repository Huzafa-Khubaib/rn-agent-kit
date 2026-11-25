# How rn-agentic-dev works

After `init` + `connect`, an **always-on router** (`rn-agent-router`) runs first on every message. You do not need a perfect prompt.

```text
                    ┌─────────────────────┐
                    │  User types anything │
                    └──────────┬──────────┘
                               ▼
                    ┌─────────────────────┐
                    │   rn-agent-router    │
                    │   (always-on)        │
                    └──────────┬──────────┘
           ┌───────────────────┼───────────────────┐
           ▼                   ▼                   ▼
    Jira key (APP-123)   New feature            Bug / crash
           │                   │                   │
           ▼                   ▼                   ▼
     ticket-to-code       feature-grill         bug-triage
                               │
                    ┌──────────┼──────────┐
                    ▼          ▼          ▼
                 Figma      Stitch    Screenshots
              (MCP/shot)  (shot+TW)  (MCP→RN draft)
                    └──────────┬──────────┘
                               ▼
                          plan-review
                               │  (reply: approve)
                               ▼
                           jira-sync
                               │
                               ▼
                         ticket-to-code
                               │
                               ▼
                     rn-agentic-dev verify
```

## Intent order

1. Jira key → `ticket-to-code`
2. Figma/Stitch/Screenshots or “new feature” → `feature-grill` (asks **Figma / Stitch / Screenshots**)
3. Bug / crash / error / stack trace → `bug-triage`
4. Design tokens / theme → design skills (Figma, Stitch, or Screenshots palette)
5. Verify / review → `rn-agentic-dev verify`
6. Unclear → numbered menu

## Design sources (equal)

| Source | Screens | Tokens |
| ------ | ------- | ------ |
| **Figma** | MCP frames, or screenshot + Inspect if rate-limited | MCP / `tokens fetch` |
| **Stitch** | Screenshots (+ optional HTML) | Tailwind export → `figma-to-tokens` Step 1B |
| **Screenshots** | PNGs / recordings via `screenshot-to-rn` MCP | Palette from shots + existing theme |

Pick one per feature; do not mix mid-grill unless the user switches explicitly.

## MCP + secrets

- Secrets live only in `.env` (gitignored).
- Non-secrets live in `.agent/config.json`.
- MCP configs (`.cursor/mcp.json`, `.mcp.json`, `.vscode/mcp.json`, …) reference `${ENV_VAR}` — never raw tokens.
- `rn-agentic-dev connect` merges MCP entries without overwriting existing servers.
- `rn-agentic-dev doctor --connections` re-runs live Figma + Jira API checks.

## Adapter always-on

| Adapter | Mechanism |
| ------- | --------- |
| Cursor | `.mdc` with `alwaysApply: true` |
| Claude Code | Managed `CLAUDE.md` section (router only — tiny); optional `UserPromptSubmit` via `--claude-hook` |
| AGENTS.md / Copilot | Managed markers; router listed first |
| Windsurf | `trigger: always_on` frontmatter on the router rule |

Claude hook is **off by default** (keeps context tiny). Enable with:

```bash
npx rn-agentic-dev init -t claude --claude-hook
# or later:
npx rn-agentic-dev update -a claude --claude-hook
```
