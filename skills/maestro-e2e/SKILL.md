---
name: maestro-e2e
description: >-
  Maestro E2E conventions for React Native: YAML flows under
  maestro/flows/<feature>/<TC-ID>.yaml, testID-only selectors, reusable
  subflows, env vars, clearState, tags (smoke, regression). Use when writing
  or fixing Maestro flows, mapping Jira TC-IDs to e2e, or before ticket-to-code
  STEP A. Cite Maestro docs; never select by visible text alone.
globs: "**/maestro/**/*.{yaml,yml}"
alwaysApply: false
---

# maestro-e2e

E2E for this kit uses **Maestro** (see **Maestro Flow docs** / cheat sheet). Flows are the executable form of Jira **TC-\*** IDs from `prd-to-jira` / `ticket-to-code`.

## Hard rules

1. **testID selectors only** for assertions and taps that target product UI: `id: "…"`. Do **not** use visible copy (`tapOn: "Login"`) for primary steps — copy changes break CI.
2. Path: `maestro/flows/<feature>/<TC-ID>.yaml` (example: `maestro/flows/login/TC-APP-01.yaml`).
3. One flow file **per** test case ID. Name the flow with `name:` matching the TC title when helpful.
4. Prefer **reusable subflows** under `maestro/flows/_shared/` via `runFlow:`.
5. Always start with a clean slate: `launchApp` + `clearState: true` (unless a later TC intentionally continues state — document why).
6. Tags: every flow has `tags:` including at least one of `smoke` | `regression` (and optional `login`, `android`, `ios`).
7. No secrets in YAML — use `env:` + CI secrets / `.env` injected at runtime.
8. Match `appId` to the real bundle id / applicationId from `app.config` / native projects.

## Layout

```text
maestro/
  flows/
    _shared/
      launch-clean.yaml
      login-as-user.yaml
    login/
      TC-APP-01.yaml          # happy path
      TC-APP-02.yaml          # invalid credentials
    catalog/
      TC-APP-10.yaml
  smoke.yaml                  # optional suite entry (runFlow list) — keep thin
```

## Anatomy of a flow

```yaml
appId: com.example.myapp
name: "TC-APP-01 Login happy path"
tags:
  - smoke
  - login
env:
  E2E_EMAIL: ${E2E_EMAIL}
  E2E_PASSWORD: ${E2E_PASSWORD}
---
- runFlow:
    file: ../_shared/launch-clean.yaml
- tapOn:
    id: login-email
- inputText: ${E2E_EMAIL}
- tapOn:
    id: login-password
- inputText: ${E2E_PASSWORD}
- tapOn:
    id: login-submit
- assertVisible:
    id: home-root
- assertNotVisible:
    id: login-error
```

### Shared launch (clearState + permissions)

```yaml
# maestro/flows/_shared/launch-clean.yaml
appId: com.example.myapp
---
- launchApp:
    clearState: true
    clearKeychain: true
    permissions:
      notifications: deny
      all: deny
```

Grant only what the TC needs (`camera: allow`, etc.). Prefer denying by default to catch missing permission UX.

## Selector conventions

| Do                                                          | Don't                           |
| ----------------------------------------------------------- | ------------------------------- |
| `tapOn: { id: "login-submit" }`                             | `tapOn: "Sign in"`              |
| `assertVisible: { id: "home-root" }`                        | `assertVisible: "Welcome back"` |
| `scrollUntilVisible: { element: { id: "product-row-42" } }` | Scroll blindly then tap text    |
| `inputText` after focusing via `tapOn: { id }`              | Assume keyboard focus           |

RN: set `testID` on components (Android `resource-id` / iOS accessibility id — Maestro `id:` maps to these). Keep IDs stable; never reuse across unrelated screens.

## Commands to prefer

- `assertVisible` / `assertNotVisible` with `id:`
- `tapOn: { id: }`
- `inputText` (after tap on field)
- `scrollUntilVisible` with `element: { id: }`
- `extendedWaitUntil` for slow network (prefer fixing loading `testID`s over huge sleeps)
- `waitForAnimationToEnd` after navigations
- `runFlow` for login/setup subflows
- `eraseText` when re-typing in the same field

Avoid AI assert helpers in CI-critical smoke paths unless optional.

## Tags

| Tag          | Meaning                               |
| ------------ | ------------------------------------- |
| `smoke`      | Must pass on every PR / main build    |
| `regression` | Broader suite (nightly / pre-release) |
| feature tags | `login`, `checkout`, …                |

```bash
maestro test maestro/flows/login/TC-APP-01.yaml
maestro test --include-tags smoke maestro/flows
```

## Examples

### Login (happy path) — `maestro/flows/login/TC-APP-01.yaml`

```yaml
appId: com.example.myapp
name: "TC-APP-01 Login success"
tags: [smoke, login]
env:
  E2E_EMAIL: ${E2E_EMAIL}
  E2E_PASSWORD: ${E2E_PASSWORD}
---
- runFlow: { file: ../_shared/launch-clean.yaml }
- assertVisible: { id: login-root }
- tapOn: { id: login-email }
- inputText: ${E2E_EMAIL}
- tapOn: { id: login-password }
- inputText: ${E2E_PASSWORD}
- tapOn: { id: login-submit }
- assertVisible: { id: home-root }
- assertNotVisible: { id: login-error }
```

### Login error — `TC-APP-02.yaml`

```yaml
appId: com.example.myapp
name: "TC-APP-02 Login invalid credentials"
tags: [regression, login]
---
- runFlow: { file: ../_shared/launch-clean.yaml }
- tapOn: { id: login-email }
- inputText: "bad@example.com"
- tapOn: { id: login-password }
- inputText: "not-the-password"
- tapOn: { id: login-submit }
- assertVisible: { id: login-error }
- assertVisible: { id: login-root }
- assertNotVisible: { id: home-root }
```

### List + scroll — `maestro/flows/catalog/TC-APP-10.yaml`

```yaml
appId: com.example.myapp
name: "TC-APP-10 Open product from list"
tags: [regression, catalog]
---
- runFlow: { file: ../_shared/login-as-user.yaml }
- assertVisible: { id: catalog-list }
- scrollUntilVisible:
    element:
      id: product-row-premium
    direction: DOWN
    timeout: 15000
- tapOn: { id: product-row-premium }
- assertVisible: { id: product-detail-root }
```

### Form validation — `maestro/flows/profile/TC-APP-20.yaml`

```yaml
appId: com.example.myapp
name: "TC-APP-20 Profile email validation"
tags: [regression, profile]
---
- runFlow: { file: ../_shared/login-as-user.yaml }
- tapOn: { id: tab-profile }
- tapOn: { id: profile-email }
- eraseText
- inputText: "not-an-email"
- tapOn: { id: profile-save }
- assertVisible: { id: profile-email-error }
- assertNotVisible: { id: profile-save-success }
```

### Error / empty state — `maestro/flows/catalog/TC-APP-11.yaml`

```yaml
appId: com.example.myapp
name: "TC-APP-11 Catalog empty state"
tags: [regression, catalog]
env:
  E2E_FORCE_EMPTY_CATALOG: "1"
---
- runFlow: { file: ../_shared/launch-clean.yaml }
# App reads launch arg / env via detox-less stub or mock server — document in ticket
- assertVisible: { id: catalog-empty }
- assertNotVisible: { id: catalog-list }
- assertVisible: { id: catalog-retry }
```

## Permissions

```yaml
- launchApp:
    clearState: true
    permissions:
      notifications: allow
      camera: deny
      location: unset
```

After a deny, assert the in-app fallback (`id: permission-denied-banner`), not the OS dialog text.

## Naming

| Artifact       | Pattern                                           |
| -------------- | ------------------------------------------------- |
| Feature folder | `kebab-case` matching Jira story slug / feature   |
| Flow file      | `TC-<PROJECT>-<nn>.yaml` exact ticket TC id       |
| testIDs        | `screen-element` kebab (same as Jira ticket list) |
| Subflows       | `_shared/<verb>-<noun>.yaml`                      |

## Common mistakes

1. Selecting by visible string → flakes on copy/i18n.
2. Missing `clearState` → order-dependent passes.
3. One YAML covering many TC-IDs → impossible to map to Jira.
4. Hardcoding passwords in the repo.
5. Asserting too early without waiting for `id: *-loading` to disappear.
6. Editing the flow to match buggy UI instead of fixing the app (**ticket-to-code** forbids this unless AC changed).

## Done checklist

- [ ] Path `maestro/flows/<feature>/<TC-ID>.yaml`
- [ ] `tags` include smoke and/or regression
- [ ] Only `id:` selectors for product UI
- [ ] `clearState` (or documented exception)
- [ ] Subflows used for login/setup
- [ ] Env vars for credentials
- [ ] Matches testIDs listed on the Jira ticket
