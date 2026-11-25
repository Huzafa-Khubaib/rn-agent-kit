---
name: bug-triage
description: >-
  Use when the user reports a bug, crash, or wrong behavior. Interviews briefly,
  reproduces with a failing test first, fixes, verifies.
globs: "**/*.{ts,tsx,js,jsx}"
alwaysApply: false
---

# Bug Triage

1. Ask ONE at a time (skip what is already known): what happens vs what should happen, which screen, Android/iOS/both, steps to reproduce, error text or logs, since when (recent change?).
2. Find the likely cause in the code. Say what you found before changing anything.
3. Write a failing test first (Jest/RNTL for logic and components, Maestro for user flows). Run it and confirm RED. If it passes, the test does not reproduce the bug: fix the test.
4. Make the smallest fix. No unrelated refactors, no new libraries without asking.
5. Confirm GREEN, run `rn-agentic-dev verify`, and check nearby flows for regressions.
6. Report: root cause, fix, tests added, verify result. Ask if the user wants a Jira ticket for it.
