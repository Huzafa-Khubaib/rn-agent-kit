---
name: plan-review
description: >-
  Hard approval gate before Jira: after feature-grill, write
  docs/features/<slug>/plan.md (ticket tree, third-party table, test matrix,
  risks). STOP and wait for the user to reply "approve" (or request changes).
  Record approval in .agent/approvals.json. Never create Jira tickets without
  that approval. Use when the user says "plan this feature", "plan-review",
  or after spec.md is ready.
globs: "**/docs/features/**/*.{md,json}"
alwaysApply: false
---

# plan-review

Produce an implementable **plan** from `docs/features/<slug>/spec.md`, then **hard-stop** for human approval before any Jira work.

```
docs/features/<slug>/spec.md
      │
      ▼
docs/features/<slug>/plan.md
      │
      ▼
STOP → user replies "approve" (or change requests)
      │
      ▼
.agent/approvals.json  (record approval)
      │
      ▼
Next: prd-to-jira → `rn-agentic-dev jira-sync` (never invent tickets by hand)
```

## Hard rules

1. **Require `spec.md`.** If missing, send the user back to **feature-grill**.
2. **Refuse while Open items are unresolved.** Parse `## Open items` in `spec.md`. Treat as blocking if there is any real bullet (not `(none)`, `none`, or empty).  
   - **Refuse** to write `plan.md` / continue. Tell the user to finish **feature-grill**.  
   - **Exception:** only if the user explicitly accepts open items with a clear phrase such as **`accept open items`** or **`proceed with open items`**. Record that acceptance under Decisions / approvals notes. Never invent silent acceptance.
3. **Never create Jira tickets** in this skill (no Atlassian MCP create, no `jira-sync`).
4. **Hard gate:** after writing `plan.md`, **STOP** and ask the user to reply **`approve`** or describe changes. Do not proceed until approval is explicit.
5. **Record approval** only after the user says `approve` (case-insensitive). Append/update `.agent/approvals.json`.
6. Prefer **libraries already in the project**. Every new dependency needs a full third-party row + justification.
7. Test matrix must map **every screen-tagged `AC-n`** to ≥1 Maestro flow and note Jest coverage. ACs look like `AC-1 [Login]: …`.
8. **No secrets** in plan or approvals files.

## Step 0 — Load context

1. Resolve `<slug>` from user or path.
2. Read `docs/features/<slug>/spec.md`.
3. **Open items gate** (rule 2). Stop unless empty or user explicitly accepted.
4. Re-scan `package.json` / architecture for library preferences.
5. Read `.agent/config.json` for jira/figma URLs (non-secrets only).

## Step 1 — Write `docs/features/<slug>/plan.md`

### Required sections

#### 1. Feature breakdown

Short summary + link to `spec.md`.

#### 2. Ticket tree

One **parent** (Epic/Story) + **sub-tickets**. Suggested types:

| Sub-ticket | Purpose |
| ---------- | ------- |
| types/API | contracts, zod, client |
| state | Query/Zustand |
| UI components | shared atoms/molecules |
| screen | feature screens |
| navigation | routes / deep links |
| states handling | loading/empty/error/offline |
| tests | Maestro + Jest |
| analytics | events |

Show the tree as nested markdown. Each node: title, scope, linked ACs (`AC-1…`), Figma node if known.

#### 3. Third-party table

| library | purpose | why needed | alternatives considered | Expo-compatible? | native module? | maintenance status | size |
| ------- | ------- | ---------- | ----------------------- | ---------------- | -------------- | ------------------ | ---- |

- Prefer existing deps (mark `already installed`).
- New deps: fill every column; if none needed, say so explicitly.

#### 4. Test matrix

| AC | Maestro flow(s) | Jest | Notes |
| -- | --------------- | ---- | ----- |

Must include scenarios for:

- Happy path
- Validation errors
- Network failure
- Empty
- Loading
- Permission denied
- Back navigation
- Background / resume

Maestro paths: `maestro/flows/<slug>/…` with comments/tags like `# AC-3`.

#### 5. Risks

Technical, product, schedule, compliance.

#### 6. Out of scope

Copied/refined from spec; explicit non-goals.

## Step 2 — STOP (approval gate)

Print:

```text
Plan ready: docs/features/<slug>/plan.md

Reply:
  approve     — record approval and allow jira-sync
  <changes>   — describe edits; I will revise plan.md and stop again

I will NOT create Jira tickets until you reply "approve".
```

**Do not** call tools that create issues while waiting.

## Step 3 — On `approve`

1. Ensure `plan.md` is the approved revision (if user asked for edits earlier, those must already be applied).
2. Update `.agent/approvals.json` (create if missing):

```json
{
  "version": 1,
  "approvals": [
    {
      "slug": "<slug>",
      "planPath": "docs/features/<slug>/plan.md",
      "specPath": "docs/features/<slug>/spec.md",
      "approvedAt": "<ISO-8601>",
      "approvedBy": "user",
      "phrase": "approve"
    }
  ]
}
```

Merge by `slug` (replace prior approval for same slug). Never store secrets.

3. Tell the user next step:

```text
Approved. Next:
  npx rn-agentic-dev jira-sync --slug <slug>
  # or ask the agent to run prd-to-jira (which must call jira-sync)
```

## On change requests

- Edit `plan.md` only.
- Do **not** write approvals.
- STOP again with the same approve prompt.

## Common mistakes

1. Creating Jira before approval.
2. Skipping third-party justification for new libs.
3. Test matrix missing some ACs or edge scenarios.
4. Approving silently without user `approve` phrase.
5. Overwriting unrelated entries in `.agent/approvals.json`.

## Done checklist

- [ ] `spec.md` complete (no open items)
- [ ] `plan.md` with tree, third-party table, test matrix, risks, out-of-scope
- [ ] Hard stop + user `approve`
- [ ] `.agent/approvals.json` updated
- [ ] User pointed at **prd-to-jira** / `jira-sync`
