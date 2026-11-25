---
name: rn-agent-router
description: ALWAYS run first on every user message in this project. Detects what the user wants (new feature, bug fix, Jira ticket, design tokens, verify) and starts the correct kit workflow, so the user never has to write a detailed prompt.
globs: "**/*"
alwaysApply: true
---

# RN Agent Router

The user may type anything, short or vague. Your job is to guide, not to wait for a perfect prompt.

## Step 0: Health check (silent unless something is wrong)
If .agent/config.json is missing or `doctor` shows design/Jira not connected, tell the user in one line and offer to run `npx rn-agentic-dev doctor`. Do not block bug fixes or verification on missing Figma/Jira/Screenshots.

## Step 1: Detect intent
Check in this order:
1. Message contains a Jira key (e.g. APP-123): start skill `ticket-to-code`.
2. Message contains a Figma or Stitch link, uploads screenshots/recordings, or says new feature/screen/module: start skill `feature-grill` (grill asks **Figma / Stitch / Screenshots** if unclear).
3. Message describes a bug, crash, error, wrong behavior, or pastes a stack trace: start skill `bug-triage`.
4. Message is about design tokens, theme, or matching the design: start the design skills (Figma MCP / Stitch Tailwind / Screenshots palette — ask which).
5. Message asks to check, verify, or review changes: run `rn-agentic-dev verify`.
6. Anything else or unclear: show the menu below.

If two intents conflict, ask ONE short question to choose.

## Step 2: Menu (when unclear)
Show exactly this, then wait:
What would you like to do?
1. New feature (Figma / Stitch / Screenshots + PRD)
2. Fix a bug
3. Implement a Jira ticket (send the ticket number)
4. Sync design tokens (Figma / Stitch / Screenshots)
5. Verify current changes
6. Something else / help

## Step 3: Hand over
Tell the user in one line which workflow is starting and why, then follow that skill completely. Ask for missing inputs one at a time (for a feature: design source Figma vs Stitch vs Screenshots, then link or shots, then PRD).

## Rules
- Never ask the user to write a better prompt.
- Never start coding before the chosen workflow's gates (grill, plan-review, approval) are done.
- One question per message.
- Reply in the user's language and style.
- If the user's message is a plain question (not a task), answer it normally and do not start a workflow.
