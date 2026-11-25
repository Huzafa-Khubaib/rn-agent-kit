---
name: github-actions-ci
description: >-
  Wire GitHub Actions for RN/Expo apps from rn-agentic-dev templates: CI (tsc,
  eslint, jest, tokens check), Android Maestro E2E on PRs, iOS Maestro on
  main/nightly/manual, optional EAS build. Use when adding CI, fixing workflows,
  configuring secrets, or after init --sdlc. Prefer templates/workflows/*;
  pin action versions; use concurrency + caches.
globs: "**/.github/workflows/*.{yml,yaml}"
alwaysApply: false
---

# github-actions-ci

Copy and adapt workflows from **`templates/workflows/`** into the app repo’s `.github/workflows/`. Cite **GitHub Actions** docs, **Maestro**, **Expo EAS**, and this kit’s `tokens check` / `maestro-e2e` skills.

## Hard rules

1. Prefer the kit templates; do not invent unpinned `uses: some-action@main`.
2. Keep **concurrency groups** so superseded PR runs cancel.
3. Cache **npm**, **Gradle**, and **CocoaPods** where those jobs run.
4. **Never** commit secrets — only `secrets.*` / `vars.*`.
5. Parse Jira keys from branch names (`feature/APP-123-…`) for ticket comments; skip quietly if no key / no `JIRA_*` secrets.
6. **`eas-build.yml` is optional** — only copy it if the team uses EAS; otherwise omit it.
7. Tokens gate: if `design/source-snapshot.json` exists, CI must run `rn-agentic-dev tokens check` (or `npm run tokens -- check`) and **fail on drift**.

## Workflow map

| File              | Trigger                                        | Purpose                                                                                                                                      |
| ----------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`          | `pull_request` (+ push main)                   | Node setup + cache → install → `tsc --noEmit` → eslint → jest coverage → **tokens check** → PR sticky comment → Jira comment                 |
| `e2e-android.yml` | `pull_request`                                 | KVM → emulator (`reactivecircus/android-emulator-runner`) → debug APK → Maestro → artifacts (junit, screenshots, debug) → PR + Jira comments |
| `e2e-ios.yml`     | push `main`, nightly cron, `workflow_dispatch` | macOS simulator build → Maestro → artifacts. **Not on every PR** (cost).                                                                     |
| `eas-build.yml`   | **optional** manual / `v*` tags                | `eas build` (+ optional submit). Skip if unused.                                                                                             |

`init --sdlc` copies `templates/workflows/*` into `.github/workflows/`.

## Install into a consumer app

```bash
mkdir -p .github/workflows
cp node_modules/rn-agentic-dev/templates/workflows/*.yml .github/workflows/
# or from a cloned kit / after init --sdlc
```

Adjust:

- `APP_ID` via repo **Variable** `APP_ID` (bundle id / applicationId).
- Expo vs CLI: templates auto-detect `app.config.*` / `app.json` vs bare `android/`.
- Jest script must accept `--coverage` (default Vitest/Jest both do with `--`).

## CI job details (`ci.yml`)

Order matters for fast fail:

1. `actions/checkout@v4.2.2`
2. `actions/setup-node@v4.2.0` + `cache: npm`
3. `npm ci`
4. `npx tsc --noEmit`
5. `npm run lint`
6. `npm test -- --coverage …`
7. Tokens: `rn-agentic-dev tokens check` when snapshot present
8. Sticky PR comment (`marocchino/sticky-pull-request-comment@v2.9.0`)
9. Jira comment via REST v2 if `JIRA_SITE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` set

## Android E2E (`e2e-android.yml`)

1. Enable KVM udev rule (required for nested virt on GitHub-hosted Ubuntu).
2. Java 17 + Android SDK + Gradle cache.
3. Build debug APK:
   - **Expo:** `npx expo prebuild --platform android` then `./gradlew assembleDebug`
   - **CLI:** `./gradlew assembleDebug`
   - Optional EAS local: commented in template
4. Install Maestro (`get.maestro.mobile.dev`).
5. `reactivecircus/android-emulator-runner@v2.33.0` → `adb install` → `maestro test maestro/flows --format junit --output … --debug-output …`
6. Upload `maestro-results/` (+ `~/.maestro/tests/` if present).

## iOS E2E (`e2e-ios.yml`) — cost

```text
macOS Actions minutes ≫ Linux. Running Maestro iOS on every PR often dominates the bill.
Default: main + nightly + manual. Add pull_request only with path filters / labels if needed.
Prefer Android PR E2E for day-to-day; keep iOS as release gate.
```

Pods cached via `actions/cache@v4.2.0` on `Podfile.lock`.

## Optional EAS (`eas-build.yml`)

- Do **not** add this workflow unless the product ships with EAS.
- Needs `EXPO_TOKEN`. Submit is opt-in via `workflow_dispatch` input.
- Prefer EAS-managed credentials; do not put App Store / Play passwords in YAML.

## Secrets & variables

See README **GitHub Actions secrets**. Minimum for full SDLC comments:

| Name             | Required for                      |
| ---------------- | --------------------------------- |
| `JIRA_SITE_URL`  | Jira comments from CI/E2E         |
| `JIRA_EMAIL`     | Jira basic auth                   |
| `JIRA_API_TOKEN` | Jira basic auth                   |
| `EXPO_TOKEN`     | **Only** if using `eas-build.yml` |

Repo variable: `APP_ID`.

## Common mistakes

1. Running iOS E2E on every PR without accepting macOS cost.
2. Unpinned actions (`@master`).
3. Skipping tokens check → merged drift in `tokens.ts`.
4. Maestro selecting by visible text instead of testIDs (`maestro-e2e` skill).
5. Committing `eas-build.yml` without `EXPO_TOKEN` and wondering why it fails — remove the file instead.
6. Missing `permissions: pull-requests: write` → sticky comment fails.
7. No concurrency → stacked emulator jobs exhaust minutes.

## Done checklist

- [ ] `ci.yml` on PRs with tsc / lint / jest / tokens check
- [ ] `e2e-android.yml` on PRs with artifacts
- [ ] `e2e-ios.yml` on main/nightly/manual with cost comment understood
- [ ] `eas-build.yml` only if team wants EAS
- [ ] Secrets documented; Jira comments optional but wired
- [ ] Action versions pinned; caches + concurrency present
