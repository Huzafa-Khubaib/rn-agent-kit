# rn-agentic-dev

**One CLI** that installs React Native / Expo **agent skills** into Claude, Cursor, Copilot, Windsurf, and `AGENTS.md`, plus an optional SDLC workflow with a hard plan-approval gate before Jira.

[![npm](https://img.shields.io/npm/v/rn-agentic-dev.svg)](https://www.npmjs.com/package/rn-agentic-dev)
[npm](https://www.npmjs.com/package/rn-agentic-dev) · Requires **Node.js >= 18** · Setup: [docs/prerequisites.md](./docs/prerequisites.md) · Deep dive: [docs/how-it-works.md](./docs/how-it-works.md)

```bash
npx rn-agentic-dev@latest init
```

---

## Quick start (3 steps)

```text
┌─────────────┐     ┌──────────────┐     ┌─────────────────────────┐
│ 1. init     │────▶│ 2. connect   │────▶│ 3. Restart agent        │
│ skills+SDLC │     │ Figma|Stitch │     │ Type anything → router  │
└─────────────┘     │ + Jira       │     └─────────────────────────┘
                    └──────────────┘
```

```bash
npx rn-agentic-dev@latest init
npx rn-agentic-dev connect          # choose Figma OR Stitch
npx rn-agentic-dev doctor --connections
# Restart Cursor/Claude, then type anything
```

---

## Big picture

```text
                         ┌──────────────────────┐
                         │   User types anything │
                         └──────────┬───────────┘
                                    ▼
                         ┌──────────────────────┐
                         │   rn-agent-router     │
                         │   (always-on)         │
                         └──────────┬───────────┘
   ┌────────────┬─────────────┼──────────┬────────────┐
   ▼            ▼             ▼          ▼            ▼
Jira key   New feature   Bug/crash   Tokens     Verify
   │            │             │          │            │
   ▼            ▼             ▼          ▼            ▼
ticket-to-   feature-     bug-triage  figma-to-   rn-agentic-dev
code         grill            │       tokens      verify
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
        ┌──────────┐                    ┌──────────┐
        │  Figma   │                    │  Stitch  │
        │ MCP/shot │                    │ shot+TW  │
        └────┬─────┘                    └────┬─────┘
             └───────────────┬───────────────┘
                             ▼
                      plan-review
                      (reply: approve)
                             ▼
                       jira-sync
                             ▼
                      ticket-to-code
             tokens → Maestro RED → code → GREEN
                             ▼
                      rn-agentic-dev verify
```

---

## Design source: Figma **or** Stitch **or** Screenshots

Equal options — pick **one** per feature (grill + connect).

```text
                 connect / feature-grill
              ┌────────────┼────────────┐
              ▼            ▼            ▼
           FIGMA        STITCH     SCREENSHOTS
        MCP / token   link+TW     Gemini MCP
              └────────────┬────────────┘
                           ▼
                         Jira
```

| | Figma | Stitch | Screenshots |
|---|--------|--------|-------------|
| Connect | `--design-source figma` | `--design-source stitch` | `--design-source screenshot` |
| Screens | MCP frames / Inspect | Screenshots + CSS/Tailwind | PNGs / recordings → `screenshot-to-rn` |
| Tokens | MCP / `tokens fetch` | Tailwind → `tokens build` | Palette from shots + theme |
| MCP | Figma + Atlassian | Atlassian | screenshot-to-rn + Atlassian |

```bash
# Figma
npx rn-agentic-dev connect --yes --design-source figma \
  --figma-url 'https://www.figma.com/design/AbC/App' \
  --jira-url https://acme.atlassian.net --jira-key KAN
# (FIGMA_ACCESS_TOKEN + JIRA_* in env)

# Stitch
npx rn-agentic-dev connect --yes --design-source stitch \
  --figma-url 'https://stitch.example/project/…' \
  --jira-url https://acme.atlassian.net --jira-key KAN
# (JIRA_* in env — no Figma token)

# Screenshots
npx rn-agentic-dev connect --yes --design-source screenshot \
  --jira-url https://acme.atlassian.net --jira-key KAN
# (GEMINI_API_KEY + JIRA_* in env; start vendor-screenshot-to-code backend)
```

---

## Feature workflow (detail)

```text
PRD + (Figma|Stitch|Screenshots)
        │
        ▼
┌─────────────────── feature-grill ───────────────────┐
│ Step 0  pick source → list screens → confirm order  │
│ Step 1  each screen: overview → elements → states   │
│         → "confirm" (1 question / message)          │
│ Step 2  cross-screen (nav, API, a11y, …)            │
└─────────────────────────┬───────────────────────────┘
                          ▼
              docs/features/<slug>/spec.md
              AC-n [Screen]: … · Open items = (none)
                          ▼
┌─────────────────── plan-review ─────────────────────┐
│ plan.md + plan.json · STOP until user: approve      │
│ → .agent/approvals.json                             │
└─────────────────────────┬───────────────────────────┘
                          ▼
              rn-agentic-dev jira-sync --slug <slug>
                          ▼
┌────────────────── ticket-to-code ───────────────────┐
│ tokens → Maestro RED (commit) → implement → GREEN   │
│ → rn-agentic-dev verify → report                      │
└─────────────────────────────────────────────────────┘
```

---

## Secrets vs config

```text
┌─────────────────────────┐     ┌──────────────────────────┐
│ .env  (gitignored)      │     │ .agent/config.json       │
│ DESIGN_SOURCE=figma|…   │     │ designSource             │
│ JIRA_* / FIGMA_* token  │     │ jira.siteUrl, projectKey │
│ STITCH_FILE_URL / …     │     │ figma.fileUrl (either)   │
└─────────────────────────┘     │ NO secrets               │
                                └──────────────────────────┘
```

MCP files (`.cursor/mcp.json`, `.mcp.json`, …) only use `${ENV_VAR}` — never raw tokens.

---

## Install & useful commands

```bash
npx rn-agentic-dev@latest init
npm install -D rn-agentic-dev && npx rn-agentic-dev init

npx rn-agentic-dev connect
npx rn-agentic-dev doctor --connections
npx rn-agentic-dev update -a cursor,claude
npx rn-agentic-dev intake --figma-url <figma-or-stitch-url> --prd-path docs/prd.md
npx rn-agentic-dev jira-sync --slug login --dry-run
npx rn-agentic-dev coverage --slug login
npx rn-agentic-dev verify --slug login
npx rn-agentic-dev tokens build | check | fetch
```

---

## Per-tool adapters

| Tool | Output |
| ---- | ------ |
| Claude | `.claude/skills/` + always-on `CLAUDE.md` |
| Cursor | `.cursor/rules/` (`alwaysApply: true` router) |
| AGENTS.md | managed markers (router first) |
| Copilot | `.github/copilot-instructions.md` |
| Windsurf | `.windsurf/rules/` (`trigger: always_on` router) |

---

## CLI reference

| Command | Role |
| ------- | ---- |
| `init` | Project + adapters + optional SDLC / connect offer |
| `connect` | **Figma or Stitch** + Jira → MCP merge → live tests |
| `intake` | Design URL + PRD → `.agent/config.json` |
| `doctor` | Env/MCP; `--connections` live checks (skips Figma if Stitch) |
| `update` | Refresh skills |
| `jira-sync` / `jira-validate` / `coverage` / `verify` / `tokens` | SDLC gates |

---

## FAQ

**`init --yes` existing app restructure?** No — only after interactive confirm.  
**Hand-edit `tokens.ts`?** No — `tokens build` / `generate`.  
**Jira without approve?** Blocked until `.agent/approvals.json`.  
**Stitch needs Figma token?** No.  
**Figma rate-limited?** Grill uses screenshot + Inspect CSS (no “TBD on re-sync”).

---

## Develop

```bash
npm install && npm test && npm run typecheck && npm run build
```

Versioning: [Changesets](https://github.com/changesets/changesets). License: MIT.
