---
name: ticket-to-code
description: >-
  Implement a Jira Story (or Epic stories sequentially): fetch ticket →
  jira-validate → tokens sync if needed → Maestro RED first → code → GREEN →
  rn-agentic-dev verify → Jira comment + report. Use when the user says
  "Implement APP-123", "work this ticket", or hands a Jira/Epic key.
  Never write feature code before failing Maestro tests are committed.
  Never add libraries absent from the approved plan.md.
globs: "**/*.{ts,tsx,js,jsx,yaml,yml}"
alwaysApply: false
---

# ticket-to-code

Turn a **Jira Story** into a verified PR. Depends on **prd-to-jira** / `jira-sync`, **maestro-e2e**, **rn-architecture**, **rn-typescript-react**, **figma-to-tokens**, **plan-review** (approved libs), and Atlassian + Figma MCP for **reads**.

```
Implement <KEY>
        │
        ▼
Fetch ticket → jira-validate (stop if fail)
        │
        ▼
Tokens sync if Figma/design needs (never hand-edit theme)
        │
        ▼
Branch feature/<KEY>-slug · In Progress
        │
        ▼
STEP A  Maestro (+ Jest) from AC + plan test matrix → must be RED
        │
        ▼
STEP B  Implement (architecture, exact testIDs, theme tokens only)
        │
        ▼
STEP C  GREEN (≤5 fix loops)
        │
        ▼
rn-agentic-dev verify  →  Jira comment + final report (PASS only if verify OK)
```

## Hard rules (strict order)

1. **No feature code before STEP A is committed** (failing tests first).
2. **Never edit a test only to make it pass.** Fix product code, or update Jira AC / plan first.
3. **Exact `testIDs` from the ticket.** Do not invent parallel IDs.
4. **Theme tokens only** — no hardcoded colors/spacing/fonts; never hand-edit generated `tokens.ts` / theme files (use `rn-agentic-dev tokens …`).
5. **Follow `rn-architecture`.** Do **not** add libraries that are not listed as approved in `docs/features/<slug>/plan.md`.
6. **Max 5 fix iterations** in STEP C. Then comment on Jira and stop.
7. **One PR per Story.** Epic → sequential stories.
8. Say **PASS** in the final report **only if** `rn-agentic-dev verify` exits 0.
9. If a **new** Maestro/Jest test is already green before implementation, **flag the test as wrong** and fix the test (it is not asserting real behavior).

## Step 0 — Intake + validate

1. Parse key: `Implement APP-123` or bare `APP-123` / Epic key.
2. **Atlassian MCP** (or Jira REST): fetch issue, parent Epic, siblings (context only).
3. Extract: summary, Gherkin AC, testIDs, TC-IDs, Figma URL/node, API contracts, states, DoD.
4. Locate related `docs/features/<slug>/plan.md` via `.agent/jira-map.json` / approvals when possible.
5. Run:
   ```bash
   npx rn-agentic-dev jira-validate --map .agent/jira-map.json
   # when credentials available:
   npx rn-agentic-dev jira-validate --live --key APP-123
   ```
6. **Stop if validate fails** — comment on Jira asking for AC / Figma / testIDs; do not invent them.
7. **Figma MCP**: open linked node when present.

## Step 1 — Tokens (conditional)

If the ticket has a Figma/Stitch link or design requirements:

```bash
npx rn-agentic-dev tokens fetch --url <figma-url>   # when token available
npx rn-agentic-dev tokens build                     # sync missing/changed only
npx rn-agentic-dev tokens check
```

- Never hand-edit generated theme files.
- If Variables are missing, the CLI warns and falls back to styles — do not fail silently; surface the warning.
- **Screenshots design source:** prefer existing theme tokens; map colors/spacing from `spec.md` / MCP draft into tokens via `tokens build` when a snapshot exists. If `screenshot-to-rn` draft `App.tsx` is linked in Decisions, adapt it into the app architecture (do not dump a second root App). Use `refine_rn_ui` only when visual mismatch remains after implementation.

## Step 2 — Branch + In Progress

```bash
git fetch origin
git checkout -b feature/APP-123-login-screen
```

Transition Story → **In Progress**.

## STEP A — Maestro first (must go RED)

From ticket AC + plan **test matrix**:

1. Write Maestro flows under `maestro/flows/<feature>/` with `# AC-n` comments / tags.
2. Wire selectors to ticket **testIDs** only (**maestro-e2e**).
3. Add failing Jest stubs for critical AC behavior.
4. Run flows/tests — **expect RED**.
5. If already GREEN → tests are wrong; fix assertions before coding product UI.

Commit tests only:

```text
test(APP-123): add failing e2e tests
```

## STEP B — Implement

Only after STEP A commit:

1. `src/features/<feature>/…` per architecture.
2. Exact testIDs; loading/empty/error/offline from ticket.
3. Theme tokens / `useTheme()` only.
4. APIs via services + zod; no unapproved deps.

## STEP C — Green (≤5 loops)

```bash
npx tsc --noEmit
npm run lint
npm test
maestro test maestro/flows/<feature>/…
```

Then:

```bash
npx rn-agentic-dev verify
```

| After verify | Action |
| ------------ | ------ |
| exit 0 | Proceed to report + Jira |
| non-zero | Fix within remaining loops; never claim PASS |

## Final report + Jira

Post a Jira comment and print:

```text
## Report — APP-123
AC covered: AC-1 … (list)
Maestro flows: … → pass/fail
Jest: …
verify: PASS | FAIL
Skipped: … (why)
```

- **PASS** only when `verify` passed.
- Transition → **In Review** when PASS; open PR with key in title.

## Epic mode

Process child Stories one PR at a time (map order).

## Common mistakes

1. Coding before red Maestro.
2. Hand-editing tokens / hardcoding design values.
3. Adding libs not in approved plan.
4. Claiming PASS without `rn-agentic-dev verify`.
5. Weakening tests to go green.

## Done checklist

- [ ] jira-validate passed
- [ ] Tokens synced if needed (no hand edits)
- [ ] STEP A red committed
- [ ] STEP B architecture + testIDs + tokens
- [ ] `rn-agentic-dev verify` PASS
- [ ] Jira comment + report
- [ ] PR / In Review
